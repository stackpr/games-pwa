// Mancala, with two rule sets. See _README.md for both, and for the layout.
(function () {
  const STORAGE_KEY = 'games.mancala.v1';
  const CELLS = 14;
  const PER_PIT = 4;
  const MAX_PIPS = 12;       // past this the pit shows a number instead
  const RULES = ['capture', 'avalanche'];
  // 0-5 are player 1's pits, 6 their store; 7-12 player 2's, 13 theirs.
  const STORE = { 1: 6, 2: 13 };
  const PITS = { 1: [0, 1, 2, 3, 4, 5], 2: [7, 8, 9, 10, 11, 12] };

  /**
   * A new worker can serve this script alongside the previous release's HTML,
   * so any element may be missing. An inert stand-in keeps both the handlers
   * and render() harmless instead of one null blanking the page. See CLAUDE.md.
   */
  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'span');
  }

  const el = {
    board: pick('board'),
    turn: pick('turn'),
    turnText: pick('turn-text'),
    turnLabel: pick('turn-label'),
    note: pick('note'),
    undo: pick('undo', 'button'),
    reset: pick('reset', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button'),
    pickRow: pick('pick-row')
  };

  let state = load();
  let undoStack = [];   // in-memory, like the other board games'
  let cells = [];
  // Pits the move just played dropped a seed into, so the pulse runs once.
  let hits = [];
  let note = '';

  function other(player) {
    return player === 1 ? 2 : 1;
  }

  function opposite(i) {
    return 12 - i;
  }

  function owner(i) {
    if (i === STORE[1]) return 1;
    if (i === STORE[2]) return 2;
    return i < 6 ? 1 : 2;
  }

  function startBoard() {
    const board = new Array(CELLS).fill(PER_PIT);
    board[STORE[1]] = 0;
    board[STORE[2]] = 0;
    return board;
  }

  function fresh(rules) {
    return { board: startBoard(), turn: 1, over: false, rules };
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    const rules = p && RULES.indexOf(p.rules) !== -1 ? p.rules : RULES[0];
    if (!p || !Array.isArray(p.board) || p.board.length !== CELLS) return fresh(rules);
    const board = p.board.map(n => Number.isInteger(n) && n >= 0 ? n : -1);
    // A count that never adds up is a save worth abandoning rather than
    // half-trusting; the seeds are conserved by every legal move.
    const total = board.reduce((a, b) => a + b, 0);
    if (board.indexOf(-1) !== -1 || total !== PER_PIT * 12) return fresh(rules);
    return { board, turn: p.turn === 2 ? 2 : 1, over: p.over === true, rules };
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  function sideEmpty(board, player) {
    return PITS[player].every(i => board[i] === 0);
  }

  function legal(board, player, i) {
    return PITS[player].indexOf(i) !== -1 && board[i] > 0;
  }

  /** Drop `seeds` one per cell from `from`, skipping the other store. */
  function drop(board, from, seeds, player, touched) {
    const skip = STORE[other(player)];
    let i = from;
    while (seeds > 0) {
      i = (i + 1) % CELLS;
      if (i === skip) continue;
      board[i]++;
      seeds--;
      touched.push(i);
    }
    return i;
  }

  /**
   * Play `start` for `player` on a copy of the board. Returns the new board,
   * whether the player moves again, the pits touched, and a line of prose
   * for the note. Rule differences live here and nowhere else.
   */
  function play(board, start, player, rules) {
    const next = board.slice();
    const touched = [];
    let again = false;
    let text = '';

    if (rules === 'avalanche') {
      let laps = 0;
      let i = start;
      for (;;) {
        const seeds = next[i];
        next[i] = 0;
        i = drop(next, i, seeds, player, touched);
        laps++;
        // Your store ends it, and so does a pit that was empty before this
        // seed. Anything else is scooped up and sown onward.
        if (i === STORE[player] || next[i] === 1) break;
      }
      if (laps > 1) text = 'Avalanche of ' + laps;
    } else {
      const seeds = next[start];
      next[start] = 0;
      const last = drop(next, start, seeds, player, touched);
      if (last === STORE[player]) {
        again = true;
        text = 'Extra turn';
      } else if (owner(last) === player && next[last] === 1
        && next[opposite(last)] > 0) {
        const taken = next[last] + next[opposite(last)];
        next[STORE[player]] += taken;
        next[last] = 0;
        next[opposite(last)] = 0;
        touched.push(STORE[player]);
        text = 'Captured ' + taken;
      }
    }

    // Either side running dry ends it, and the seeds still on the board go
    // to whoever owns the pits holding them.
    let over = false;
    for (const p of [1, 2]) {
      if (!sideEmpty(next, p)) continue;
      const foe = other(p);
      let swept = 0;
      for (const i of PITS[foe]) {
        swept += next[i];
        next[i] = 0;
      }
      next[STORE[foe]] += swept;
      over = true;
      if (swept) text = (text ? text + '. ' : '') + 'Player ' + foe + ' sweeps ' + swept;
      break;
    }

    return { board: next, again, over, touched, text };
  }

  function build() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < CELLS; i++) {
      const store = i === STORE[1] || i === STORE[2];
      const cell = document.createElement(store ? 'div' : 'button');
      cell.className = store ? 'cell store' : 'cell';
      cell.dataset.i = String(i);
      cell.dataset.owner = String(owner(i));
      if (!store) {
        cell.type = 'button';
        cell.addEventListener('click', () => tap(i));
      }
      const seeds = document.createElement('span');
      seeds.className = 'seeds';
      const count = document.createElement('span');
      count.className = 'count';
      cell.append(seeds, count);
      cells.push({ cell, seeds, count, pips: 0 });
      frag.append(cell);
    }
    el.board.append(frag);
  }

  function describe(i, n) {
    if (i === STORE[1]) return "Player 1's store, " + n + ' seeds';
    if (i === STORE[2]) return "Player 2's store, " + n + ' seeds';
    // Numbered in sowing order, so pit 6 is always the one beside the store.
    const side = owner(i);
    const pos = side === 1 ? i + 1 : i - 6;
    return 'Player ' + side + ' pit ' + pos + ', ' + n + ' seeds';
  }

  function render() {
    for (let i = 0; i < CELLS; i++) {
      const view = cells[i];
      const n = state.board[i];
      const store = i === STORE[1] || i === STORE[2];
      const pips = store || n > MAX_PIPS ? 0 : n;

      if (view.pips !== pips) {
        view.seeds.textContent = '';
        for (let s = 0; s < pips; s++) {
          const seed = document.createElement('i');
          seed.className = 'seed';
          view.seeds.append(seed);
        }
        view.pips = pips;
      }
      view.count.textContent = String(n);
      if (!store && n > MAX_PIPS) view.cell.dataset.many = '';
      else delete view.cell.dataset.many;

      const playable = !state.over && !store && legal(state.board, state.turn, i);
      if (playable) view.cell.dataset.play = '';
      else delete view.cell.dataset.play;
      if (!store) view.cell.disabled = !playable;

      view.cell.setAttribute('aria-label', describe(i, n));
    }

    // Restart the pulse the way reversi restarts its flip: drop the attribute,
    // force a reflow, put it back, or a pit hit twice running sits still.
    for (const view of cells) delete view.cell.dataset.hit;
    if (hits.length) {
      void el.board.offsetWidth;
      for (const i of hits) cells[i].cell.dataset.hit = '';
      hits = [];
    }

    el.note.textContent = note;
    el.undo.disabled = undoStack.length === 0;
    renderTurn();
  }

  function renderTurn() {
    const a = state.board[STORE[1]];
    const b = state.board[STORE[2]];
    if (state.over) {
      const winner = a === b ? 0 : a > b ? 1 : 2;
      el.turn.dataset.state = 'over';
      el.turn.dataset.player = winner ? String(winner) : 'none';
      el.turnText.textContent = winner ? 'Wins!' : 'Draw';
      el.turnLabel.textContent = winner
        ? 'Player ' + winner + ' wins, ' + a + ' to ' + b
        : 'Draw, ' + a + ' each';
      return;
    }
    el.turn.dataset.state = 'playing';
    el.turn.dataset.player = String(state.turn);
    el.turnText.textContent = 'Next:';
    el.turnLabel.textContent = 'Player ' + state.turn + ' to move, '
      + a + ' to ' + b + (note ? '. ' + note : '');
  }

  function tap(i) {
    if (state.over || !legal(state.board, state.turn, i)) return;

    undoStack.push({ board: state.board.slice(), turn: state.turn, over: state.over });

    const result = play(state.board, i, state.turn, state.rules);
    state.board = result.board;
    state.over = result.over;
    if (!result.over && !result.again) state.turn = other(state.turn);
    hits = result.touched;
    note = result.text;

    save();
    render();
  }

  function setRules(rules) {
    if (RULES.indexOf(rules) === -1) return;
    for (const b of el.pickRow.children) {
      b.setAttribute('aria-pressed', b.dataset.rules === rules ? 'true' : 'false');
    }
    el.rules.dataset.rules = rules;
    if (state.rules === rules) return;
    state = fresh(rules);
    undoStack = [];
    hits = [];
    note = '';
    save();
    render();
  }

  el.undo.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    state.board = prev.board;
    state.turn = prev.turn;
    state.over = prev.over;
    hits = [];
    note = '';
    save();
    render();
  });

  el.reset.addEventListener('click', () => {
    state = fresh(state.rules);
    undoStack = [];
    hits = [];
    note = '';
    save();
    render();
  });

  for (const b of el.pickRow.children) {
    b.addEventListener('click', () => setRules(b.dataset.rules));
  }

  Modal.create(el.rules, { trigger: el.rulesBtn });

  build();
  setRules(state.rules);
  render();
})();
