// 10,000: press your luck with six dice. See _README.md for the rules and
// the scoring table. The tray and its animation live in js/lib/dice.js.
(function () {
  const STORAGE_KEY = 'games.ten-thousand.v1';
  const DICE = 6;
  const FACES = 6;
  const TARGET = 10000;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 6;
  const PER_ROW = 3;

  const el = {
    tray: document.getElementById('tray'),
    seats: document.getElementById('seats'),
    settingsBtn: document.getElementById('settings-btn'),
    settings: document.getElementById('settings'),
    countRow: document.getElementById('count-row'),
    status: document.getElementById('status-text'),
    roll: document.getElementById('roll'),
    stop: document.getElementById('stop'),
    next: document.getElementById('next'),
    newGame: document.getElementById('new-game')
  };

  let state = load();
  let seatScores = [];
  let pendingBust = false;

  const tray = DiceTray.create(el.tray, { onPick: toggleKeep });

  function clampCount(n) {
    const c = Math.floor(Number(n));
    if (!Number.isFinite(c)) return MIN_PLAYERS;
    return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, c));
  }

  function fresh(count) {
    return {
      count,
      scores: Array(count).fill(0),
      current: 0,
      turnScore: 0,
      dice: Array.from({ length: DICE }, () => ({ face: 1, state: 'idle' })),
      phase: 'idle'
    };
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    if (!p) return fresh(MIN_PLAYERS);

    const count = clampCount(p.count);
    const scores = Array.from({ length: count }, (_, i) => {
      const v = p.scores && p.scores[i];
      return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    });
    const dice = Array.from({ length: DICE }, (_, i) => {
      const d = (p.dice && p.dice[i]) || {};
      const face = Number.isInteger(d.face) && d.face >= 1 && d.face <= FACES ? d.face : 1;
      const st = ['idle', 'active', 'kept', 'set'].indexOf(d.state) >= 0 ? d.state : 'idle';
      return { face, state: st };
    });
    // 'rolling' is mid-animation and cannot be resumed; land it.
    const phase = ['idle', 'picking', 'bust', 'over'].indexOf(p.phase) >= 0 ? p.phase : 'idle';
    const current = Number.isInteger(p.current) && p.current >= 0 && p.current < count ? p.current : 0;
    const turnScore = Number.isFinite(p.turnScore) && p.turnScore >= 0 ? Math.floor(p.turnScore) : 0;
    return { count, scores, current, turnScore, dice, phase };
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  /**
   * Best score for a set of faces, plus how many dice that scoring used.
   * used < faces.length means some die contributes nothing, which is what
   * makes a selection illegal. See the table in _README.md.
   */
  function scoreDice(faces) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const f of faces) counts[f]++;

    if (faces.length === DICE) {
      let single = true;
      for (let f = 1; f <= FACES; f++) if (counts[f] !== 1) single = false;
      if (single) return { score: 1500, used: DICE };

      let pairs = 0;
      for (let f = 1; f <= FACES; f++) if (counts[f] === 2) pairs++;
      if (pairs === 3) return { score: 1500, used: DICE };
    }

    let score = 0;
    let used = 0;
    for (let f = 1; f <= FACES; f++) {
      const c = counts[f];
      if (c === 0) continue;
      if (c >= 3) {
        // Three of a kind, then one more set's worth for each extra die.
        score += (f === 1 ? 1000 : f * 100) * (c - 2);
        used += c;
      } else if (f === 1) {
        score += 100 * c;
        used += c;
      } else if (f === 5) {
        score += 50 * c;
        used += c;
      }
    }
    return { score, used };
  }

  function selection() {
    const faces = state.dice.filter(d => d.state === 'kept').map(d => d.face);
    if (!faces.length) return { score: 0, valid: false };
    const r = scoreDice(faces);
    return { score: r.score, valid: r.score > 0 && r.used === faces.length };
  }

  function setPhase(p) {
    state.phase = p;
    document.body.dataset.phase = p;
  }

  function buildSeats() {
    el.seats.textContent = '';
    seatScores = [];
    // At most three across; the rest wrap onto further rows.
    el.seats.style.gridTemplateColumns =
      'repeat(' + Math.min(PER_ROW, state.count) + ', 1fr)';

    for (let i = 0; i < state.count; i++) {
      const seat = document.createElement('div');
      seat.className = 'seat';
      seat.dataset.seat = String(i);
      const name = document.createElement('span');
      name.className = 'seat-name';
      name.textContent = 'P' + (i + 1);
      const score = document.createElement('span');
      score.className = 'seat-score';
      seat.append(name, score);
      el.seats.append(seat);
      seatScores.push(score);
    }
  }

  function render() {
    for (let i = 0; i < state.count; i++) {
      seatScores[i].textContent = state.scores[i];
      const seat = seatScores[i].parentElement;
      if (i === state.current) seat.dataset.active = '';
      else delete seat.dataset.active;
    }

    state.dice.forEach((d, i) => {
      const node = tray.node(i);
      node.dataset.state = d.state;
      node.dataset.face = String(d.face);
      node.disabled = state.phase !== 'picking' || d.state === 'set';
      node.setAttribute('aria-pressed', d.state === 'kept' ? 'true' : 'false');
      node.setAttribute('aria-label', 'Die showing ' + d.face);
    });
    if (!tray.isRolling()) tray.layout();

    for (const b of el.countRow.children) {
      b.setAttribute('aria-pressed', Number(b.dataset.count) === state.count ? 'true' : 'false');
    }

    renderStatus();
    renderControls();
  }

  function renderStatus() {
    const name = 'P' + (state.current + 1);
    if (state.phase === 'over') {
      el.status.textContent = name + ' wins with ' + state.scores[state.current] + '!';
    } else if (state.phase === 'bust') {
      el.status.textContent = 'Bust!';
    } else if (state.phase === 'rolling') {
      el.status.textContent = name + ' rolling…';
    } else if (state.phase === 'idle') {
      el.status.textContent = name + ' to roll';
    } else {
      el.status.textContent = name + ': ' + (state.turnScore + selection().score);
    }
  }

  function renderControls() {
    const sel = selection();
    if (state.phase === 'idle') {
      el.roll.disabled = false;
    } else if (state.phase === 'picking') {
      el.roll.disabled = !sel.valid;
      el.stop.disabled = !sel.valid;
    } else {
      el.roll.disabled = true;
      el.stop.disabled = true;
    }
    el.next.textContent = state.phase === 'over' ? 'New game' : 'Next Player!';
  }

  function toggleKeep(i) {
    if (state.phase !== 'picking') return;
    const d = state.dice[i];
    if (d.state === 'active') d.state = 'kept';
    else if (d.state === 'kept') d.state = 'active';
    else return;
    save();
    render();
  }

  function doRoll() {
    if (state.phase === 'rolling') return;

    if (state.phase === 'picking') {
      const sel = selection();
      if (!sel.valid) return;
      state.turnScore += sel.score;
      state.dice.forEach(d => { if (d.state === 'kept') d.state = 'set'; });
      // Hot dice: every die has scored, so all six come back.
      if (state.dice.every(d => d.state === 'set')) {
        state.dice.forEach(d => { d.state = 'active'; });
      }
    } else if (state.phase === 'idle') {
      state.dice.forEach(d => { d.state = 'active'; });
    } else {
      return;
    }

    const indices = [];
    state.dice.forEach((d, i) => { if (d.state === 'active') indices.push(i); });
    // Faces are drawn before any physics randomness, so a test can force a
    // roll by stubbing the head of Math.random. See _README.md.
    for (const i of indices) state.dice[i].face = DiceTray.randomFace();
    pendingBust = scoreDice(indices.map(i => state.dice[i].face)).score === 0;

    save();
    setPhase('rolling');
    // Must render before rolling: the dice are hidden while their state is
    // 'idle', and it is this render that moves them to 'active'.
    render();
    tray.roll(indices, state.dice.map(d => d.face), finishRoll);
  }

  function finishRoll() {
    if (pendingBust) {
      state.turnScore = 0;
      setPhase('bust');
    } else {
      setPhase('picking');
    }
    save();
    render();
  }

  function doStop() {
    if (state.phase !== 'picking') return;
    const sel = selection();
    if (!sel.valid) return;

    state.scores[state.current] += state.turnScore + sel.score;
    state.turnScore = 0;
    if (state.scores[state.current] >= TARGET) {
      state.dice.forEach(d => { d.state = 'idle'; });
      setPhase('over');
      save();
      render();
      return;
    }
    nextPlayer();
  }

  function nextPlayer() {
    if (state.phase === 'over') {
      startGame(state.count);
      return;
    }
    state.turnScore = 0;
    state.current = (state.current + 1) % state.count;
    state.dice.forEach(d => { d.state = 'idle'; });
    setPhase('idle');
    save();
    render();
  }

  function startGame(count) {
    tray.cancel();
    state = fresh(clampCount(count));
    setPhase('idle');
    buildSeats();
    save();
    render();
  }

  function setPlayerCount(count) {
    startGame(count);
    el.settings.hidden = true;
    el.settingsBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleSettings() {
    const open = el.settings.hidden;
    el.settings.hidden = !open;
    el.settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  for (let c = MIN_PLAYERS; c <= MAX_PLAYERS; c++) {
    const b = document.createElement('button');
    b.className = 'count';
    b.type = 'button';
    b.textContent = String(c);
    b.dataset.count = String(c);
    b.addEventListener('click', () => setPlayerCount(c));
    el.countRow.append(b);
  }

  el.roll.addEventListener('click', doRoll);
  el.stop.addEventListener('click', doStop);
  el.next.addEventListener('click', nextPlayer);
  el.newGame.addEventListener('click', () => startGame(state.count));
  el.settingsBtn.addEventListener('click', toggleSettings);

  tray.setCount(DICE);
  buildSeats();
  setPhase(state.phase);
  render();
})();
