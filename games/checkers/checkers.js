// Checkers with forced jumps. See _README.md for the rule set.
(function () {
  const STORAGE_KEY = 'games.checkers.v1';
  const SIZE = 8;
  const CELLS = SIZE * SIZE;
  // Player 1 sits at the bottom and moves up the board; player 2 the reverse.
  const FORWARD = { 1: -1, 2: 1 };
  const CROWN_ROW = { 1: 0, 2: SIZE - 1 };
  const CODES = { '.': null, a: { player: 1, king: false }, A: { player: 1, king: true },
    b: { player: 2, king: false }, B: { player: 2, king: true } };

  const el = {
    board: document.getElementById('board'),
    turn: document.getElementById('turn'),
    turnText: document.getElementById('turn-text'),
    turnLabel: document.getElementById('turn-label'),
    undo: document.getElementById('undo'),
    reset: document.getElementById('reset'),
    rules: document.getElementById('rules'),
    rulesBtn: document.getElementById('rules-btn')
  };

  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  let state = load();
  let selected = null;
  let undoStack = [];   // in-memory, like the scorekeeper's
  let squares = [];

  function startBoard() {
    const board = new Array(CELLS).fill(null);
    for (let i = 0; i < CELLS; i++) {
      if (!isDark(i)) continue;
      const row = i >> 3;
      if (row < 3) board[i] = { player: 2, king: false };
      else if (row > 4) board[i] = { player: 1, king: false };
    }
    return board;
  }

  function isDark(i) {
    return (((i >> 3) + (i & 7)) & 1) === 1;
  }

  function encode(board) {
    return board.map(p => {
      if (!p) return '.';
      if (p.player === 1) return p.king ? 'A' : 'a';
      return p.king ? 'B' : 'b';
    }).join('');
  }

  function decode(text) {
    if (typeof text !== 'string' || text.length !== CELLS) return null;
    const board = new Array(CELLS).fill(null);
    for (let i = 0; i < CELLS; i++) {
      const code = text[i];
      if (!(code in CODES)) return null;
      const piece = CODES[code];
      // A piece off the dark squares is not a position this game can reach.
      if (piece && !isDark(i)) return null;
      board[i] = piece ? { player: piece.player, king: piece.king } : null;
    }
    return board;
  }

  function fresh() {
    return { board: startBoard(), turn: 1, locked: null, winner: 0 };
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    if (!p) return fresh();
    const board = decode(p.board);
    if (!board) return fresh();
    const turn = p.turn === 2 ? 2 : 1;
    const locked = Number.isInteger(p.locked) && p.locked >= 0 && p.locked < CELLS
      && board[p.locked] && board[p.locked].player === turn ? p.locked : null;
    const winner = p.winner === 1 || p.winner === 2 ? p.winner : 0;
    return { board, turn, locked, winner };
  }

  function save() {
    Store.save(STORAGE_KEY, {
      board: encode(state.board), turn: state.turn,
      locked: state.locked, winner: state.winner
    });
  }

  function dirsFor(piece) {
    if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const dr = FORWARD[piece.player];
    return [[dr, -1], [dr, 1]];
  }

  function at(board, row, col) {
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return undefined;
    return board[row * SIZE + col];
  }

  /** Steps and jumps available to the single piece on `i`. */
  function movesFrom(board, i) {
    const piece = board[i];
    const steps = [];
    const jumps = [];
    if (!piece) return { steps, jumps };
    const row = i >> 3;
    const col = i & 7;

    for (const [dr, dc] of dirsFor(piece)) {
      const overCell = at(board, row + dr, col + dc);
      if (overCell === undefined) continue;
      if (overCell === null) {
        steps.push({ from: i, to: (row + dr) * SIZE + (col + dc) });
        continue;
      }
      if (overCell.player === piece.player) continue;
      const landing = at(board, row + 2 * dr, col + 2 * dc);
      if (landing === null) {
        jumps.push({
          from: i,
          to: (row + 2 * dr) * SIZE + (col + 2 * dc),
          capture: (row + dr) * SIZE + (col + dc)
        });
      }
    }
    return { steps, jumps };
  }

  /**
   * Every move `player` may legally make. Jumping is forced, so if any piece
   * can jump then only jumps come back. Mid-chain, only the locked piece
   * may move at all. See _README.md.
   */
  function legalMoves(board, player, locked) {
    const owned = [];
    if (locked != null) owned.push(locked);
    else for (let i = 0; i < CELLS; i++) {
      if (board[i] && board[i].player === player) owned.push(i);
    }

    const jumps = [];
    const steps = [];
    for (const i of owned) {
      const m = movesFrom(board, i);
      jumps.push(...m.jumps);
      steps.push(...m.steps);
    }
    if (jumps.length) return jumps;
    return locked != null ? [] : steps;
  }

  function applyMove(board, move) {
    const next = board.slice();
    const piece = { player: board[move.from].player, king: board[move.from].king };
    next[move.from] = null;
    if (move.capture != null) next[move.capture] = null;

    let crowned = false;
    if (!piece.king && (move.to >> 3) === CROWN_ROW[piece.player]) {
      piece.king = true;
      crowned = true;
    }
    next[move.to] = piece;
    return { board: next, crowned };
  }

  function build() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < CELLS; i++) {
      const sq = document.createElement('button');
      sq.className = 'sq';
      sq.type = 'button';
      sq.dataset.index = String(i);
      if (isDark(i)) {
        sq.dataset.dark = '';
        sq.addEventListener('click', () => tap(i));
      } else {
        sq.disabled = true;
      }
      squares.push(sq);
      frag.append(sq);
    }
    el.board.append(frag);
  }

  const CROWN = '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M3 18h18l1.4-10-6 4L12 4 7.6 12l-6-4z"/></svg>';

  function render() {
    const moves = state.winner ? [] : legalMoves(state.board, state.turn, state.locked);
    const movable = new Set(moves.map(m => m.from));
    const jumping = moves.length > 0 && moves[0].capture != null;
    const targets = new Map();
    if (selected != null) {
      for (const m of moves) {
        if (m.from === selected) targets.set(m.to, m.capture != null ? 'jump' : 'step');
      }
    }

    for (let i = 0; i < CELLS; i++) {
      const sq = squares[i];
      const piece = state.board[i];

      const wanted = piece ? CROWN_MARKUP(piece) : '';
      if (sq.dataset.markup !== wanted) {
        sq.innerHTML = wanted;
        sq.dataset.markup = wanted;
      }
      if (piece) sq.dataset.p = String(piece.player);
      else delete sq.dataset.p;

      if (selected === i) sq.dataset.sel = '';
      else delete sq.dataset.sel;

      const target = targets.get(i);
      if (target) sq.dataset.to = target;
      else delete sq.dataset.to;

      // Highlight forced jumpers only while nothing is picked up, so the
      // board is not shouting once a choice has been made.
      if (jumping && selected == null && movable.has(i)) sq.dataset.must = '';
      else delete sq.dataset.must;

      const playable = isDark(i) && !state.winner && (movable.has(i) || targets.has(i));
      if (playable) sq.dataset.playable = '';
      else delete sq.dataset.playable;
      sq.disabled = !isDark(i) || !playable;

      sq.setAttribute('aria-label', describe(i, piece, target));
    }

    el.undo.disabled = undoStack.length === 0;
    renderTurn(moves);
  }

  function CROWN_MARKUP(piece) {
    return '<span class="piece">' + (piece.king ? CROWN : '') + '</span>';
  }

  function describe(i, piece, target) {
    const row = 8 - (i >> 3);
    const col = String.fromCharCode(97 + (i & 7));
    const where = col + row;
    if (target) return 'Move to ' + where;
    if (!piece) return where;
    return 'Player ' + piece.player + (piece.king ? ' king' : ' piece') + ' on ' + where;
  }

  function renderTurn(moves) {
    if (state.winner) {
      el.turn.dataset.player = String(state.winner);
      el.turn.dataset.state = 'over';
      el.turnText.textContent = 'Wins!';
      el.turnLabel.textContent = 'Player ' + state.winner + ' wins';
      return;
    }
    el.turn.dataset.player = String(state.turn);
    el.turn.dataset.state = 'playing';
    el.turnText.textContent = 'Next:';
    const forced = moves.length && moves[0].capture != null;
    el.turnLabel.textContent = 'Player ' + state.turn + ' to move'
      + (state.locked != null ? ', continuing a jump' : forced ? ', must jump' : '');
  }

  function tap(i) {
    if (state.winner) return;
    const moves = legalMoves(state.board, state.turn, state.locked);

    if (selected != null) {
      const move = moves.find(m => m.from === selected && m.to === i);
      if (move) return play(move);
    }
    // Mid-chain the piece is not yours to put down.
    if (state.locked != null) return;

    const piece = state.board[i];
    if (piece && piece.player === state.turn && moves.some(m => m.from === i)) {
      selected = selected === i ? null : i;
      render();
    }
  }

  function play(move) {
    undoStack.push({
      board: encode(state.board), turn: state.turn,
      locked: state.locked, winner: state.winner
    });

    const result = applyMove(state.board, move);
    state.board = result.board;

    // A jump that could continue keeps the turn — unless it crowned, which
    // ends the move even with another jump on offer.
    const chains = move.capture != null && !result.crowned
      && movesFrom(state.board, move.to).jumps.length > 0;

    if (chains) {
      state.locked = move.to;
      selected = move.to;
    } else {
      state.locked = null;
      selected = null;
      state.turn = state.turn === 1 ? 2 : 1;
      if (legalMoves(state.board, state.turn, null).length === 0) {
        state.winner = state.turn === 1 ? 2 : 1;
      }
    }
    save();
    render();
  }

  on(el.undo, 'click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    const board = decode(prev.board);
    if (!board) return;
    state = { board, turn: prev.turn, locked: prev.locked, winner: prev.winner };
    selected = null;
    save();
    render();
  });

  on(el.reset, 'click', () => {
    state = fresh();
    selected = null;
    undoStack = [];
    save();
    render();
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  build();
  render();
})();
