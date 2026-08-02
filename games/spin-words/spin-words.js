// Spin Words: spin, call a letter, solve the puzzle. One phone, passed
// round the table. Rules and the shape of the saved state are in _README.md.
(function () {
  const STORAGE_KEY = 'games.spin-words.v1';
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 8;
  const PUZZLE_COUNTS = [3, 5, 7];
  const VOWEL_COST = 250;
  const SOLVE_SECONDS = 10;
  const BACKSPACE = '\u232B';
  const VOWELS = 'AEIOU';
  const REMEMBER = 60;          // puzzles kept back from being dealt again

  const BANKRUPT = 'BANKRUPT';
  const LOSE = 'LOSE A TURN';
  // Twenty-four wedges. The small values outnumber the big ones, which is
  // what keeps a spin worth thinking about rather than worth waiting for.
  const WHEEL = [
    600, BANKRUPT, 900, 500, 700, 550, LOSE, 800,
    500, 650, 600, BANKRUPT, 750, 500, 700, 600,
    550, 900, LOSE, 650, 600, 800, 2500, 500
  ];
  const LOOPS = 3;              // copies of the wheel in the reel track

  const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

  const el = {
    category: document.getElementById('category'),
    board: document.getElementById('board'),
    seats: document.getElementById('seats'),
    turn: document.getElementById('turn'),
    reel: document.getElementById('reel'),
    reelTrack: document.getElementById('reel-track'),
    spin: document.getElementById('spin'),
    spinHint: document.getElementById('spin-hint'),
    vowel: document.getElementById('vowel'),
    solve: document.getElementById('solve'),
    keys: document.getElementById('keys'),
    keyHint: document.getElementById('key-hint'),
    clock: document.getElementById('clock'),
    vowels: document.getElementById('vowels'),
    vowelBack: document.getElementById('vowel-back'),
    ready: document.getElementById('ready'),
    passNote: document.getElementById('pass-note'),
    nextPuzzle: document.getElementById('next-puzzle'),
    solvedNote: document.getElementById('solved-note'),
    again: document.getElementById('again'),
    overNote: document.getElementById('over-note'),
    settings: document.getElementById('settings'),
    settingsBtn: document.getElementById('settings-btn'),
    countRow: document.getElementById('count-row'),
    puzzleRow: document.getElementById('puzzle-row'),
    names: document.getElementById('names'),
    recentNames: document.getElementById('recent-names'),
    rules: document.getElementById('rules'),
    rulesBtn: document.getElementById('rules-btn'),
    newGame: document.getElementById('new-game')
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Assigned at the bottom, once the helpers load() leans on are declared.
  let state = null;
  let keyNodes = {};
  let vowelNodes = {};
  let seatNodes = [];
  let reelAt = 0;               // where the track sits, in wedges
  let spinTimer = 0;
  let justCalled = '';          // ringed on the board for the beat after

  /* ---- puzzles -------------------------------------------------------- */

  const letters = text => text.toUpperCase().replace(/[^A-Z]/g, '');

  /**
   * The deal: half the shared vocabulary, half this game's own phrases.
   * Straight from the pool the phrases would be one puzzle in twelve, and
   * they are the ones that play like this game rather than like a spelling
   * test — see _README.md.
   */
  function drawPuzzle(used) {
    const skip = new Set(used || []);
    for (let tries = 0; tries < 60; tries++) {
      const p = Math.random() < 0.5 ? fromPhrases() : fromVocab();
      if (p && !skip.has(p.answer)) return p;
    }
    // Every puzzle in living memory: forget the oldest rather than loop.
    return fromPhrases() || fromVocab();
  }

  function fromPhrases() {
    const pool = window.SpinPhrases ? SpinPhrases.pool() : [];
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { answer: pick.text.toUpperCase(), category: pick.category };
  }

  function fromVocab() {
    const pool = window.Vocab ? Vocab.pool() : [];
    // Four letters is not a puzzle, it is a guess.
    const big = pool.filter(t => letters(t.word).length >= 5);
    if (!big.length) return null;
    const pick = big[Math.floor(Math.random() * big.length)];
    return { answer: pick.word.toUpperCase(), category: pick.category };
  }

  /* ---- state ---------------------------------------------------------- */

  function clamp(n, lo, hi, fallback) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  }

  function freshGame(players, puzzles, names, used) {
    const seats = clamp(players, MIN_PLAYERS, MAX_PLAYERS, 3);
    const puzzle = drawPuzzle(used);
    return {
      players: seats,
      puzzles: PUZZLE_COUNTS.indexOf(puzzles) >= 0 ? puzzles : PUZZLE_COUNTS[0],
      names: Array.from({ length: seats }, (_, i) => (names && names[i]) || ''),
      banks: Array(seats).fill(0),
      current: 0,
      roundMoney: 0,
      solvedCount: 0,
      answer: puzzle.answer,
      category: puzzle.category,
      called: '',
      typed: '',
      phase: 'pass',
      wedge: 0,
      message: '',
      used: (used || []).concat([puzzle.answer]).slice(-REMEMBER)
    };
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    if (!p) return freshGame(3, PUZZLE_COUNTS[0], [], []);

    const players = clamp(p.players, MIN_PLAYERS, MAX_PLAYERS, 3);
    const answer = typeof p.answer === 'string' && letters(p.answer).length
      ? p.answer.toUpperCase() : null;
    if (!answer) return freshGame(players, p.puzzles, p.names, p.used);

    const s = {
      players,
      puzzles: PUZZLE_COUNTS.indexOf(p.puzzles) >= 0 ? p.puzzles : PUZZLE_COUNTS[0],
      names: Array.from({ length: players }, (_, i) =>
        typeof (p.names && p.names[i]) === 'string' ? Names.clean(p.names[i]) : ''),
      banks: Array.from({ length: players }, (_, i) =>
        Number.isFinite(p.banks && p.banks[i]) ? Math.floor(p.banks[i]) : 0),
      current: clamp(p.current, 0, players - 1, 0),
      roundMoney: Number.isFinite(p.roundMoney) ? Math.max(0, Math.floor(p.roundMoney)) : 0,
      solvedCount: clamp(p.solvedCount, 0, 99, 0),
      answer,
      category: typeof p.category === 'string' ? p.category : '',
      called: typeof p.called === 'string' ? p.called.toUpperCase().replace(/[^A-Z]/g, '') : '',
      typed: '',
      // 'spinning' is mid-animation and cannot be resumed; land it on the
      // spin screen with the wedge it had already drawn.
      phase: p.phase === 'spinning' ? 'spin'
        : (['spin', 'pick', 'vowel', 'solve', 'pass', 'solved', 'over']
          .indexOf(p.phase) >= 0 ? p.phase : 'pass'),
      wedge: clamp(p.wedge, 0, WHEEL.length - 1, 0),
      message: typeof p.message === 'string' ? p.message : '',
      used: Array.isArray(p.used)
        ? p.used.filter(x => typeof x === 'string').slice(-REMEMBER) : []
    };
    // A solve cannot be resumed — the ten seconds are the whole of it — and
    // letting a reload cancel one would make tapping Solve free. So the turn
    // is spent, exactly as if the clock had run out on the phone. See
    // _README.md.
    if (s.phase === 'solve') {
      s.roundMoney = 0;
      s.current = (s.current + 1) % s.players;
      s.message = 'The clock ran out.';
      s.phase = 'pass';
    }
    if (s.solvedCount >= s.puzzles) s.phase = 'over';
    return s;
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  /* ---- rules ---------------------------------------------------------- */

  const isVowel = ch => VOWELS.indexOf(ch) >= 0;
  const called = ch => state.called.indexOf(ch) >= 0;
  const money = n => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const name = i => Names.clean(state.names[i]) || 'Player ' + (i + 1);

  function countIn(ch) {
    let n = 0;
    for (const c of letters(state.answer)) if (c === ch) n++;
    return n;
  }

  /** Letters still hidden, so the game knows what is worth offering. */
  function hidden() {
    const out = [];
    for (const c of letters(state.answer)) {
      if (!called(c) && out.indexOf(c) < 0) out.push(c);
    }
    return out;
  }

  /**
   * Where the blanks are, as positions in the answer. A solve fills these
   * left to right, which is why the order matters and a Set would not do.
   */
  function blanks() {
    const out = [];
    const text = state.answer.toUpperCase();
    for (let i = 0; i < text.length; i++) {
      if (/[A-Z]/.test(text[i]) && !called(text[i])) out.push(i);
    }
    return out;
  }

  const consonantsLeft = () => hidden().some(c => !isVowel(c));
  const vowelsLeft = () => hidden().some(isVowel);
  const solved = () => hidden().length === 0;
  const canBuyVowel = () => state.roundMoney >= VOWEL_COST && vowelsLeft();

  function setPhase(p) {
    state.phase = p;
    document.body.dataset.phase = p;
  }

  /* ---- turns ---------------------------------------------------------- */

  function endTurn(message) {
    clock.stop();
    state.typed = '';
    state.roundMoney = 0;
    state.current = (state.current + 1) % state.players;
    state.message = message;
    setPhase('pass');
    save();
    render();
  }

  function doReady() {
    if (state.phase !== 'pass') return;
    state.message = '';
    justCalled = '';
    setPhase('spin');
    save();
    render();
  }

  function doSpin() {
    if (state.phase !== 'spin' || !consonantsLeft()) return;
    const at = Math.floor(Math.random() * WHEEL.length);
    state.wedge = at;
    setPhase('spinning');
    save();
    render();
    spinReel(at, () => {
      const value = WHEEL[at];
      if (value === BANKRUPT) {
        const lost = state.roundMoney;
        endTurn(name(state.current) + ' hit Bankrupt'
          + (lost ? ' and lost ' + money(lost) : ''));
      } else if (value === LOSE) {
        endTurn(name(state.current) + ' lost a turn');
      } else {
        setPhase('pick');
        save();
        render();
      }
    });
  }

  function doPick(ch) {
    if (state.phase !== 'pick' || called(ch) || isVowel(ch)) return;
    const hits = countIn(ch);
    state.called += ch;
    justCalled = ch;
    if (!hits) {
      endTurn('No ' + ch + '. ' + name(state.current) + ' passes.');
      return;
    }
    state.roundMoney += hits * WHEEL[state.wedge];
    state.message = hits + ' × ' + ch + ' at ' + money(WHEEL[state.wedge]);
    setPhase('spin');
    save();
    render();
  }

  function doBuyVowel() {
    if (state.phase !== 'spin' || !canBuyVowel()) return;
    setPhase('vowel');
    save();
    render();
  }

  function doVowel(ch) {
    if (state.phase !== 'vowel' || called(ch) || !isVowel(ch)) return;
    state.roundMoney -= VOWEL_COST;
    state.called += ch;
    justCalled = ch;
    if (!countIn(ch)) {
      endTurn('No ' + ch + ', and it still cost ' + money(VOWEL_COST) + '.');
      return;
    }
    state.message = countIn(ch) + ' × ' + ch + ', for ' + money(VOWEL_COST);
    setPhase('spin');
    save();
    render();
  }

  /*
   * Solving is a commitment, not a question. There is no way back out of
   * this phase: no cancel, no Back, and a reload spends the turn too. The
   * clock and the last blank are the only two ways out. See _README.md.
   */
  function doSolve() {
    if (state.phase !== 'spin') return;
    state.typed = '';
    setPhase('solve');
    save();
    render();
    // A board with nothing left to fill is already solved; do not start a
    // clock the player cannot spend.
    if (!blanks().length) {
      finishSolve(true);
      return;
    }
    clock.start();
    paintClock(SOLVE_SECONDS * 1000);
  }

  function typeLetter(ch) {
    if (state.phase !== 'solve') return;
    const room = blanks().length;
    if (state.typed.length >= room) return;
    state.typed += ch;
    render();
    // The last blank ends it there and then — no review, no second thoughts.
    if (state.typed.length === room) finishSolve(isRight());
  }

  function unType() {
    if (state.phase !== 'solve' || !state.typed) return;
    state.typed = state.typed.slice(0, -1);
    render();
  }

  function isRight() {
    const text = state.answer.toUpperCase();
    return blanks().every((at, k) => state.typed[k] === text[at]);
  }

  function finishSolve(right) {
    clock.stop();
    if (!right) {
      state.typed = '';
      endTurn(name(state.current) + ' did not have it.');
      return;
    }
    state.typed = '';
    bankPuzzle();
  }

  function outOfTime() {
    if (state.phase !== 'solve') return;
    state.typed = '';
    endTurn('Out of time.');
  }

  function bankPuzzle() {
    state.banks[state.current] += state.roundMoney;
    state.message = name(state.current) + ' solved it for ' + money(state.roundMoney);
    state.roundMoney = 0;
    // Revealing the whole puzzle is what the board is for at this point.
    for (const c of letters(state.answer)) {
      if (!called(c)) state.called += c;
    }
    state.solvedCount += 1;
    setPhase(state.solvedCount >= state.puzzles ? 'over' : 'solved');
    save();
    render();
  }

  function doNextPuzzle() {
    if (state.phase !== 'solved') return;
    const puzzle = drawPuzzle(state.used);
    state.answer = puzzle.answer;
    state.category = puzzle.category;
    state.used = state.used.concat([puzzle.answer]).slice(-REMEMBER);
    state.called = '';
    state.typed = '';
    state.roundMoney = 0;
    // The solver has had their turn, so the next puzzle opens on the seat
    // after them rather than handing them a second start.
    state.current = (state.current + 1) % state.players;
    state.message = '';
    justCalled = '';
    setPhase('pass');
    save();
    render();
  }

  function startGame(players, puzzles, names) {
    stopSpin();
    clock.stop();
    const keep = state ? state.used : [];
    state = freshGame(
      players === undefined ? state.players : players,
      puzzles === undefined ? state.puzzles : puzzles,
      names === undefined ? state.names : names,
      keep);
    justCalled = '';
    buildSeats();
    buildSettings();
    document.body.dataset.phase = state.phase;
    save();
    render();
  }

  /* ---- the solve clock ------------------------------------------------ */

  /*
   * Timer paints mm:ss, which reads wrong for ten seconds — so the element
   * is left off and the digits are painted from onTick instead. The library
   * is still worth having: it derives the time left from a timestamp rather
   * than counting a variable down, so a phone that throttles the tab comes
   * back with the right answer. See js/lib/timer.js.
   */
  const clock = Timer.create(null, {
    seconds: SOLVE_SECONDS,
    onTick: paintClock,
    onEnd: outOfTime
  });

  function paintClock(left) {
    if (!el.clock) return;
    const secs = Math.max(0, Math.ceil(left / 1000));
    el.clock.textContent = String(secs);
    if (secs <= 3) el.clock.dataset.low = '';
    else delete el.clock.dataset.low;
  }

  /* ---- the reel ------------------------------------------------------- */

  function buildReel() {
    if (!el.reelTrack) return;
    el.reelTrack.textContent = '';
    const frag = document.createDocumentFragment();
    for (let loop = 0; loop < LOOPS; loop++) {
      for (let i = 0; i < WHEEL.length; i++) {
        const value = WHEEL[i];
        const node = document.createElement('div');
        node.className = 'wedge';
        if (value === BANKRUPT) node.dataset.kind = 'bankrupt';
        else if (value === LOSE) node.dataset.kind = 'lose';
        else node.dataset.kind = 'cash';
        node.textContent = typeof value === 'number' ? money(value) : value;
        frag.append(node);
      }
    }
    el.reelTrack.append(frag);
  }

  function placeReel(at) {
    reelAt = at;
    if (el.reelTrack) el.reelTrack.style.setProperty('--at', String(at));
  }

  function jumpReel(at) {
    if (!el.reelTrack) return;
    el.reelTrack.dataset.jump = '';
    placeReel(at);
    void el.reelTrack.offsetHeight;      // commit the jump before animating
    delete el.reelTrack.dataset.jump;
  }

  function stopSpin() {
    if (spinTimer) clearTimeout(spinTimer);
    spinTimer = 0;
  }

  /**
   * Spins to `target`. The track holds LOOPS copies of the wheel, so a spin
   * always has a whole wheel of run-up and never walks off the end: once the
   * position would pass the last copy it jumps back a copy first, which is
   * invisible because every copy is identical.
   */
  function spinReel(target, done) {
    stopSpin();
    const N = WHEEL.length;
    if (reduceMotion.matches || !el.reelTrack) {
      jumpReel(target);
      done();
      return;
    }
    if (reelAt >= N) jumpReel(reelAt % N);
    const travel = N + (((target - (reelAt % N)) % N) + N) % N;
    placeReel(reelAt + travel);
    spinTimer = setTimeout(() => {
      spinTimer = 0;
      done();
    }, 1550);
  }

  /* ---- building ------------------------------------------------------- */

  function buildKeys() {
    if (!el.keys) return;
    el.keys.textContent = '';
    keyNodes = {};
    for (const row of KEY_ROWS) {
      const line = document.createElement('div');
      line.className = 'keys-row';
      for (const ch of row) {
        const key = document.createElement('button');
        key.className = 'key';
        key.type = 'button';
        key.dataset.letter = ch;
        key.textContent = ch;
        // One keyboard, two jobs: calling a letter, and typing an answer.
        key.addEventListener('click', () => {
          if (state.phase === 'solve') typeLetter(ch);
          else doPick(ch);
        });
        keyNodes[ch] = key;
        line.append(key);
      }
      // The backspace rides in the bottom row rather than a fourth one, so
      // the keyboard is the same height whichever job it is doing and the
      // board never moves under it.
      if (row === KEY_ROWS[KEY_ROWS.length - 1]) {
        const back = document.createElement('button');
        back.className = 'key';
        back.type = 'button';
        back.dataset.letter = BACKSPACE;
        back.textContent = BACKSPACE;
        back.setAttribute('aria-label', 'Rub out the last letter');
        back.addEventListener('click', unType);
        keyNodes[BACKSPACE] = back;
        line.append(back);
      }
      el.keys.append(line);
    }
  }

  function buildVowels() {
    if (!el.vowels) return;
    el.vowels.textContent = '';
    vowelNodes = {};
    for (const ch of VOWELS) {
      const key = document.createElement('button');
      key.className = 'vowel-key';
      key.type = 'button';
      key.dataset.letter = ch;
      key.textContent = ch;
      key.addEventListener('click', () => doVowel(ch));
      vowelNodes[ch] = key;
      el.vowels.append(key);
    }
  }

  function buildSeats() {
    if (!el.seats) return;
    el.seats.textContent = '';
    seatNodes = [];
    for (let i = 0; i < state.players; i++) {
      const seat = document.createElement('div');
      seat.className = 'seat';
      seat.dataset.seat = String(i);
      const who = document.createElement('span');
      who.className = 'seat-name';
      const bank = document.createElement('span');
      bank.className = 'seat-bank';
      seat.append(who, bank);
      el.seats.append(seat);
      seatNodes.push({ seat, who, bank });
    }
  }

  function buildSettings() {
    if (el.countRow && !el.countRow.children.length) {
      for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
        const b = document.createElement('button');
        b.className = 'count';
        b.type = 'button';
        b.textContent = String(n);
        b.dataset.count = String(n);
        b.addEventListener('click', () => {
          startGame(n, state.puzzles, state.names);
          settings.close();
        });
        el.countRow.append(b);
      }
    }
    if (el.puzzleRow && !el.puzzleRow.children.length) {
      for (const n of PUZZLE_COUNTS) {
        const b = document.createElement('button');
        b.className = 'count';
        b.type = 'button';
        b.textContent = String(n);
        b.dataset.puzzles = String(n);
        b.addEventListener('click', () => {
          state.puzzles = n;
          if (state.solvedCount >= n) setPhase('over');
          save();
          render();
        });
        el.puzzleRow.append(b);
      }
    }
    buildNameInputs();
  }

  function buildNameInputs() {
    if (!el.names) return;
    el.names.textContent = '';
    for (let i = 0; i < state.players; i++) {
      const row = document.createElement('div');
      row.className = 'name-row';
      const label = document.createElement('label');
      label.textContent = 'Player ' + (i + 1);
      label.htmlFor = 'name-' + i;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'name-' + i;
      input.maxLength = Names.MAX_LENGTH;
      input.autocomplete = 'off';
      input.placeholder = 'Player ' + (i + 1);
      input.setAttribute('list', 'recent-names');
      input.value = state.names[i] || '';
      input.addEventListener('input', () => {
        state.names[i] = Names.clean(input.value);
        save();
        render();
      });
      row.append(label, input);
      el.names.append(row);
    }
    if (el.recentNames) {
      el.recentNames.textContent = '';
      for (const known of Names.recent()) {
        const option = document.createElement('option');
        option.value = known;
        el.recentNames.append(option);
      }
    }
  }

  /* ---- rendering ------------------------------------------------------ */

  function renderBoard() {
    if (!el.board) return;
    el.board.textContent = '';
    const show = state.phase === 'over' || state.phase === 'solved' || solved();
    // Blanks are numbered left to right across the whole board, because that
    // is the order a solve fills them in.
    let blank = -1;
    for (const word of state.answer.toUpperCase().split(/\s+/)) {
      if (!word) continue;
      const group = document.createElement('div');
      group.className = 'word';
      for (const ch of word) {
        const tile = document.createElement('span');
        tile.className = 'tile';
        const letter = /[A-Z]/.test(ch);
        const seen = !letter || called(ch) || show;
        if (letter && !seen) blank += 1;
        const guess = !seen && letter ? state.typed[blank] : '';
        if (seen) tile.dataset.shown = '';
        if (seen && ch === justCalled) tile.dataset.fresh = '';
        if (guess) tile.dataset.typed = '';
        // The blank about to be filled, so a typed letter has somewhere
        // obvious to land.
        if (!seen && letter && state.phase === 'solve'
          && blank === state.typed.length) tile.dataset.next = '';
        tile.dataset.letter = letter ? ch : '';
        tile.textContent = seen ? ch : (guess || '');
        group.append(tile);
      }
      el.board.append(group);
    }
    if (el.category) el.category.textContent = state.category;
  }

  function renderSeats() {
    for (let i = 0; i < seatNodes.length; i++) {
      const node = seatNodes[i];
      node.who.textContent = name(i);
      node.bank.textContent = money(state.banks[i]);
      if (i === state.current && state.phase !== 'over') node.seat.dataset.active = '';
      else delete node.seat.dataset.active;
    }
  }

  function renderTurn() {
    if (!el.turn) return;
    if (state.phase === 'over') {
      el.turn.textContent = 'Game over';
      return;
    }
    const round = state.roundMoney
      ? ' · ' + money(state.roundMoney) + ' this puzzle' : '';
    el.turn.textContent = name(state.current) + round;
  }

  function renderKeys() {
    const solving = state.phase === 'solve';
    const room = solving ? blanks().length : 0;
    for (const ch of Object.keys(keyNodes)) {
      const key = keyNodes[ch];
      if (ch === BACKSPACE) {
        key.disabled = !solving || !state.typed;
        continue;
      }
      const used = called(ch);
      if (used) key.dataset.used = '';
      else delete key.dataset.used;
      if (solving) {
        // A letter already called cannot be in a blank — the board would be
        // showing it. Killing the key spends no information the player does
        // not already have, and ten seconds is not long enough to waste a
        // tap on it.
        key.disabled = used || state.typed.length >= room;
        key.setAttribute('aria-label', ch + (used ? ', already on the board' : ''));
        continue;
      }
      key.disabled = state.phase !== 'pick' || used || isVowel(ch);
      key.setAttribute('aria-label',
        ch + (used ? ', already called' : isVowel(ch) ? ', vowels must be bought' : ''));
    }
    for (const ch of Object.keys(vowelNodes)) {
      vowelNodes[ch].disabled = state.phase !== 'vowel' || called(ch);
    }
  }

  function renderControls() {
    const busy = state.phase === 'spinning';
    if (el.spin) el.spin.disabled = state.phase !== 'spin' || !consonantsLeft();
    if (el.vowel) {
      el.vowel.disabled = state.phase !== 'spin' || !canBuyVowel();
      el.vowel.textContent = 'Vowel ' + money(VOWEL_COST);
    }
    if (el.solve) el.solve.disabled = state.phase !== 'spin';

    if (el.spinHint) {
      if (busy) el.spinHint.textContent = 'Spinning…';
      else if (!consonantsLeft()) {
        el.spinHint.textContent = 'No consonants left — buy a vowel or solve.';
      } else if (state.message) el.spinHint.textContent = state.message;
      else el.spinHint.textContent = 'Spin for what a consonant pays.';
    }
    if (el.keyHint) {
      el.keyHint.textContent = state.phase === 'solve'
        ? 'Fill in the blanks —'
        : 'Call a consonant — each one pays ' + money(WHEEL[state.wedge] || 0) + '.';
    }
    if (el.passNote) {
      el.passNote.textContent = (state.message ? state.message + ' ' : '')
        + 'Pass the phone to ' + name(state.current) + '.';
    }
    if (el.solvedNote) el.solvedNote.textContent = state.message;
    if (el.overNote) el.overNote.textContent = finalNote();

    for (const b of (el.countRow ? el.countRow.children : [])) {
      b.setAttribute('aria-pressed',
        Number(b.dataset.count) === state.players ? 'true' : 'false');
    }
    for (const b of (el.puzzleRow ? el.puzzleRow.children : [])) {
      b.setAttribute('aria-pressed',
        Number(b.dataset.puzzles) === state.puzzles ? 'true' : 'false');
    }
  }

  function finalNote() {
    let best = 0;
    for (let i = 1; i < state.players; i++) {
      if (state.banks[i] > state.banks[best]) best = i;
    }
    const tied = state.banks.filter(b => b === state.banks[best]).length > 1;
    if (tied) return 'A tie at ' + money(state.banks[best]) + '.';
    return name(best) + ' wins with ' + money(state.banks[best]) + '.';
  }

  function render() {
    document.body.dataset.phase = state.phase;
    renderBoard();
    renderSeats();
    renderTurn();
    renderKeys();
    renderControls();
  }

  /* ---- start ---------------------------------------------------------- */

  // Bind through a null-tolerant helper: a service worker can pair markup
  // from one release with script from the next, and one missing control
  // should cost that control rather than the whole page. See CLAUDE.md.
  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  on(el.spin, 'click', doSpin);
  on(el.vowel, 'click', doBuyVowel);
  on(el.solve, 'click', doSolve);
  on(el.vowelBack, 'click', () => {
    if (state.phase !== 'vowel') return;
    setPhase('spin');
    save();
    render();
  });
  on(el.ready, 'click', doReady);
  on(el.nextPuzzle, 'click', doNextPuzzle);
  on(el.again, 'click', () => startGame(state.players, state.puzzles, state.names));
  on(el.newGame, 'click', () => startGame(state.players, state.puzzles, state.names));

  const settings = Modal.create(el.settings, {
    trigger: el.settingsBtn,
    onClose: () => {
      Names.remember(state.names.filter(Boolean));
      buildNameInputs();
    }
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  state = load();
  buildReel();
  buildKeys();
  buildVowels();
  buildSeats();
  buildSettings();
  placeReel(state.wedge);
  render();
})();
