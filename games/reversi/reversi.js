// Reversi. See _README.md for the rules and the naming note.
(function () {
  const STORAGE_KEY = 'games.reversi.v1';
  const SIZE = 8;
  const CELLS = SIZE * SIZE;
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const CODES = { '.': 0, a: 1, b: 2 };
  const CHARS = ['.', 'a', 'b'];

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
    tally1: pick('tally-1'),
    tally2: pick('tally-2'),
    count1: pick('count-1'),
    count2: pick('count-2'),
    undo: pick('undo', 'button'),
    reset: pick('reset', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  let state = load();
  let undoStack = [];   // in-memory, like the other board games'
  let squares = [];
  // Discs flipped by the move just played, so the animation runs once.
  let flipped = [];

  function startBoard() {
    const board = new Array(CELLS).fill(0);
    // Player 1 on d5/e4, player 2 on d4/e5 — the standard opening cross.
    board[27] = 1; board[28] = 2;
    board[35] = 2; board[36] = 1;
    return board;
  }

  function encode(board) {
    return board.map(v => CHARS[v]).join('');
  }

  function decode(text) {
    if (typeof text !== 'string' || text.length !== CELLS) return null;
    const board = new Array(CELLS).fill(0);
    for (let i = 0; i < CELLS; i++) {
      if (!(text[i] in CODES)) return null;
      board[i] = CODES[text[i]];
    }
    return board;
  }

  function fresh() {
    return { board: startBoard(), turn: 1, over: false, passed: false };
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    if (!p) return fresh();
    const board = decode(p.board);
    if (!board) return fresh();
    return {
      board,
      turn: p.turn === 2 ? 2 : 1,
      over: p.over === true,
      passed: p.passed === true
    };
  }

  function save() {
    Store.save(STORAGE_KEY, {
      board: encode(state.board), turn: state.turn,
      over: state.over, passed: state.passed
    });
  }

  function other(player) {
    return player === 1 ? 2 : 1;
  }

  /** Discs that placing on `i` would turn over. Empty means the move is illegal. */
  function gains(board, i, player) {
    if (board[i] !== 0) return [];
    const row = i >> 3;
    const col = i & 7;
    const foe = other(player);
    const won = [];

    for (const [dr, dc] of DIRS) {
      const run = [];
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === foe) {
        run.push(r * SIZE + c);
        r += dr;
        c += dc;
      }
      // The run only counts if one of ours closes it off — running off the
      // edge, or into a gap, traps nothing.
      const closed = r >= 0 && r < SIZE && c >= 0 && c < SIZE
        && board[r * SIZE + c] === player;
      if (run.length && closed) won.push(...run);
    }
    return won;
  }

  function legalMoves(board, player) {
    const moves = new Map();
    for (let i = 0; i < CELLS; i++) {
      const won = gains(board, i, player);
      if (won.length) moves.set(i, won);
    }
    return moves;
  }

  function counts(board) {
    let a = 0;
    let b = 0;
    for (const v of board) {
      if (v === 1) a++;
      else if (v === 2) b++;
    }
    return [a, b];
  }

  function build() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < CELLS; i++) {
      const sq = document.createElement('button');
      sq.className = 'sq';
      sq.type = 'button';
      sq.dataset.index = String(i);
      const disc = document.createElement('span');
      disc.className = 'disc';
      sq.append(disc);
      sq.addEventListener('click', () => tap(i));
      squares.push(sq);
      frag.append(sq);
    }
    el.board.append(frag);
  }

  function where(i) {
    return String.fromCharCode(97 + (i & 7)) + (8 - (i >> 3));
  }

  function describe(i, owner, playable) {
    if (owner) return 'Player ' + owner + ' disc on ' + where(i);
    return playable ? 'Play ' + where(i) : where(i);
  }

  function render() {
    const moves = state.over ? new Map() : legalMoves(state.board, state.turn);

    for (let i = 0; i < CELLS; i++) {
      const sq = squares[i];
      const owner = state.board[i];
      if (owner) sq.dataset.p = String(owner);
      else delete sq.dataset.p;

      const playable = moves.has(i);
      if (playable) sq.dataset.play = '';
      else delete sq.dataset.play;
      sq.disabled = !playable;

      sq.setAttribute('aria-label', describe(i, owner, playable));
    }

    // Restart the flip animation by removing the attribute, forcing a reflow
    // and putting it back — otherwise a disc flipped twice in a row sits still.
    for (const sq of squares) delete sq.dataset.flip;
    if (flipped.length) {
      void el.board.offsetWidth;
      for (const i of flipped) squares[i].dataset.flip = '';
      flipped = [];
    }

    const [a, b] = counts(state.board);
    el.count1.textContent = String(a);
    el.count2.textContent = String(b);
    const leader = state.over ? 0 : state.turn;
    if (leader === 1) el.tally1.dataset.turn = ''; else delete el.tally1.dataset.turn;
    if (leader === 2) el.tally2.dataset.turn = ''; else delete el.tally2.dataset.turn;

    el.undo.disabled = undoStack.length === 0;
    renderTurn(a, b);
  }

  function renderTurn(a, b) {
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
    el.turnLabel.textContent = 'Player ' + state.turn + ' to move'
      + (state.passed ? ', player ' + other(state.turn) + ' had no move' : '');
  }

  function tap(i) {
    if (state.over) return;
    const won = gains(state.board, i, state.turn);
    if (!won.length) return;

    undoStack.push({
      board: encode(state.board), turn: state.turn,
      over: state.over, passed: state.passed
    });

    state.board[i] = state.turn;
    for (const j of won) state.board[j] = state.turn;
    flipped = won;

    // Whoever is next must have a move; if not they pass, and if neither
    // side can move the game is over. See _README.md.
    const next = other(state.turn);
    if (legalMoves(state.board, next).size) {
      state.turn = next;
      state.passed = false;
    } else if (legalMoves(state.board, state.turn).size) {
      state.passed = true;
    } else {
      state.over = true;
      state.passed = false;
    }

    save();
    render();
  }

  el.undo.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    const board = decode(prev.board);
    if (!board) return;
    state = { board, turn: prev.turn, over: prev.over, passed: prev.passed };
    flipped = [];
    save();
    render();
  });

  el.reset.addEventListener('click', () => {
    state = fresh();
    undoStack = [];
    flipped = [];
    save();
    render();
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  build();
  render();
})();
