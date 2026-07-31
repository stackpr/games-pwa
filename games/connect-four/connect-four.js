// Connect Four: drop a piece by touching a column. See _README.md.
(function () {
  const STORAGE_KEY = 'games.connect-four.v1';
  const COLS = 7;
  const ROWS = 6;
  const RUN = 4;
  // Every direction to scan for a run; the opposites are redundant.
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const el = {
    board: document.getElementById('board'),
    turn: document.getElementById('turn'),
    turnText: document.getElementById('turn-text'),
    turnLabel: document.getElementById('turn-label'),
    undo: document.getElementById('undo'),
    reset: document.getElementById('reset')
  };

  let moves = load();
  let cells = [];   // cells[row][col], row 0 is the top
  let columns = [];
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

  // Keeps the longest run of moves that is actually playable, so a corrupt
  // or hand-edited save degrades to a valid position instead of throwing.
  function legalPrefix(raw) {
    const heights = Array(COLS).fill(0);
    const kept = [];
    for (const move of raw) {
      const col = Number(move);
      if (!Number.isInteger(col) || col < 0 || col >= COLS) break;
      if (heights[col] >= ROWS) break;
      heights[col]++;
      kept.push(col);
      if (derive(kept).winner) break;   // nothing may follow a winning move
    }
    return kept;
  }

  function derive(list) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    const heights = Array(COLS).fill(0);
    const placements = [];

    list.forEach((col, i) => {
      const player = (i % 2) + 1;
      const row = ROWS - 1 - heights[col];
      grid[row][col] = player;
      heights[col]++;
      placements.push({ row, col, player });
    });

    const win = findWin(grid);
    return {
      grid,
      heights,
      placements,
      winner: win ? win.player : 0,
      winCells: win ? win.cells : [],
      full: list.length === ROWS * COLS
    };
  }

  function findWin(grid) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const player = grid[row][col];
        if (!player) continue;
        for (const [dr, dc] of DIRS) {
          const cells = [[row, col]];
          for (let step = 1; step < RUN; step++) {
            const r = row + dr * step;
            const c = col + dc * step;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
            if (grid[r][c] !== player) break;
            cells.push([r, c]);
          }
          if (cells.length === RUN) return { player, cells };
        }
      }
    }
    return null;
  }

  function buildBoard() {
    const frag = document.createDocumentFragment();
    cells = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

    for (let col = 0; col < COLS; col++) {
      const button = document.createElement('button');
      button.className = 'col';
      button.dataset.col = String(col);
      button.addEventListener('click', () => drop(col));

      for (let row = 0; row < ROWS; row++) {
        const cell = document.createElement('span');
        cell.className = 'cell';
        const disc = document.createElement('span');
        disc.className = 'disc';
        cell.append(disc);
        button.append(cell);
        cells[row][col] = cell;
      }

      columns.push(button);
      frag.append(button);
    }
    el.board.append(frag);
  }

  function render(animate) {
    const over = view.winner || view.full;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = cells[row][col];
        const player = view.grid[row][col];
        if (player) cell.dataset.p = String(player);
        else delete cell.dataset.p;
        delete cell.dataset.win;
        if (!animate || animate.row !== row || animate.col !== col) {
          delete cell.dataset.drop;
        }
      }
    }

    for (const [row, col] of view.winCells) cells[row][col].dataset.win = '';

    if (animate) {
      const cell = cells[animate.row][animate.col];
      const fallen = animate.row + 1;
      cell.style.setProperty('--r', String(fallen));
      cell.style.setProperty('--dur', `${200 + fallen * 45}ms`);
      void cell.offsetWidth;          // restart the animation on a re-drop
      cell.dataset.drop = '';
    }

    columns.forEach((button, col) => {
      const full = view.heights[col] >= ROWS;
      button.disabled = Boolean(over) || full;
      button.setAttribute('aria-label', full
        ? `Column ${col + 1} is full`
        : `Drop a piece in column ${col + 1}`);
    });

    el.undo.disabled = moves.length === 0;
    renderTurn();
  }

  // The piece itself says whose turn it is, so the words carry only the
  // state. turnLabel keeps the full sentence for screen readers, which get
  // nothing from the color. See _README.md.
  function renderTurn() {
    if (view.winner) {
      el.turn.dataset.player = String(view.winner);
      el.turn.dataset.state = 'over';
      el.turnText.textContent = 'Wins!';
      el.turnLabel.textContent = `Player ${view.winner} wins`;
    } else if (view.full) {
      el.turn.dataset.player = 'none';
      el.turn.dataset.state = 'over';
      el.turnText.textContent = 'Draw';
      el.turnLabel.textContent = 'Draw — board full';
    } else {
      const player = (moves.length % 2) + 1;
      el.turn.dataset.player = String(player);
      el.turn.dataset.state = 'playing';
      el.turnText.textContent = 'Next:';
      el.turnLabel.textContent = `Player ${player} to move`;
    }
  }

  function drop(col) {
    if (view.winner || view.full) return;
    if (view.heights[col] >= ROWS) return;

    const row = ROWS - 1 - view.heights[col];
    moves.push(col);
    view = derive(moves);
    save();
    render({ row, col });
  }

  el.undo.addEventListener('click', () => {
    if (!moves.length) return;
    moves.pop();
    view = derive(moves);
    save();
    render(null);
  });

  el.reset.addEventListener('click', () => {
    if (!moves.length) return;
    moves = [];
    view = derive(moves);
    save();
    render(null);
  });

  // Number keys drop in a column, so the game is playable from a desktop
  // keyboard as well as by touch.
  document.addEventListener('keydown', event => {
    const col = Number(event.key) - 1;
    if (Number.isInteger(col) && col >= 0 && col < COLS) {
      drop(col);
      event.preventDefault();
    }
  });

  buildBoard();
  render(null);
})();
