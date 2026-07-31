// Tic-Tac-Toe: player 1 is X, player 2 is O. See _README.md.
(function () {
  const STORAGE_KEY = 'games.tic-tac-toe.v1';
  const SIZE = 9;
  const MARKS = { 1: 'X', 2: 'O' };
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // columns
    [0, 4, 8], [2, 4, 6]               // diagonals
  ];

  const el = {
    board: document.getElementById('board'),
    turn: document.getElementById('turn'),
    turnText: document.getElementById('turn-text'),
    undo: document.getElementById('undo'),
    reset: document.getElementById('reset')
  };

  let moves = load();
  let cells = [];
  let view = derive(moves);

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.moves)) return legalPrefix(parsed.moves);
      }
    } catch (err) {
      console.warn('Could not load saved game:', err);
    }
    return [];
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ moves }));
    } catch (err) {
      console.warn('Could not save game:', err);
    }
  }

  // Same contract as connect-four: keep the longest playable run so a
  // corrupt save degrades to a valid position rather than throwing.
  function legalPrefix(raw) {
    const seen = new Set();
    const kept = [];
    for (const move of raw) {
      const index = Number(move);
      if (!Number.isInteger(index) || index < 0 || index >= SIZE) break;
      if (seen.has(index)) break;
      seen.add(index);
      kept.push(index);
      if (derive(kept).winner) break;   // nothing may follow a winning move
    }
    return kept;
  }

  function derive(list) {
    const grid = Array(SIZE).fill(0);
    list.forEach((index, i) => { grid[index] = (i % 2) + 1; });

    let winner = 0;
    let winCells = [];
    for (const line of LINES) {
      const [a, b, c] = line;
      if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) {
        winner = grid[a];
        winCells = line;
        break;
      }
    }
    return { grid, winner, winCells, full: list.length === SIZE };
  }

  function markSvg(player) {
    if (player === 1) {
      return '<svg class="mark mark-x" viewBox="0 0 100 100" aria-hidden="true">' +
        '<line x1="24" y1="24" x2="76" y2="76"/>' +
        '<line x1="76" y1="24" x2="24" y2="76"/></svg>';
    }
    return '<svg class="mark mark-o" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="29"/></svg>';
  }

  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < SIZE; i++) {
      const button = document.createElement('button');
      button.className = 'cell';
      button.dataset.index = String(i);
      button.addEventListener('click', () => play(i));
      cells.push(button);
      frag.append(button);
    }
    el.board.append(frag);
  }

  function render(animateIndex) {
    const over = view.winner || view.full;

    cells.forEach((cell, i) => {
      const player = view.grid[i];
      const wanted = player ? markSvg(player) : '';
      if (cell.innerHTML !== wanted) cell.innerHTML = wanted;

      if (player) cell.dataset.p = String(player);
      else delete cell.dataset.p;

      delete cell.dataset.win;
      if (i === animateIndex) cell.dataset.new = '';
      else delete cell.dataset.new;

      cell.disabled = Boolean(over) || Boolean(player);
      const row = Math.floor(i / 3) + 1;
      const col = (i % 3) + 1;
      cell.setAttribute('aria-label', player
        ? `Row ${row}, column ${col}: ${MARKS[player]}`
        : `Play row ${row}, column ${col}`);
    });

    for (const i of view.winCells) cells[i].dataset.win = '';

    el.undo.disabled = moves.length === 0;
    renderTurn();
  }

  function renderTurn() {
    if (view.winner) {
      el.turn.dataset.player = String(view.winner);
      el.turn.dataset.state = 'over';
      el.turnText.textContent = `Player ${view.winner} (${MARKS[view.winner]}) wins`;
    } else if (view.full) {
      el.turn.dataset.player = 'none';
      el.turn.dataset.state = 'over';
      el.turnText.textContent = 'Draw — nobody wins';
    } else {
      const player = (moves.length % 2) + 1;
      el.turn.dataset.player = String(player);
      el.turn.dataset.state = 'playing';
      el.turnText.textContent = `Player ${player} (${MARKS[player]}) to move`;
    }
  }

  function play(index) {
    if (view.winner || view.full) return;
    if (view.grid[index]) return;

    moves.push(index);
    view = derive(moves);
    save();
    render(index);
  }

  el.undo.addEventListener('click', () => {
    if (!moves.length) return;
    moves.pop();
    view = derive(moves);
    save();
    render(-1);
  });

  el.reset.addEventListener('click', () => {
    if (!moves.length) return;
    moves = [];
    view = derive(moves);
    save();
    render(-1);
  });

  buildBoard();
  render(-1);
})();
