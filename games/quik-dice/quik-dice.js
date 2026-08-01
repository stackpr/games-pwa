// Quik Dice: one scoresheet per phone, six dice, four rows to cross off.
// Rules, edge cases and the shape of the saved state are in _README.md.
(function () {
  const STORAGE_KEY = 'games.quik-dice.v1';
  const CELLS = 11;
  const LAST = CELLS - 1;
  const DICE = 6;
  const PENALTY = 5;
  const MAX_PENALTIES = 4;
  const LOCKS_TO_END = 2;
  const NEED_BEFORE_LAST = 5;   // crosses required before the last number
  const UNDO_DEPTH = 30;

  const UP = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const ROWS = [
    { key: 'red', label: 'Red', numbers: UP },
    { key: 'yellow', label: 'Yellow', numbers: UP },
    { key: 'green', label: 'Green', numbers: UP.slice().reverse() },
    { key: 'blue', label: 'Blue', numbers: UP.slice().reverse() }
  ];
  // Dice 0 and 1 are white; the rest are one per row, in row order.
  const colorDie = r => r + 2;

  const el = {
    sheet: document.getElementById('sheet'),
    totals: document.getElementById('totals'),
    tray: document.getElementById('tray'),
    status: document.getElementById('status'),
    roll: document.getElementById('roll'),
    done: document.getElementById('done'),
    undo: document.getElementById('undo'),
    newGame: document.getElementById('new-game'),
    rules: document.getElementById('rules'),
    rulesBtn: document.getElementById('rules-btn')
  };

  let state = load();
  let rolling = false;
  const cells = [];      // cells[row][index], plus lockCells[row]
  const lockCells = [];
  const totalNodes = [];

  const tray = DiceTray.create(el.tray);

  function fresh() {
    return {
      rows: ROWS.map(() => new Array(CELLS).fill(false)),
      closed: ROWS.map(() => false),
      // Whether *this* sheet earned the padlock, which is worth a cross.
      // A row closed because someone else locked it is not.
      earned: ROWS.map(() => false),
      penalties: 0,
      phase: 'idle',
      dice: new Array(DICE).fill(1),
      turn: { white: false, color: false },
      history: []
    };
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    if (!p) return fresh();
    const s = fresh();
    for (let r = 0; r < ROWS.length; r++) {
      const saved = (p.rows && p.rows[r]) || [];
      for (let i = 0; i < CELLS; i++) s.rows[r][i] = saved[i] === true;
      s.closed[r] = Boolean(p.closed && p.closed[r]);
      s.earned[r] = Boolean(p.earned && p.earned[r]) && s.rows[r][LAST];
      // A crossed last number always closes its row, whatever was stored.
      if (s.rows[r][LAST]) s.closed[r] = true;
    }
    s.penalties = Number.isInteger(p.penalties)
      ? Math.min(MAX_PENALTIES, Math.max(0, p.penalties)) : 0;
    for (let i = 0; i < DICE; i++) {
      const f = p.dice && p.dice[i];
      s.dice[i] = Number.isInteger(f) && f >= 1 && f <= 6 ? f : 1;
    }
    s.turn = {
      white: Boolean(p.turn && p.turn.white),
      color: Boolean(p.turn && p.turn.color)
    };
    // 'rolling' is mid-animation and cannot be resumed; land it on 'turn'.
    s.phase = ['idle', 'turn', 'over'].indexOf(p.phase) >= 0 ? p.phase : 'idle';
    if (s.phase !== 'turn') s.turn = { white: false, color: false };
    s.history = Array.isArray(p.history) ? p.history.slice(-UNDO_DEPTH) : [];
    return s;
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  /* ---- rules ---------------------------------------------------------- */

  function marksIn(r) {
    let n = 0;
    for (let i = 0; i < CELLS; i++) if (state.rows[r][i]) n++;
    return n;
  }

  function lastMarked(r) {
    for (let i = LAST; i >= 0; i--) if (state.rows[r][i]) return i;
    return -1;
  }

  /** Position and lock rules only — whether the dice allow it is separate. */
  function canMark(r, i) {
    if (state.closed[r] || state.rows[r][i]) return false;
    if (i <= lastMarked(r)) return false;
    if (i === LAST && marksIn(r) < NEED_BEFORE_LAST) return false;
    return true;
  }

  /**
   * Every cell this player may tap right now, as "row:index" -> 'white' |
   * 'color'. On someone else's turn the dice are unknown, so every legal
   * cell is offered; on your own, only what the roll actually allows.
   */
  function targets() {
    const out = new Map();
    if (state.phase === 'over' || rolling) return out;

    if (state.phase !== 'turn') {
      ROWS.forEach((row, r) => {
        for (let i = 0; i < CELLS; i++) if (canMark(r, i)) out.set(r + ':' + i, 'white');
      });
      return out;
    }

    const whites = [state.dice[0], state.dice[1]];
    if (!state.turn.white && !state.turn.color) {
      const sum = whites[0] + whites[1];
      ROWS.forEach((row, r) => {
        const i = row.numbers.indexOf(sum);
        if (i >= 0 && canMark(r, i)) out.set(r + ':' + i, 'white');
      });
    }
    if (!state.turn.color) {
      ROWS.forEach((row, r) => {
        if (state.closed[r]) return;
        for (const w of whites) {
          const i = row.numbers.indexOf(w + state.dice[colorDie(r)]);
          // The white sum wins a tie: taking it first keeps the colour pair
          // available, so it is never the worse read of the same tap.
          if (i >= 0 && canMark(r, i) && !out.has(r + ':' + i)) {
            out.set(r + ':' + i, 'color');
          }
        }
      });
    }
    return out;
  }

  const triangular = n => (n * (n + 1)) / 2;

  function rowScore(r) {
    return triangular(marksIn(r) + (state.earned[r] ? 1 : 0));
  }

  function locks() {
    return state.closed.filter(Boolean).length;
  }

  function total() {
    let sum = 0;
    for (let r = 0; r < ROWS.length; r++) sum += rowScore(r);
    return sum - PENALTY * state.penalties;
  }

  /** Ends between turns, never mid-turn: the roll in hand is still played. */
  function checkOver() {
    if (state.phase === 'turn') return;
    if (locks() >= LOCKS_TO_END || state.penalties >= MAX_PENALTIES) {
      state.phase = 'over';
    }
  }

  /* ---- undo ----------------------------------------------------------- */

  function snapshot() {
    return {
      rows: state.rows.map(row => row.slice()),
      closed: state.closed.slice(),
      earned: state.earned.slice(),
      penalties: state.penalties,
      phase: state.phase,
      dice: state.dice.slice(),
      turn: { white: state.turn.white, color: state.turn.color }
    };
  }

  function push() {
    state.history.push(snapshot());
    if (state.history.length > UNDO_DEPTH) state.history.shift();
  }

  function undo() {
    const prev = state.history.pop();
    if (!prev) return;
    tray.cancel();
    rolling = false;
    Object.assign(state, prev);
    tray.showFaces(state.dice);
    tray.layout();
    save();
    render();
  }

  /* ---- actions -------------------------------------------------------- */

  function tapCell(r, i) {
    const key = r + ':' + i;
    const found = targets().get(key);
    if (!found) return;
    push();
    state.rows[r][i] = true;
    if (i === LAST) {
      state.closed[r] = true;
      state.earned[r] = true;
    }
    if (state.phase === 'turn') {
      if (found === 'white') state.turn.white = true;
      else state.turn.color = true;
    }
    save();
    render();
  }

  /** Closes or reopens a row someone else locked. Never scores a padlock. */
  function tapLock(r) {
    if (state.phase === 'over' || rolling) return;
    if (state.earned[r]) return;         // undo is how you take that back
    push();
    state.closed[r] = !state.closed[r];
    checkOver();
    save();
    render();
  }

  function doRoll() {
    if (state.phase !== 'idle' || rolling) return;
    push();
    const indices = [0, 1];
    for (let r = 0; r < ROWS.length; r++) if (!state.closed[r]) indices.push(colorDie(r));
    indices.sort((a, b) => a - b);
    // Faces are drawn before any physics randomness, so a test can force a
    // roll by stubbing the head of Math.random. See _README.md.
    for (const i of indices) state.dice[i] = DiceTray.randomFace();

    state.phase = 'turn';
    state.turn = { white: false, color: false };
    rolling = true;
    save();
    render();
    tray.roll(indices, state.dice, () => {
      rolling = false;
      render();
    });
  }

  function doDone() {
    if (rolling) return;
    if (state.phase === 'over') {
      startGame();
      return;
    }
    if (state.phase !== 'turn') return;
    push();
    if (!state.turn.white && !state.turn.color) state.penalties++;
    state.turn = { white: false, color: false };
    state.phase = 'idle';
    checkOver();
    save();
    render();
  }

  function startGame() {
    tray.cancel();
    rolling = false;
    state = fresh();
    tray.showFaces(state.dice);
    tray.layout();
    save();
    render();
  }

  /* ---- rendering ------------------------------------------------------ */

  function buildSheet() {
    el.sheet.textContent = '';
    ROWS.forEach((row, r) => {
      const node = document.createElement('div');
      node.className = 'row';
      node.dataset.color = row.key;
      node.dataset.row = String(r);
      cells[r] = [];

      row.numbers.forEach((n, i) => {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.type = 'button';
        cell.dataset.row = String(r);
        cell.dataset.index = String(i);
        cell.dataset.number = String(n);
        cell.textContent = String(n);
        cell.addEventListener('click', () => tapCell(r, i));
        node.append(cell);
        cells[r].push(cell);
      });

      const lock = document.createElement('button');
      lock.className = 'cell lock';
      lock.type = 'button';
      lock.dataset.row = String(r);
      lock.append(lockIcon());
      lock.addEventListener('click', () => tapLock(r));
      node.append(lock);
      lockCells[r] = lock;

      el.sheet.append(node);
    });
  }

  function lockIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'lock-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#lock-glyph');
    svg.append(use);
    return svg;
  }

  function buildTotals() {
    el.totals.textContent = '';
    const make = (caption, cls, color) => {
      const box = document.createElement('div');
      box.className = 'tot' + (cls ? ' ' + cls : '');
      if (color) box.dataset.color = color;
      const cap = document.createElement('span');
      cap.className = 'tot-cap';
      cap.textContent = caption;
      const value = document.createElement('b');
      box.append(cap, value);
      el.totals.append(box);
      return value;
    };
    ROWS.forEach(row => totalNodes.push(make(row.label, '', row.key)));
    totalNodes.push(make('Pen', 'pen', ''));
    totalNodes.push(make('Total', 'sum', ''));
  }

  function render() {
    document.body.dataset.phase = rolling ? 'rolling' : state.phase;
    const open = targets();

    ROWS.forEach((row, r) => {
      const rowNode = cells[r][0].parentElement;
      if (state.closed[r]) rowNode.dataset.closed = '';
      else delete rowNode.dataset.closed;

      row.numbers.forEach((n, i) => {
        const cell = cells[r][i];
        const marked = state.rows[r][i];
        if (marked) cell.dataset.marked = '';
        else delete cell.dataset.marked;
        const isTarget = open.has(r + ':' + i);
        if (isTarget) cell.dataset.target = '';
        else delete cell.dataset.target;
        cell.disabled = !isTarget;
        cell.setAttribute('aria-label',
          row.label + ' ' + n + (marked ? ', crossed off' : ''));
      });

      const lock = lockCells[r];
      if (state.closed[r]) lock.dataset.marked = '';
      else delete lock.dataset.marked;
      lock.disabled = state.phase === 'over' || rolling || state.earned[r];
      lock.setAttribute('aria-label', state.closed[r]
        ? row.label + ' row closed' + (state.earned[r] ? ', locked by you' : '')
        : 'Close the ' + row.label.toLowerCase() + ' row');
    });

    for (let i = 0; i < DICE; i++) {
      const node = tray.node(i);
      if (!node) continue;
      const locked = i >= 2 && state.closed[i - 2];
      if (locked) node.dataset.locked = '';
      else delete node.dataset.locked;
      node.setAttribute('aria-label', (i < 2 ? 'White' : ROWS[i - 2].label)
        + ' die showing ' + state.dice[i] + (locked ? ', out of play' : ''));
    }

    for (let r = 0; r < ROWS.length; r++) totalNodes[r].textContent = String(rowScore(r));
    totalNodes[ROWS.length].textContent = state.penalties
      ? '−' + state.penalties * PENALTY : '0';
    totalNodes[ROWS.length + 1].textContent = String(total());

    el.status.textContent = statusText(open);
    el.roll.disabled = state.phase !== 'idle' || rolling;
    el.done.disabled = rolling || state.phase === 'idle';
    el.done.textContent = doneLabel();
    el.undo.disabled = state.history.length === 0 || rolling;
  }

  function doneLabel() {
    if (state.phase === 'over') return 'New game';
    if (state.phase === 'turn' && !state.turn.white && !state.turn.color) {
      return 'Done −' + PENALTY;
    }
    return 'Done';
  }

  function statusText(open) {
    if (state.phase === 'over') {
      const why = state.penalties >= MAX_PENALTIES ? 'Four penalties' : 'Two rows locked';
      return why + ' — you scored ' + total();
    }
    if (rolling) return 'Rolling…';
    if (state.phase === 'turn') {
      if (!open.size) {
        return state.turn.white || state.turn.color
          ? 'Nothing else fits — tap Done'
          : 'No legal move — Done costs ' + PENALTY;
      }
      if (!state.turn.white && !state.turn.color) {
        return 'White ' + (state.dice[0] + state.dice[1]) + ', or a colour pair';
      }
      return state.turn.white ? 'One colour pair left' : 'Colour pair taken';
    }
    return 'Their turn — or tap Roll for yours';
  }

  /* ---- start ---------------------------------------------------------- */

  // Bind through a null-tolerant helper: a service worker can pair markup
  // from one release with script from the next, and one missing control
  // should cost that control rather than the whole page. See CLAUDE.md.
  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  on(el.roll, 'click', doRoll);
  on(el.done, 'click', doDone);
  on(el.undo, 'click', undo);
  on(el.newGame, 'click', startGame);
  Modal.create(el.rules, { trigger: el.rulesBtn });

  buildSheet();
  buildTotals();
  tray.setCount(DICE);
  tray.showFaces(state.dice);
  render();
})();
