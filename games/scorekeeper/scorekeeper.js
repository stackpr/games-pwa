// Scorekeeper for 2 to 8 players. See _README.md for behaviour and rationale.
(function () {
  const STORAGE_KEY = 'games.scorekeeper.v2';
  // The two-team shape this replaced. Read once, converted, then left alone.
  const LEGACY_KEY = 'games.scorekeeper.v1';
  const MAX_HISTORY = 200;
  const GROUP_MS = 1000;
  const MIN_SEATS = 2;
  const MAX_SEATS = 8;
  const PORTRAIT_COLS = 2;
  const LANDSCAPE_COLS = 4;

  const el = {
    board: document.getElementById('board'),
    countRow: document.getElementById('count-row'),
    settings: document.getElementById('settings'),
    settingsBtn: document.getElementById('settings-btn'),
    undo: document.getElementById('undo'),
    reset: document.getElementById('reset')
  };

  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  const portrait = window.matchMedia('(orientation: portrait)');

  let state = load();
  // Snapshots taken at the start of each group; in-memory only.
  let undoStack = [];
  // Restored history has no snapshot, so only a group opened in this
  // session may be extended.
  let groupOpen = false;
  let seats = [];

  function clampCount(n) {
    const c = Math.floor(Number(n));
    if (!Number.isFinite(c)) return MIN_SEATS;
    return Math.min(MAX_SEATS, Math.max(MIN_SEATS, c));
  }

  function defaultName(i) {
    return 'Player ' + (i + 1);
  }

  function blank(count) {
    return {
      count,
      names: Array.from({ length: count }, (_, i) => defaultName(i)),
      scores: Array(count).fill(0),
      events: []
    };
  }

  function loadEvents(events, count) {
    if (!Array.isArray(events)) return [];
    return events
      .filter(e => e && Number.isInteger(e.seat) && e.seat >= 0 && e.seat < count
        && Number.isInteger(e.delta) && e.delta !== 0)
      .map(e => ({ seat: e.seat, delta: e.delta, t: Number.isFinite(e.t) ? e.t : 0 }))
      .slice(-MAX_HISTORY);
  }

  function shape(parsed) {
    const count = clampCount(parsed.count);
    return {
      count,
      names: Array.from({ length: count }, (_, i) =>
        typeof (parsed.names && parsed.names[i]) === 'string'
          ? parsed.names[i] : defaultName(i)),
      scores: Array.from({ length: count }, (_, i) =>
        Number.isInteger(parsed.scores && parsed.scores[i]) && parsed.scores[i] >= 0
          ? parsed.scores[i] : 0),
      events: loadEvents(parsed.events, count)
    };
  }

  /** The old two-team save, carried forward rather than thrown away. */
  function fromLegacy(old) {
    if (!old) return null;
    const events = Array.isArray(old.events) ? old.events : [];
    return shape({
      count: 2,
      names: [old.nameA, old.nameB],
      scores: [old.a, old.b],
      events: events
        .filter(e => e && (e.team === 'a' || e.team === 'b'))
        .map(e => ({ seat: e.team === 'a' ? 0 : 1, delta: e.delta, t: e.t }))
    });
  }

  function load() {
    const parsed = Store.load(STORAGE_KEY);
    if (parsed) return shape(parsed);
    const migrated = fromLegacy(Store.load(LEGACY_KEY));
    if (migrated) {
      Store.save(STORAGE_KEY, migrated);
      return migrated;
    }
    return blank(MIN_SEATS);
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  function formatEvent(delta) {
    return delta > 0 ? `+${delta}` : String(delta);
  }

  function build() {
    el.board.textContent = '';
    seats = [];

    for (let i = 0; i < state.count; i++) {
      const seat = document.createElement('section');
      seat.className = 'seat';
      seat.dataset.seat = String(i);

      const name = document.createElement('input');
      name.className = 'seat-name';
      name.id = 'name-' + i;
      name.maxLength = 20;
      // Naming is optional: clear the field and the seat falls back to its
      // number rather than going blank.
      name.placeholder = defaultName(i);
      name.setAttribute('aria-label', 'Name for player ' + (i + 1));
      name.addEventListener('input', () => {
        state.names[i] = name.value;
        save();
      });

      const history = document.createElement('div');
      history.className = 'history';
      const line = document.createElement('span');
      line.className = 'history-line';
      line.id = 'hist-' + i;
      history.append(line);

      const tap = document.createElement('button');
      tap.className = 'tap-area';
      tap.id = 'tap-' + i;
      tap.type = 'button';
      tap.setAttribute('aria-label', 'Add a point for player ' + (i + 1));
      const score = document.createElement('span');
      score.className = 'score';
      score.id = 'score-' + i;
      tap.append(score);
      tap.addEventListener('click', () => bump(i, +1));

      const hint = document.createElement('div');
      hint.className = 'tap-hint';
      hint.textContent = 'tap to score';

      const adjust = document.createElement('div');
      adjust.className = 'adjust';
      const minus = document.createElement('button');
      minus.className = 'adjust-btn';
      minus.id = 'minus-' + i;
      minus.type = 'button';
      minus.innerHTML = '&minus;1';
      minus.setAttribute('aria-label', 'Subtract a point from player ' + (i + 1));
      minus.addEventListener('click', () => bump(i, -1));
      const plus5 = document.createElement('button');
      plus5.className = 'adjust-btn';
      plus5.id = 'plus5-' + i;
      plus5.type = 'button';
      plus5.textContent = '+5';
      plus5.setAttribute('aria-label', 'Add five points to player ' + (i + 1));
      // +5 goes through the same bump(), so it groups exactly as five taps do:
      // a following +1 inside the window extends it to +6. See _README.md.
      plus5.addEventListener('click', () => bump(i, +5));
      adjust.append(minus, plus5);

      seat.append(name, history, tap, hint, adjust);
      el.board.append(seat);
      seats.push({ name, line, score });
    }
    layout();
  }

  /** Columns come from the orientation, rows from what is left over. */
  function layout() {
    const cols = Math.min(portrait.matches ? PORTRAIT_COLS : LANDSCAPE_COLS, state.count);
    const rows = Math.ceil(state.count / cols);
    el.board.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    el.board.dataset.rows = String(rows);
    document.documentElement.style.setProperty('--rows', String(rows));
    // Short seats drop the hint and tighten up. Two rows is roomy upright
    // and cramped on a phone's side, so orientation matters as well as rows.
    const compact = rows >= 3 || (!portrait.matches && rows >= 2);
    if (compact) el.board.dataset.compact = '';
    else delete el.board.dataset.compact;
  }

  function render() {
    for (let i = 0; i < state.count; i++) {
      seats[i].score.textContent = state.scores[i];
      if (seats[i].name.value !== state.names[i]) seats[i].name.value = state.names[i];
      seats[i].line.textContent = state.events
        .filter(e => e.seat === i)
        .map(e => formatEvent(e.delta))
        .join(', ');
    }
    for (const b of el.countRow.children) {
      b.setAttribute('aria-pressed', Number(b.dataset.count) === state.count ? 'true' : 'false');
    }
    el.undo.disabled = undoStack.length === 0;
  }

  function pushUndo() {
    undoStack.push({
      scores: state.scores.slice(),
      events: state.events.map(e => ({ ...e }))
    });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }

  // Same seat, same direction, within the sliding window.
  function continuesGroup(seat, delta, now) {
    if (!groupOpen) return false;
    const last = state.events[state.events.length - 1];
    if (!last) return false;
    return last.seat === seat
      && Math.sign(last.delta) === Math.sign(delta)
      && now - last.t < GROUP_MS;
  }

  function bump(seat, delta) {
    const current = state.scores[seat];
    const next = Math.max(0, current + delta);
    const applied = next - current;
    if (applied === 0) return; // clamped at zero: record nothing

    const now = Date.now();
    if (continuesGroup(seat, applied, now)) {
      const last = state.events[state.events.length - 1];
      last.delta += applied;
      last.t = now;
    } else {
      pushUndo();
      state.events.push({ seat, delta: applied, t: now });
      if (state.events.length > MAX_HISTORY) state.events.shift();
    }
    groupOpen = true;

    state.scores[seat] = next;
    save();
    render();
  }

  function setCount(count) {
    const next = clampCount(count);
    if (next === state.count) return;

    if (next < state.count) {
      const losing = state.scores.slice(next).some(s => s > 0);
      if (losing && !confirm('Remove ' + (state.count - next)
        + ' player(s) and their scores?')) return;
    }

    const names = Array.from({ length: next }, (_, i) =>
      i < state.count ? state.names[i] : defaultName(i));
    const scores = Array.from({ length: next }, (_, i) =>
      i < state.count ? state.scores[i] : 0);
    state = {
      count: next,
      names,
      scores,
      events: state.events.filter(e => e.seat < next)
    };
    undoStack = [];
    groupOpen = false;
    save();
    build();
    render();
  }

  on(el.undo, 'click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    state.scores = prev.scores;
    state.events = prev.events;
    groupOpen = false;
    save();
    render();
  });

  on(el.reset, 'click', () => {
    const scored = state.scores.some(s => s > 0) || state.events.length > 0;
    if (!scored) return;
    if (!confirm('Reset every score to 0?')) return;
    pushUndo();
    state.scores = Array(state.count).fill(0);
    state.events = [];
    groupOpen = false;
    save();
    render();
  });

  for (let c = MIN_SEATS; c <= MAX_SEATS; c++) {
    const b = document.createElement('button');
    b.className = 'count';
    b.type = 'button';
    b.textContent = String(c);
    b.dataset.count = String(c);
    b.addEventListener('click', () => {
      setCount(c);
      settings.close();
    });
    el.countRow.append(b);
  }

  const settings = Modal.create(el.settings, { trigger: el.settingsBtn });
  portrait.addEventListener('change', layout);

  build();
  render();
})();
