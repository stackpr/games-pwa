// Somewhere Between: one hidden target, one typed clue, everyone guesses.
// See _README.md for the rules and the naming note.
(function () {
  const STORAGE_KEY = 'games.somewhere-between.v1';
  // Half-widths of the scoring bands, as a percentage of the whole scale.
  // 4 points is a narrow bullseye; 2 is generous enough that a sensible
  // clue is nearly always worth something.
  const BANDS = [
    { points: 4, half: 4 },
    { points: 3, half: 9 },
    { points: 2, half: 16 }
  ];
  // The target never sits against an end, where half its band would fall off
  // the scale and the round would be unwinnable at full marks.
  const EDGE = 18;

  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'span');
  }

  const el = {
    body: document.body,
    setupBtn: pick('setup-btn', 'button'),
    modeRow: pick('mode-row'),
    countRow: pick('count-row'),
    begin: pick('begin', 'button'),
    nameModeRow: pick('name-mode-row'),
    nameInputs: pick('name-inputs'),
    recentList: pick('recent-list'),
    readyWho: pick('ready-who'),
    readySub: pick('ready-sub'),
    start: pick('start', 'button'),
    playWho: pick('play-who'),
    roundNo: pick('round-no'),
    scoreSoFar: pick('score-so-far'),
    clueLabel: pick('clue-label'),
    clueSaid: pick('clue-said'),
    clueInput: pick('clue-input', 'input'),
    endLeft: pick('end-left'),
    endRight: pick('end-right'),
    track: pick('track'),
    band2: pick('band-2'),
    band3: pick('band-3'),
    band4: pick('band-4'),
    target: pick('target'),
    guess: pick('guess'),
    grab: pick('grab'),
    dialHint: pick('dial-hint'),
    tallyList: pick('tally-list'),
    newScale: pick('new-scale', 'button'),
    lock: pick('lock', 'button'),
    overLabel: pick('over-label'),
    overScore: pick('over-score'),
    board: pick('board'),
    next: pick('next', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  const saved = Store.load(STORAGE_KEY) || {};
  const settings = PartySetup.shape(saved.settings, [60]);
  let party = Party.shape(saved.party);
  let scales = [];
  let scaleAt = 0;
  let scale = null;

  // One round's worth of state. None of it is persisted: a round caught
  // halfway has a clue somebody has already read out and markers half the
  // table has placed, and there is nothing honest to resume.
  let target = 50;
  let clue = '';
  let responders = [];    // seats that guess, in order
  let at = 0;             // whose turn it is among them
  let answers = [];       // { seat, value, points }
  let guess = 50;
  /*
   * The seat that wrote this round's clue, captured rather than derived.
   * `Party.roles()` reads the round counter, and the counter moves on at the
   * moment the round is paid out — so everything the reveal shows would
   * otherwise be credited to the next player.
   */
  let clueGiver = 0;

  function save() {
    Store.save(STORAGE_KEY, { settings, party });
  }

  function screen(name) {
    el.body.dataset.screen = name;
  }

  function phase(name) {
    el.body.dataset.phase = name;
  }

  /**
   * Seats follow the settings the moment they change, rather than at Start.
   * A name typed into setup has to land on the party that will actually
   * play, and rebuilding at Start threw those names away.
   */
  function syncSeats() {
    const want = settings.mode === 'teams' ? Party.TEAMS : settings.players;
    if (party.mode === settings.mode && party.scores.length === want) return;
    const kept = party.mode === settings.mode ? party.names.slice() : [];
    party = Party.blank(settings.mode, settings.players);
    for (let i = 0; i < party.names.length; i++) {
      if (kept[i]) party.names[i] = kept[i];
    }
  }

  const setup = PartySetup.create({
    el: {
      modeRow: el.modeRow, countRow: el.countRow, begin: el.begin,
      nameModeRow: el.nameModeRow, nameInputs: el.nameInputs,
      recentList: el.recentList
    },
    seconds: [60],
    settings,
    onChange: () => { syncSeats(); save(); },
    names: () => party.names
  });

  function seatName(i) {
    return Party.nameAt(party, i);
  }

  function seatToken(i) {
    return party.mode === 'teams' ? String(i + 1) : '';
  }

  function giver() {
    return clueGiver;
  }

  /**
   * Everybody who is not giving the clue. `Party.guessers` returns nothing in
   * teams mode, which is right for the games that score one named guesser —
   * here the other team is a responder like any other, so this asks directly.
   */
  function responderSeats() {
    const present = giver();
    return party.scores.map((_, i) => i).filter(i => i !== present);
  }

  /** Points for a guess: the narrowest band it falls inside, or nothing. */
  function scoreFor(g) {
    const off = Math.abs(g - target);
    for (const band of BANDS) {
      if (off <= band.half) return band.points;
    }
    return 0;
  }

  function dealScale() {
    if (scaleAt >= scales.length) {
      scales = Vocab.spectrums();
      scaleAt = 0;
    }
    scale = scales[scaleAt++] || { left: 'Cold', right: 'Hot' };
    target = EDGE + Math.random() * (100 - 2 * EDGE);
    clue = '';
    answers = [];
    at = 0;
    guess = 50;
    responders = responderSeats();
    el.clueInput.value = '';
    phase('clue');
    renderScale();
  }

  function place(node, percent) {
    node.style.left = percent + '%';
  }

  function renderScale() {
    el.endLeft.textContent = scale.left;
    el.endRight.textContent = scale.right;

    for (const band of BANDS) {
      const node = band.points === 4 ? el.band4 : band.points === 3 ? el.band3 : el.band2;
      const from = Math.max(0, target - band.half);
      const to = Math.min(100, target + band.half);
      node.style.left = from + '%';
      node.style.width = (to - from) + '%';
      node.style.borderRadius = band.points === 2 ? '999px' : '0';
    }
    place(el.target, target);
    renderGuess();
    renderPhase();
  }

  function renderGuess() {
    place(el.guess, guess);
    place(el.grab, guess);
    // aria-valuetext, not aria-valuenow alone: a screen reader saying "62"
    // would hand over the number the sighted players deliberately do not get.
    el.track.setAttribute('aria-valuenow', String(Math.round(guess)));
    el.track.setAttribute('aria-valuetext', describe(guess));
  }

  function describe(g) {
    if (g < 10) return 'hard against ' + scale.left;
    if (g < 30) return 'well towards ' + scale.left;
    if (g < 45) return 'a little towards ' + scale.left;
    if (g <= 55) return 'halfway';
    if (g <= 70) return 'a little towards ' + scale.right;
    if (g <= 90) return 'well towards ' + scale.right;
    return 'hard against ' + scale.right;
  }

  /** Everyone's marker, drawn only once the round is done. */
  function renderAnswers() {
    for (const old of el.track.querySelectorAll('.said')) old.remove();
    if (el.body.dataset.phase !== 'reveal') return;
    for (const answer of answers) {
      const mark = document.createElement('span');
      mark.className = 'said';
      mark.dataset.seat = String(answer.seat);
      mark.style.left = answer.value + '%';
      const tag = document.createElement('span');
      tag.className = 'said-tag';
      tag.textContent = seatName(answer.seat);
      mark.append(tag);
      el.track.append(mark);
    }
  }

  function renderTally() {
    el.tallyList.textContent = '';
    if (el.body.dataset.phase !== 'reveal') return;
    for (const answer of answers) {
      const li = document.createElement('li');
      li.dataset.seat = String(answer.seat);
      if (!answer.points) li.dataset.zero = '';
      li.textContent = seatName(answer.seat) + ' +' + answer.points;
      el.tallyList.append(li);
    }
    const total = answers.reduce((n, a) => n + a.points, 0);
    const li = document.createElement('li');
    li.dataset.giver = '';
    li.textContent = seatName(giver()) + ' +' + total;
    el.tallyList.append(li);
  }

  function renderPhase() {
    const mode = el.body.dataset.phase;
    el.clueSaid.textContent = clue;
    el.playWho.textContent = mode === 'guess'
      ? seatName(responders[at]) : seatName(giver());

    if (mode === 'clue') {
      el.clueLabel.textContent = 'Your clue';
      el.dialHint.textContent = 'Only you can see the target.';
      el.lock.textContent = 'Pass it on';
      el.lock.disabled = !el.clueInput.value.trim();
    } else if (mode === 'guess') {
      el.clueLabel.textContent = 'The clue';
      el.dialHint.textContent = seatName(responders[at]) + ', drag your marker.';
      el.lock.textContent = at === responders.length - 1 ? 'Lock in and reveal' : 'Lock in';
      el.lock.disabled = false;
    } else {
      el.clueLabel.textContent = 'The clue was';
      const total = answers.reduce((n, a) => n + a.points, 0);
      el.dialHint.textContent = total
        ? seatName(giver()) + ' takes ' + total + ' for that clue.'
        : 'Nobody found it.';
      el.lock.textContent = 'Scores';
      el.lock.disabled = false;
    }
    renderAnswers();
    renderTally();
  }

  function fromEvent(event) {
    const box = el.track.getBoundingClientRect();
    const x = (event.touches ? event.touches[0].clientX : event.clientX) - box.left;
    return Math.min(100, Math.max(0, (x / box.width) * 100));
  }

  function drag(event) {
    if (el.body.dataset.screen !== 'play') return;
    if (el.body.dataset.phase !== 'guess') return;
    event.preventDefault();
    guess = fromEvent(event);
    renderGuess();
  }

  function renderBoard() {
    el.board.textContent = '';
    for (let i = 0; i < party.scores.length; i++) {
      const li = document.createElement('li');
      li.dataset.seat = seatToken(i);
      if (i === giver()) li.dataset.up = '';
      const name = document.createElement('span');
      name.className = 'board-name';
      name.textContent = seatName(i);
      const score = document.createElement('span');
      score.className = 'board-score';
      score.textContent = String(party.scores[i]);
      li.append(name, score);
      el.board.append(li);
    }
  }

  function renderReady() {
    clueGiver = Party.roles(party).present;
    el.readyWho.textContent = seatName(giver());
    el.readyWho.dataset.seat = seatToken(giver());
    const others = responderSeats().length;
    el.readySub.textContent = 'writes the clue. '
      + (others === 1 ? 'The other side guesses' : 'The other ' + others + ' guess')
      + ', and ' + seatName(giver()) + ' takes whatever they score.';
    el.roundNo.textContent = '#' + (party.round + 1);
    el.scoreSoFar.textContent = String(party.scores[giver()]);
  }

  /**
   * The one button, whatever it currently says. Three steps in a round and
   * one control for all of them: write the clue, lock a guess in, look at
   * the scores. A separate button per step would leave two of them dead at
   * any moment, on the part of the screen a thumb is already resting on.
   */
  function advance() {
    if (el.body.dataset.screen !== 'play') return;
    const mode = el.body.dataset.phase;

    if (mode === 'clue') {
      const typed = el.clueInput.value.trim();
      if (!typed) return;
      clue = typed;
      at = 0;
      guess = 50;
      phase('guess');
      renderScale();
      return;
    }

    if (mode === 'guess') {
      answers.push({ seat: responders[at], value: guess, points: scoreFor(guess) });
      at += 1;
      if (at < responders.length) {
        // Back to the middle, so the next player cannot read the last one's
        // answer off the marker.
        guess = 50;
        renderScale();
        return;
      }
      // Everyone has answered: pay out and show the lot.
      let total = 0;
      for (const answer of answers) {
        party.scores[answer.seat] += answer.points;
        total += answer.points;
      }
      party.scores[giver()] += total;
      Party.advance(party);
      save();
      // The header carries the clue-giver's running total, so it has to move
      // with the payout rather than staying on what they had at the start.
      el.scoreSoFar.textContent = String(party.scores[giver()]);
      phase('reveal');
      renderScale();
      renderBoard();
      el.overLabel.textContent = seatName(giver()) + ' gave "' + clue + '"';
      el.overScore.textContent = '+' + total;
      return;
    }

    screen('over');
  }

  el.begin.addEventListener('click', () => {
    syncSeats();
    scales = Vocab.spectrums();
    scaleAt = 0;
    save();
    renderReady();
    renderBoard();
    screen('ready');
  });

  el.setupBtn.addEventListener('click', () => {
    setup.render();
    screen('setup');
  });

  el.start.addEventListener('click', () => {
    renderReady();
    dealScale();
    screen('play');
  });
  el.next.addEventListener('click', () => {
    renderReady();
    screen('ready');
  });
  el.newScale.addEventListener('click', dealScale);
  el.lock.addEventListener('click', advance);
  el.clueInput.addEventListener('input', renderPhase);

  el.track.addEventListener('pointerdown', event => {
    if (el.body.dataset.phase !== 'guess') return;
    el.track.setPointerCapture(event.pointerId);
    drag(event);
  });
  el.track.addEventListener('pointermove', event => {
    if (event.buttons) drag(event);
  });
  el.track.addEventListener('keydown', event => {
    if (el.body.dataset.phase !== 'guess') return;
    const by = event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0;
    if (!by) return;
    event.preventDefault();
    guess = Math.min(100, Math.max(0, guess + by));
    renderGuess();
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  setup.render();
  clueGiver = Party.roles(party).present;
  renderBoard();
  screen('setup');
})();
