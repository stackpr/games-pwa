// Honeycomb: 3 Bees. See _README.md for the rules, the name and the geometry.
(function () {
  const STORAGE_KEY = 'games.honeycomb-3-bees.v1';
  const RADIUS = 3;                       // a comb of 37 cells
  const COLOURS = ['w', 'g', 'b'];
  const SUPPLY = { w: 6, g: 8, b: 10 };
  // Win by any one of these. 'each' is two of every colour.
  const TARGET = { w: 3, g: 4, b: 5, each: 2 };
  // Axial neighbours, walked as a cycle — the order matters, because "free"
  // means two *consecutive* open sides.
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

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
    hint: pick('hint'),
    tray1: pick('tray-1'),
    tray2: pick('tray-2'),
    undo: pick('undo', 'button'),
    reset: pick('reset', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button'),
    picks: {},
    pool: {},
    caps: {}
  };
  for (const c of COLOURS) {
    el.picks[c] = pick('pick-' + c, 'button');
    el.pool[c] = pick('pool-' + c);
    el.caps['1' + c] = pick('c1' + c);
    el.caps['2' + c] = pick('c2' + c);
  }

  /** Every cell of the starting hexagon, in a stable order. */
  const CELLS = (function () {
    const out = [];
    for (let r = -RADIUS; r <= RADIUS; r++) {
      const lo = Math.max(-RADIUS, -RADIUS - r);
      const hi = Math.min(RADIUS, RADIUS - r);
      for (let q = lo; q <= hi; q++) out.push([q, r]);
    }
    return out;
  })();
  const KEYS = CELLS.map(([q, r]) => q + ',' + r);
  const INDEX = new Map(KEYS.map((k, i) => [k, i]));

  let state = load();
  let undoStack = [];      // in-memory, like the other board games'
  let squares = [];        // one node per cell, in CELLS order
  let picked = null;       // colour chosen for a placement
  let selected = null;     // bee picked up for a jump

  function key(q, r) {
    return q + ',' + r;
  }

  function step(k, d, times) {
    const [q, r] = k.split(',').map(Number);
    return key(q + DIRS[d][0] * (times || 1), r + DIRS[d][1] * (times || 1));
  }

  /* ---- state ---------------------------------------------------------- */

  function fresh() {
    const cells = {};
    for (const k of KEYS) cells[k] = '';
    return {
      cells,
      pool: { w: SUPPLY.w, g: SUPPLY.g, b: SUPPLY.b },
      caps: [{ w: 0, g: 0, b: 0 }, { w: 0, g: 0, b: 0 }],
      turn: 1,
      phase: 'move',
      chain: null,          // mid-jump, the cell that must keep jumping
      winner: 0
    };
  }

  /** 37 characters: '-' removed, '.' empty cell, or the bee on it. */
  function encode(cells) {
    return KEYS.map(k => (k in cells ? (cells[k] || '.') : '-')).join('');
  }

  function decode(text) {
    if (typeof text !== 'string' || text.length !== KEYS.length) return null;
    const cells = {};
    for (let i = 0; i < KEYS.length; i++) {
      const ch = text[i];
      if (ch === '-') continue;
      if (ch === '.') cells[KEYS[i]] = '';
      else if (COLOURS.indexOf(ch) !== -1) cells[KEYS[i]] = ch;
      else return null;
    }
    return cells;
  }

  function tally(p) {
    const n = { w: 0, g: 0, b: 0 };
    for (const c of COLOURS) n[c] = Number.isInteger(p && p[c]) && p[c] >= 0 ? p[c] : 0;
    return n;
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    if (!p) return fresh();
    const cells = decode(p.cells);
    if (!cells) return fresh();
    const caps = [tally(p.caps && p.caps[0]), tally(p.caps && p.caps[1])];
    const pool = tally(p.pool);
    // Bees are conserved: what is on the board plus both stacks plus the
    // pool has to be the full supply, or the save is not a position this
    // game can have reached.
    for (const c of COLOURS) {
      let n = pool[c] + caps[0][c] + caps[1][c];
      for (const k of Object.keys(cells)) if (cells[k] === c) n++;
      if (n !== SUPPLY[c]) return fresh();
    }
    return {
      cells, pool, caps,
      turn: p.turn === 2 ? 2 : 1,
      phase: p.phase === 'remove' ? 'remove' : 'move',
      chain: typeof p.chain === 'string' && p.chain in cells ? p.chain : null,
      winner: p.winner === 1 || p.winner === 2 ? p.winner : 0
    };
  }

  function save() {
    Store.save(STORAGE_KEY, {
      cells: encode(state.cells), pool: state.pool, caps: state.caps,
      turn: state.turn, phase: state.phase, chain: state.chain, winner: state.winner
    });
  }

  function snapshot() {
    return {
      cells: encode(state.cells),
      pool: Object.assign({}, state.pool),
      caps: [Object.assign({}, state.caps[0]), Object.assign({}, state.caps[1])],
      turn: state.turn, phase: state.phase, chain: state.chain, winner: state.winner
    };
  }

  /* ---- rules ---------------------------------------------------------- */

  /**
   * A cell comes off only from the edge, which in practice means it has two
   * neighbouring positions *next to each other* with no cell in them —
   * otherwise it would have to slide past its neighbours to get out.
   */
  function removable(k) {
    if (!(k in state.cells) || state.cells[k]) return false;
    const open = DIRS.map((_, d) => !(step(k, d) in state.cells));
    for (let d = 0; d < 6; d++) {
      if (open[d] && open[(d + 1) % 6]) return true;
    }
    return false;
  }

  function removableCells() {
    return Object.keys(state.cells).filter(removable);
  }

  /** Jumps available from one cell. */
  function jumpsFrom(k) {
    const out = [];
    if (!state.cells[k]) return out;
    for (let d = 0; d < 6; d++) {
      const over = step(k, d);
      const to = step(k, d, 2);
      if (state.cells[over] && to in state.cells && state.cells[to] === '') {
        out.push({ from: k, over, to });
      }
    }
    return out;
  }

  /** Every jump on the board, or only the locked bee's mid-chain. */
  function allJumps() {
    if (state.chain) return jumpsFrom(state.chain);
    const out = [];
    for (const k of Object.keys(state.cells)) out.push(...jumpsFrom(k));
    return out;
  }

  /** Bees a player may place: the pool, or their own stack once it dries. */
  function placeable() {
    const total = COLOURS.reduce((n, c) => n + state.pool[c], 0);
    return total > 0 ? state.pool : state.caps[state.turn - 1];
  }

  function fromOwnStack() {
    return COLOURS.reduce((n, c) => n + state.pool[c], 0) === 0;
  }

  /** The connected groups of cells, in a stable order. */
  function groups() {
    const seen = new Set();
    const out = [];
    for (const start of KEYS) {
      if (!(start in state.cells) || seen.has(start)) continue;
      const group = [];
      const queue = [start];
      seen.add(start);
      while (queue.length) {
        const k = queue.pop();
        group.push(k);
        for (let d = 0; d < 6; d++) {
          const n = step(k, d);
          if (n in state.cells && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      out.push(group);
    }
    return out;
  }

  /**
   * A ring that comes away from the comb is off the board — it cannot be
   * jumped to or from again, so leaving it there would only be clutter that
   * counts towards nothing. Every group but the largest is removed, and any
   * bees riding on those rings go to the player whose move cut them off,
   * whether or not the group was full. See _README.md.
   */
  function claimIsolated() {
    const all = groups();
    if (all.length < 2) return null;

    // The comb is whatever is left of the main body; ties go to the group
    // holding the first cell in board order, so the result never depends on
    // the order the cells happen to be stored in.
    let main = 0;
    for (let i = 1; i < all.length; i++) {
      if (all[i].length > all[main].length) main = i;
    }

    const taken = { w: 0, g: 0, b: 0 };
    for (let i = 0; i < all.length; i++) {
      if (i === main) continue;
      for (const k of all[i]) {
        if (state.cells[k]) taken[state.cells[k]]++;
        delete state.cells[k];
      }
    }

    const mine = state.caps[state.turn - 1];
    for (const c of COLOURS) mine[c] += taken[c];
    return taken;
  }

  function hasWon(caps) {
    if (caps.w >= TARGET.w || caps.g >= TARGET.g || caps.b >= TARGET.b) return true;
    return COLOURS.every(c => caps[c] >= TARGET.each);
  }

  /** A player with nothing at all to do loses; see _README.md. */
  function stuck() {
    if (allJumps().length) return false;
    const supply = placeable();
    const haveMarble = COLOURS.some(c => supply[c] > 0);
    const haveRing = Object.keys(state.cells).some(k => !state.cells[k]);
    return !(haveMarble && haveRing);
  }

  function endTurn() {
    state.chain = null;
    selected = null;
    picked = null;
    if (hasWon(state.caps[state.turn - 1])) {
      state.winner = state.turn;
      state.phase = 'move';
      return;
    }
    state.turn = state.turn === 1 ? 2 : 1;
    state.phase = 'move';
    if (stuck()) state.winner = state.turn === 1 ? 2 : 1;
  }

  /* ---- moves ---------------------------------------------------------- */

  function place(k) {
    const supply = placeable();
    if (!picked || !supply[picked]) return;
    if (!(k in state.cells) || state.cells[k]) return;

    undoStack.push(snapshot());
    supply[picked]--;
    state.cells[k] = picked;
    picked = null;

    // Placing and taking a cell away are one move, so the turn does not end
    // until the cell is gone — unless there is no cell that can come off.
    if (removableCells().length) {
      state.phase = 'remove';
    } else {
      claimIsolated();
      endTurn();
    }
    save();
    render();
  }

  function removeCell(k) {
    if (state.phase !== 'remove' || !removable(k)) return;
    delete state.cells[k];
    claimIsolated();
    endTurn();
    save();
    render();
  }

  function jump(move) {
    undoStack.push(snapshot());
    state.caps[state.turn - 1][state.cells[move.over]]++;
    state.cells[move.to] = state.cells[move.from];
    state.cells[move.from] = '';
    delete state.cells[move.over];

    claimIsolated();
    // The same bee keeps going while it can, which is what makes a chain
    // worth setting up.
    if (jumpsFrom(move.to).length && !hasWon(state.caps[state.turn - 1])) {
      state.chain = move.to;
      selected = move.to;
    } else {
      endTurn();
    }
    save();
    render();
  }

  function tap(k) {
    if (state.winner) return;
    // The owed cell comes first. A placement can hand the mover a jump, and
    // asking about jumps here would swallow the half-finished move — the
    // cell would never come off and the turn would never end. Jumps belong
    // to the START of a turn, which is the only time phase is 'move'.
    if (state.phase === 'remove') return removeCell(k);

    const jumps = allJumps();
    if (jumps.length) {
      if (selected) {
        const move = jumps.find(m => m.from === selected && m.to === k);
        if (move) return jump(move);
      }
      if (state.chain) return;                       // mid-chain, not yours to drop
      if (jumps.some(m => m.from === k)) {
        selected = selected === k ? null : k;
        render();
      }
      return;
    }

    place(k);
  }

  /* ---- rendering ------------------------------------------------------ */

  function build() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < CELLS.length; i++) {
      const [q, r] = CELLS[i];
      const node = document.createElement('button');
      node.className = 'cell';
      node.type = 'button';
      node.dataset.k = KEYS[i];
      // Axial to pixel, as multiples of one step; the CSS turns these into
      // percentages of the board. Both orientations are set here and the
      // stylesheet chooses — no JS runs on a rotation.
      node.style.setProperty('--x', String(q + r / 2));
      node.style.setProperty('--y', String(r * 0.8660254));
      node.style.setProperty('--fx', String(q * 0.8660254));
      node.style.setProperty('--fy', String(r + q / 2));
      const bee = document.createElement('span');
      bee.className = 'bee';
      node.append(bee);
      node.addEventListener('click', () => tap(KEYS[i]));
      squares.push(node);
      frag.append(node);
    }
    el.board.append(frag);
  }

  const NAMES = { w: 'light', g: 'mid', b: 'dark' };

  function describe(k, bee, live) {
    const where = k.replace(',', ' ');
    if (!(k in state.cells)) return 'Gap at ' + where;
    if (bee) return NAMES[bee] + ' bee at ' + where
      + (live === 'jump' ? ', can jump' : '');
    if (live === 'drop') return 'Empty cell at ' + where + ', place here';
    if (live === 'take') return 'Empty cell at ' + where + ', remove it';
    return 'Empty cell at ' + where;
  }

  function render() {
    // Same reason as tap(): while a cell is owed, the board is not offering
    // jumps even if one is now available.
    const jumps = state.winner || state.phase === 'remove' ? [] : allJumps();
    const jumpFrom = new Set(jumps.map(m => m.from));
    const targets = new Set(
      selected ? jumps.filter(m => m.from === selected).map(m => m.to) : []);
    const canRemove = state.phase === 'remove' && !state.winner
      ? new Set(removableCells()) : new Set();
    const supply = placeable();
    const canPlace = !state.winner && !jumps.length && state.phase === 'move'
      && picked && supply[picked] > 0;

    for (let i = 0; i < squares.length; i++) {
      const k = KEYS[i];
      const node = squares[i];
      const here = k in state.cells;
      if (here) delete node.dataset.gone;
      else node.dataset.gone = '';

      const bee = here ? state.cells[k] : '';
      if (bee) node.dataset.c = bee;
      else delete node.dataset.c;

      let live = '';
      if (!here) live = '';
      else if (jumps.length) {
        if (targets.has(k)) live = 'drop';
        else if (!state.chain && jumpFrom.has(k)) live = 'jump';
        else if (state.chain === k) live = 'jump';
      } else if (canRemove.has(k)) live = 'take';
      else if (canPlace && !bee) live = 'drop';

      if (live) node.dataset.live = live;
      else delete node.dataset.live;
      if (selected === k) node.dataset.sel = '';
      else delete node.dataset.sel;

      node.disabled = !here || !live;
      node.setAttribute('aria-label', describe(k, bee, live));
    }

    for (const c of COLOURS) {
      el.pool[c].textContent = String(supply[c]);
      const usable = !state.winner && !jumps.length && state.phase === 'move'
        && supply[c] > 0;
      el.picks[c].disabled = !usable;
      el.picks[c].setAttribute('aria-pressed', picked === c ? 'true' : 'false');
      for (const side of [1, 2]) {
        const caps = state.caps[side - 1];
        const box = el.caps[side + c];
        box.lastElementChild.textContent = String(caps[c]);
        if (caps[c] >= TARGET[c]) box.dataset.done = '';
        else delete box.dataset.done;
      }
    }
    if (state.turn === 1 && !state.winner) el.tray1.dataset.turn = '';
    else delete el.tray1.dataset.turn;
    if (state.turn === 2 && !state.winner) el.tray2.dataset.turn = '';
    else delete el.tray2.dataset.turn;

    el.undo.disabled = undoStack.length === 0;
    renderTurn(jumps);
  }

  function renderTurn(jumps) {
    if (state.winner) {
      el.turn.dataset.state = 'over';
      el.turn.dataset.player = String(state.winner);
      el.turnText.textContent = 'Wins!';
      el.turnLabel.textContent = 'Player ' + state.winner + ' wins';
      el.hint.textContent = '';
      return;
    }
    el.turn.dataset.state = 'playing';
    el.turn.dataset.player = String(state.turn);
    el.turnText.textContent = 'Next:';

    let hint;
    if (state.chain) hint = 'Keep jumping with that bee.';
    else if (jumps.length) hint = 'A jump is on — you have to take it.';
    else if (state.phase === 'remove') hint = 'Now take a cell off the edge.';
    else if (picked) hint = 'Tap an empty cell.';
    else if (fromOwnStack()) hint = 'Pool is empty — place from what you have taken.';
    else hint = 'Pick a bee, then a cell.';
    el.hint.textContent = hint;
    el.turnLabel.textContent = 'Player ' + state.turn + ' to move. ' + hint;
  }

  /* ---- wiring --------------------------------------------------------- */

  for (const c of COLOURS) {
    el.picks[c].addEventListener('click', () => {
      picked = picked === c ? null : c;
      render();
    });
  }

  el.undo.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    const cells = decode(prev.cells);
    if (!cells) return;
    state = {
      cells, pool: prev.pool, caps: prev.caps, turn: prev.turn,
      phase: prev.phase, chain: prev.chain, winner: prev.winner
    };
    picked = null;
    selected = null;
    save();
    render();
  });

  el.reset.addEventListener('click', () => {
    state = fresh();
    undoStack = [];
    picked = null;
    selected = null;
    save();
    render();
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  build();
  render();
})();
