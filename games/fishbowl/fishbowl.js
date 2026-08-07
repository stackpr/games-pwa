// Fishbowl: everyone answers one question, the answers go in a bowl, and
// the players take turns getting the rest to say them over three rounds.
// Rules, edge cases and the shape of the saved state are in _README.md.
(function () {
  const STORAGE_KEY = 'games.fishbowl.v1';
  const MIN_TEAMS = 2;
  const MAX_TEAMS = 6;
  const ANSWERS = [1, 2, 3, 4, 5];
  const DEFAULT_ANSWERS = 3;
  const SECONDS = [30, 45, 60, 90];
  const DEFAULT_SECONDS = 60;
  const MAX_ANSWER = 40;
  const MAX_NAME = 16;
  const MODES = ['teams', 'solo'];

  // Three passes over the same slips, each leaving less to say than the last.
  const ROUNDS = [
    { name: 'Describe it', hint: 'Say anything except the words on the slip.' },
    { name: 'One word', hint: 'One word, said once. Nothing else.' },
    { name: 'Act it out', hint: 'No words at all.' }
  ];

  // Questions that produce answers a table can actually play with: concrete,
  // widely known, and short enough to fit a slip. See _README.md.
  const QUESTIONS = [
    'A famous person, alive or dead',
    'A film or TV show',
    'An animal',
    'Something in this room',
    'A food or drink',
    'A place in the world',
    'A song everybody knows',
    'A job someone could have',
    'A book or a story',
    'Something you would take on holiday'
  ];

  const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'div');
  }

  // A service worker can pair one release's markup with the next release's
  // script, and one missing control must cost that control rather than the
  // whole page. See CLAUDE.md.
  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  const el = {
    questions: pick('questions'),
    questionOwn: pick('question-own', 'input'),
    modeRow: pick('mode-row'),
    teamsRow: pick('teams-row'),
    answersRow: pick('answers-row'),
    uniqueRow: pick('unique-row'),
    secsRow: pick('secs-row'),
    begin: pick('begin', 'button'),
    writeWho: pick('write-who', 'h1'),
    writeQ: pick('write-q', 'p'),
    writeNote: pick('write-note', 'p'),
    whoName: pick('who-name', 'input'),
    recentNames: pick('recent-names', 'datalist'),
    slips: pick('slips'),
    bowlCount: pick('bowl-count', 'p'),
    nextPlayer: pick('next-player', 'button'),
    noMore: pick('no-more', 'button'),
    readyWho: pick('ready-who', 'p'),
    readySub: pick('ready-sub', 'p'),
    start: pick('start', 'button'),
    playWho: pick('play-who', 'span'),
    clock: pick('clock', 'span'),
    tally: pick('tally', 'span'),
    cardCat: pick('card-cat', 'span'),
    word: pick('word', 'span'),
    whoGrid: pick('who-grid'),
    whoSkip: pick('who-skip', 'button'),
    pass: pick('pass', 'button'),
    got: pick('got', 'button'),
    betweenLabel: pick('between-label', 'p'),
    betweenTitle: pick('between-title', 'h1'),
    betweenSub: pick('between-sub', 'p'),
    betweenBoard: pick('between-board', 'ol'),
    carryOn: pick('carry-on', 'button'),
    overWho: pick('over-who', 'p'),
    overScore: pick('over-score', 'p'),
    overBoard: pick('over-board', 'ol'),
    again: pick('again', 'button'),
    setupBtn: pick('setup-btn', 'button'),
    settings: pick('settings'),
    settingsBtn: pick('settings-btn', 'button'),
    namesLabel: pick('names-label', 'p'),
    teamNames: pick('team-names'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  let slipInputs = [];
  let state = load();
  let clock = null;

  /* ---- state ----------------------------------------------------------- */

  function clamp(n, lo, hi, fallback) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  }

  function text(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  /** A new game, keeping whatever settings it is handed. */
  function fresh(from) {
    const old = from || {};
    const teams = clamp(old.teams, MIN_TEAMS, MAX_TEAMS, MIN_TEAMS);
    return {
      phase: 'setup',
      mode: MODES.indexOf(old.mode) !== -1 ? old.mode : MODES[0],
      question: text(old.question, 60) || QUESTIONS[0],
      teams,
      answers: ANSWERS.indexOf(old.answers) !== -1 ? old.answers : DEFAULT_ANSWERS,
      unique: old.unique !== false,
      seconds: SECONDS.indexOf(old.seconds) !== -1 ? old.seconds : DEFAULT_SECONDS,
      names: Array.from({ length: teams }, (_, i) => text(old.names && old.names[i], MAX_NAME)),
      players: [],       // one name per player who has filled the bowl
      scores: [],        // one per seat, sized by the mode
      slips: [],
      left: [],          // slips still in the bowl this round
      aside: [],         // passed this turn; back in the bowl when it ends
      hand: -1,          // the slip being given, or -1
      round: 0,
      turn: 0,
      gained: 0,
      between: 'turn',   // which pause the between screen is showing
      why: ''
    };
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    if (!p) return fresh();
    const slips = Array.isArray(p.slips)
      ? p.slips.map(s => text(s, MAX_ANSWER)).filter(Boolean) : [];
    const inBowl = n => Number.isInteger(n) && n >= 0 && n < slips.length;
    const s = Object.assign(fresh(p), {
      phase: ['setup', 'write', 'ready', 'play', 'between', 'over']
        .indexOf(p.phase) >= 0 ? p.phase : 'setup',
      players: Array.isArray(p.players) ? p.players.map(n => text(n, MAX_NAME)) : [],
      slips,
      left: Array.isArray(p.left) ? p.left.filter(inBowl) : [],
      aside: Array.isArray(p.aside) ? p.aside.filter(inBowl) : [],
      hand: inBowl(p.hand) ? p.hand : -1,
      round: clamp(p.round, 0, ROUNDS.length - 1, 0),
      gained: clamp(p.gained, 0, 999, 0),
      between: p.between === 'round' ? 'round' : 'turn',
      why: text(p.why, 80)
    });
    const n = seatCount(s);
    s.scores = Array.from({ length: n }, (_, i) =>
      Number.isInteger(p.scores && p.scores[i]) ? p.scores[i] : 0);
    s.turn = clamp(p.turn, 0, Math.max(0, n - 1), 0);
    // A turn cannot be resumed: the clock stopped while the page was gone
    // and there is no honest time to restart it with. The points already
    // scored stand, everything in hand goes back in the bowl, and the turn
    // is spent. See _README.md.
    if (s.phase === 'play') {
      s.left = s.left.concat(s.aside, s.hand >= 0 ? [s.hand] : []);
      s.aside = [];
      s.hand = -1;
      s.turn = n ? (s.turn + 1) % n : 0;
      s.between = 'turn';
      s.why = '';
      s.phase = 'between';
    }
    if (s.phase !== 'setup' && !s.slips.length) return fresh(s);
    return s;
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  /* ---- seats ----------------------------------------------------------- */

  /**
   * Who the scores belong to: the teams, or the people who filled the bowl.
   * The second mode needs no player count setting — the bowl already knows
   * how many there are. See _README.md.
   */
  function seatCount(s) {
    return s.mode === 'teams' ? s.teams : s.players.length;
  }

  const seats = () => seatCount(state);

  function seatName(i) {
    if (state.mode === 'teams') return state.names[i] || 'Team ' + (i + 1);
    return state.players[i] || 'Player ' + (i + 1);
  }

  function seatNames() {
    return Array.from({ length: seats() }, (_, i) => seatName(i));
  }

  /** Scores follow the seats, which move when the mode or the count does. */
  function syncSeats() {
    const want = seats();
    if (state.scores.length === want) return;
    const kept = state.scores.slice(0, want);
    state.scores = Array.from({ length: want }, (_, i) => kept[i] || 0);
    if (state.turn >= want) state.turn = 0;
  }

  const round = () => ROUNDS[state.round] || ROUNDS[0];

  /* ---- filling the bowl ------------------------------------------------ */

  function buildSlipInputs() {
    el.slips.textContent = '';
    slipInputs = [];
    for (let i = 0; i < state.answers; i++) {
      const input = document.createElement('input');
      input.className = 'slip-input';
      input.type = 'text';
      input.maxLength = MAX_ANSWER;
      input.autocomplete = 'off';
      input.setAttribute('autocapitalize', 'sentences');
      input.placeholder = (ORDINALS[i] || (i + 1) + 'th') + ' answer';
      input.setAttribute('aria-label', 'Answer ' + (i + 1));
      input.addEventListener('input', paintWriteActions);
      slipInputs.push(input);
      el.slips.append(input);
    }
  }

  /** The answers as typed, trimmed. */
  function typed() {
    return slipInputs.map(input => text(input.value, MAX_ANSWER));
  }

  function clearSlips() {
    for (const input of slipInputs) input.value = '';
    el.whoName.value = '';
  }

  /**
   * Takes the answers on screen if they are all there — and, when repeats
   * are barred, if they are all new. Returns true if they went in the bowl.
   */
  function takeSlips(quiet) {
    const answers = typed();
    if (!answers.length || answers.some(a => !a)) {
      if (!quiet) say(state.answers + (state.answers === 1 ? ' answer' : ' answers') + ', please.');
      return false;
    }
    if (state.unique) {
      const seen = new Set(state.slips.map(s => s.toLowerCase()));
      for (const answer of answers) {
        const key = answer.toLowerCase();
        if (seen.has(key)) {
          if (!quiet) say('“' + answer + '” is already in the bowl.');
          return false;
        }
        seen.add(key);
      }
    }
    state.slips.push(...answers);
    state.players.push(text(el.whoName.value, MAX_NAME));
    if (state.mode === 'solo') Names.remember(state.players.filter(Boolean));
    syncSeats();
    clearSlips();
    save();
    return true;
  }

  function say(message) {
    el.bowlCount.textContent = message;
  }

  function paintBowlCount() {
    const n = state.slips.length;
    const who = state.players.length;
    // Nothing to report before the first player has finished, and a line
    // saying the bowl is empty while somebody fills it reads as a fault.
    el.bowlCount.textContent = n
      ? n + (n === 1 ? ' slip' : ' slips') + ' in the bowl, from '
        + who + (who === 1 ? ' player' : ' players')
      : '';
  }

  /**
   * Next player wants a full form; No more players wants a bowl. The first
   * player can do both at once, which is why this looks at the form as well
   * as at how many have finished.
   */
  function paintWriteActions() {
    const full = slipInputs.length > 0 && typed().every(Boolean);
    el.nextPlayer.disabled = !full;
    el.noMore.disabled = state.players.length === 0 && !full;
  }

  /* ---- the bowl -------------------------------------------------------- */

  function refill() {
    state.left = state.slips.map((_, i) => i);
    state.aside = [];
    state.hand = -1;
  }

  /** Draws the next slip, or leaves the hand empty when the bowl is dry. */
  function drawSlip() {
    if (!state.left.length) {
      state.hand = -1;
      return false;
    }
    const at = Math.floor(Math.random() * state.left.length);
    state.hand = state.left.splice(at, 1)[0];
    return true;
  }

  /* ---- the game -------------------------------------------------------- */

  function setScreen(phase) {
    state.phase = phase;
    document.body.dataset.screen = phase;
  }

  function beginGame() {
    const question = text(el.questionOwn.value, 60) || state.question;
    state = fresh(Object.assign({}, state, { question }));
    buildSlipInputs();
    clearSlips();
    setScreen('write');
    save();
    render();
    paintBowlCount();
  }

  function startPlaying() {
    refill();
    state.round = 0;
    state.turn = 0;
    state.scores = Array(seats()).fill(0);
    setScreen('ready');
    save();
    render();
  }

  function startTurn() {
    if (state.phase !== 'ready') return;
    state.gained = 0;
    state.aside = [];
    if (!drawSlip()) return endRound();
    setScreen('play');
    save();
    render();
    clock.start();
  }

  /**
   * A slip is given. A team takes the point itself; scoring by name gives it
   * to whoever got it *and* to the player giving the clues, which is what
   * makes getting through to anybody worth doing. See _README.md.
   */
  function got(seat) {
    if (state.phase !== 'play') return;
    state.gained += 1;
    if (state.mode === 'teams' || !Number.isInteger(seat)) {
      state.scores[state.turn] += 1;
    } else {
      state.scores[seat] += 1;
      state.scores[state.turn] += 1;
    }
    nextSlip();
  }

  /**
   * On to the next slip, or out of the turn. An empty bowl only ends the
   * round when nothing was passed either — slips set aside are still in
   * play, they are just not available until the turn is over.
   */
  function nextSlip() {
    if (drawSlip()) {
      save();
      render();
      return;
    }
    if (state.aside.length) return endTurn('The bowl is empty.');
    endRound();
  }

  function passSlip() {
    if (state.phase !== 'play' || state.hand < 0) return;
    // Set aside rather than dropped back in, so a slip nobody can give
    // cannot come round again inside the same turn. It returns to the bowl
    // when the turn ends. See _README.md.
    state.aside.push(state.hand);
    state.hand = -1;
    nextSlip();
  }

  /** The clock ran out, or the bowl emptied mid-turn. */
  function endTurn(why) {
    if (state.phase !== 'play') return;
    clock.stop();
    returnHand();
    state.turn = (state.turn + 1) % seats();
    state.between = 'turn';
    state.why = why || '';
    setScreen('between');
    save();
    render();
  }

  function returnHand() {
    if (state.hand >= 0) state.left.push(state.hand);
    state.left = state.left.concat(state.aside);
    state.aside = [];
    state.hand = -1;
  }

  function endRound() {
    clock.stop();
    returnHand();
    if (state.round >= ROUNDS.length - 1) {
      setScreen('over');
      save();
      render();
      return;
    }
    state.round += 1;
    refill();
    state.turn = (state.turn + 1) % seats();
    state.between = 'round';
    state.why = '';
    setScreen('between');
    save();
    render();
  }

  function carryOn() {
    if (state.phase !== 'between') return;
    setScreen('ready');
    save();
    render();
  }

  /* ---- rendering ------------------------------------------------------- */

  // The panel owns what the two scoring modes look like: the name buttons,
  // the board, and which of the two action rows the turn gets. It is the
  // same interface as Star Words'. See js/lib/guess.js.
  const panel = GuessPanel.create({
    el: {
      whoGrid: el.whoGrid, whoSkip: el.whoSkip, board: el.betweenBoard,
      got: el.got, skip: el.pass, tally: el.tally
    },
    onScore: (points, seat) => (points ? got(seat) : passSlip())
  });

  /**
   * The between screen covers two different pauses — a turn ending and a
   * round ending — because they want the same thing from the table: read
   * the scores, pass the phone, tap on.
   */
  function paintBetween() {
    const roundOver = state.between === 'round';
    const why = typeof state.why === 'string' ? state.why : '';
    el.betweenLabel.textContent = roundOver ? 'Round over' : 'Turn over';
    el.betweenTitle.textContent = roundOver
      ? 'Bowl empty!' : (state.gained ? '+' + state.gained : 'Time!');
    el.betweenSub.textContent = roundOver
      ? 'Next up: ' + round().name + '. ' + round().hint
      : (why ? why + ' ' : '') + 'Pass the phone to ' + seatName(state.turn) + '.';
    el.carryOn.textContent = roundOver ? 'Start ' + round().name : 'Next up';
  }

  /** The final board is the same board with nobody up. */
  function paintOverBoard() {
    el.overBoard.textContent = '';
    for (const row of el.betweenBoard.children) {
      const copy = row.cloneNode(true);
      delete copy.dataset.up;
      el.overBoard.append(copy);
    }
  }

  function paintSetup() {
    const own = text(el.questionOwn.value, 60);
    for (const btn of el.questions.querySelectorAll('.cat')) {
      btn.setAttribute('aria-pressed', String(!own && btn.dataset.q === state.question));
    }
    for (const btn of el.modeRow.querySelectorAll('.pick')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.mode));
    }
    for (const btn of el.teamsRow.querySelectorAll('.count')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.teams) === state.teams));
    }
    for (const btn of el.answersRow.querySelectorAll('.count')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.answers) === state.answers));
    }
    for (const btn of el.uniqueRow.querySelectorAll('.pick')) {
      btn.setAttribute('aria-pressed', String((btn.dataset.unique === '1') === state.unique));
    }
    for (const btn of el.secsRow.querySelectorAll('.count')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.secs) === state.seconds));
    }
  }

  function render() {
    document.body.dataset.screen = state.phase;
    syncSeats();
    paintSetup();

    el.writeWho.textContent = 'Player ' + (state.players.length + 1);
    el.writeQ.textContent = state.question;
    el.writeNote.textContent = state.answers
      + (state.answers === 1 ? ' answer' : ' answers')
      + ', then pass the phone on. Nobody else should be looking.';
    paintWriteActions();

    el.readyWho.textContent = seatName(state.turn);
    const left = state.left.length + state.aside.length + (state.hand >= 0 ? 1 : 0);
    el.readySub.textContent = 'Round ' + (state.round + 1) + ' of ' + ROUNDS.length
      + ' — ' + round().name + '. ' + round().hint
      + ' ' + left + (left === 1 ? ' slip left.' : ' slips left.');

    el.playWho.textContent = seatName(state.turn);
    el.cardCat.textContent = round().name;
    el.word.textContent = state.hand >= 0 ? state.slips[state.hand] : '';

    // The panel sets body[data-mode], so it is rendered on every screen and
    // not only during a turn — the setup screen shows and hides the team
    // count off the same attribute.
    panel.render({
      mode: state.mode,
      names: seatNames(),
      scores: state.scores,
      present: state.turn,
      tally: state.gained,
      up: [state.turn]
    });
    paintBetween();
    paintOverBoard();

    const best = state.scores.length ? Math.max(...state.scores) : 0;
    const winners = state.scores
      .map((score, i) => ({ score, i })).filter(r => r.score === best);
    el.overWho.textContent = winners.length > 1 && best > 0
      ? 'A tie' : seatName(winners[0] ? winners[0].i : 0);
    el.overScore.textContent = String(best);

    paintNameFields();
  }

  /**
   * Names, in the settings dialog: the teams in one mode and the players in
   * the other. Rebuilt only when the number of boxes changes, so typing in
   * one does not pull the cursor out of it.
   */
  function paintNameFields() {
    const n = seats();
    el.namesLabel.textContent = state.mode === 'teams' ? 'Team names' : 'Player names';
    const rows = el.teamNames.querySelectorAll('.team-row');
    if (rows.length === n) {
      rows.forEach((row, i) => {
        const input = row.querySelector('input');
        row.querySelector('span').textContent = fallbackName(i);
        input.placeholder = fallbackName(i);
        if (document.activeElement !== input) input.value = storedName(i);
      });
      return;
    }
    el.teamNames.textContent = '';
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'team-row';
      const label = document.createElement('span');
      label.textContent = fallbackName(i);
      const input = document.createElement('input');
      input.className = 'name-input';
      input.type = 'text';
      input.maxLength = MAX_NAME;
      input.value = storedName(i);
      input.placeholder = fallbackName(i);
      input.setAttribute('aria-label', 'Name for ' + fallbackName(i));
      input.addEventListener('input', () => {
        const value = text(input.value, MAX_NAME);
        if (state.mode === 'teams') state.names[i] = value;
        else state.players[i] = value;
        save();
        paintNamesOnly();
      });
      row.append(label, input);
      el.teamNames.append(row);
    }
  }

  const fallbackName = i => (state.mode === 'teams' ? 'Team ' : 'Player ') + (i + 1);
  const storedName = i =>
    (state.mode === 'teams' ? state.names[i] : state.players[i]) || '';

  /** A name shows in four places; changing it must not redraw the form. */
  function paintNamesOnly() {
    el.readyWho.textContent = seatName(state.turn);
    el.playWho.textContent = seatName(state.turn);
    panel.render({ names: seatNames() });
    paintBetween();
    paintOverBoard();
  }

  function paintRecentNames() {
    el.recentNames.textContent = '';
    for (const known of Names.recent()) {
      const option = document.createElement('option');
      option.value = known;
      el.recentNames.append(option);
    }
  }

  /* ---- building -------------------------------------------------------- */

  function buildQuestions() {
    el.questions.textContent = '';
    for (const question of QUESTIONS) {
      const btn = document.createElement('button');
      btn.className = 'cat';
      btn.type = 'button';
      btn.dataset.q = question;
      btn.textContent = question;
      btn.title = question;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        state.question = question;
        el.questionOwn.value = '';
        save();
        render();
      });
      el.questions.append(btn);
    }
  }

  function countButton(row, key, value, label, press) {
    const btn = document.createElement('button');
    btn.className = 'count';
    btn.type = 'button';
    btn.dataset[key] = String(value);
    btn.textContent = label;
    btn.addEventListener('click', press);
    row.append(btn);
    return btn;
  }

  function buildCounts() {
    el.teamsRow.textContent = '';
    for (let n = MIN_TEAMS; n <= MAX_TEAMS; n++) {
      countButton(el.teamsRow, 'teams', n, String(n), () => {
        state = fresh(Object.assign({}, state, { teams: n }));
        save();
        render();
      }).setAttribute('aria-label', n + ' teams');
    }
    el.answersRow.textContent = '';
    for (const n of ANSWERS) {
      countButton(el.answersRow, 'answers', n, String(n), () => {
        state.answers = n;
        buildSlipInputs();
        save();
        render();
      }).setAttribute('aria-label', n + (n === 1 ? ' answer' : ' answers') + ' each');
    }
    el.secsRow.textContent = '';
    for (const secs of SECONDS) {
      countButton(el.secsRow, 'secs', secs, secs + 's', () => {
        state.seconds = secs;
        clock = makeClock();
        save();
        render();
      });
    }
    for (const btn of el.modeRow.querySelectorAll('.pick')) {
      btn.addEventListener('click', () => {
        state = fresh(Object.assign({}, state, { mode: btn.dataset.mode }));
        save();
        render();
      });
    }
    for (const btn of el.uniqueRow.querySelectorAll('.pick')) {
      btn.addEventListener('click', () => {
        state.unique = btn.dataset.unique === '1';
        save();
        render();
      });
    }
  }

  function makeClock() {
    const t = Timer.create(el.clock, {
      seconds: state.seconds,
      onEnd: () => endTurn('')
    });
    // A stopped clock shows the turn length, so changing it is visible
    // before anybody starts one.
    t.reset();
    return t;
  }

  /* ---- wiring ---------------------------------------------------------- */

  on(el.questionOwn, 'input', () => {
    const own = text(el.questionOwn.value, 60);
    if (own) state.question = own;
    paintSetup();
    el.writeQ.textContent = state.question;
  });

  on(el.begin, 'click', beginGame);
  on(el.nextPlayer, 'click', () => {
    if (takeSlips()) {
      render();
      paintBowlCount();
      paintRecentNames();
      if (slipInputs[0]) slipInputs[0].focus();
    }
  });
  on(el.noMore, 'click', () => {
    if (!state.players.length && !typed().every(Boolean)) return;
    // A part-filled form at this point is somebody who changed their mind,
    // not an answer; only a full one is taken. See _README.md.
    if (typed().some(Boolean)) takeSlips(true);
    if (!state.slips.length) return;
    // Scoring by name needs somebody to name: one player has nobody to give
    // clues to, and the buttons would have nothing on them.
    if (state.mode === 'solo' && state.players.length < 2) {
      return say('Two players at least, to score by name.');
    }
    clearSlips();
    startPlaying();
  });
  on(el.start, 'click', startTurn);
  on(el.carryOn, 'click', carryOn);
  on(el.again, 'click', () => {
    // Same settings, same question, a fresh bowl — the answers are spent
    // once everyone has heard them three times.
    state = fresh(state);
    buildSlipInputs();
    clearSlips();
    setScreen('write');
    save();
    render();
    paintBowlCount();
  });
  on(el.setupBtn, 'click', () => {
    clock.stop();
    state = fresh(state);
    setScreen('setup');
    save();
    render();
  });

  Modal.create(el.settings, { trigger: el.settingsBtn });
  Modal.create(el.rules, { trigger: el.rulesBtn });

  buildQuestions();
  buildCounts();
  buildSlipInputs();
  paintRecentNames();
  clock = makeClock();
  document.body.dataset.screen = state.phase;
  render();
  paintBowlCount();
  // load() can rule a turn spent, so what is on screen and what is in
  // storage have to be squared up before anything else touches either.
  save();
})();
