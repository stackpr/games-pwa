/*
 * Mines — the board is cut to fit the screen it is on, so it is tall on a
 * phone and wide in landscape. Difficulty sets how big a square is and how
 * thick the mines are; the columns and rows fall out of that. See _README.md.
 */
(function () {
  const KEY = 'games.mines.v1';

  // A board is capped by cell count, not by dimensions: a bigger screen gets
  // bigger squares once the cap is hit, rather than hundreds more of them.
  const MAX_CELLS = 400;
  const MIN_COLS = 5;
  const MIN_ROWS = 5;
  const GAP = 2;
  const PAD = 2;
  const LONG_PRESS = 400;
  const TOP_N = 5;
  const MAX_BOARDS = 12;

  const LEVELS = {
    easy: { name: 'Easy', cell: 48, density: 0.12 },
    medium: { name: 'Medium', cell: 40, density: 0.16 },
    hard: { name: 'Hard', cell: 34, density: 0.21 }
  };
  const ORDER = ['easy', 'medium', 'hard'];

  const $ = id => document.getElementById(id);
  // A worker can serve this script with the previous release's HTML, so every
  // binding tolerates a missing node rather than taking the page down.
  function on(node, type, fn, opts) {
    if (node) node.addEventListener(type, fn, opts);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  /* ---- fitting the board to the screen ---------------------------------- */

  function fit(width, height, level) {
    const pref = LEVELS[level] || LEVELS.medium;
    let cell = pref.cell;
    let cols = MIN_COLS;
    let rows = MIN_ROWS;
    // Squares grow until the board is under the cap, so the cap never costs
    // you a clickable target.
    for (let guard = 0; guard < 80; guard++) {
      cols = Math.max(MIN_COLS, Math.floor((width - PAD * 2 + GAP) / (cell + GAP)));
      rows = Math.max(MIN_ROWS, Math.floor((height - PAD * 2 + GAP) / (cell + GAP)));
      if (cols * rows <= MAX_CELLS) break;
      cell += 2;
    }
    const total = cols * rows;
    // Leave room for the opening click's safe patch, whatever the density.
    const mines = Math.max(1, Math.min(total - 10, Math.round(total * pref.density)));
    return { cols: cols, rows: rows, mines: mines };
  }

  // The size a square is actually drawn at. Once the columns and rows are
  // fixed, the squares take whatever room is left — which is what makes the
  // board fill the screen rather than sit in the middle of it, and what pays
  // out the cell cap as bigger squares on a big display.
  function cellPx(width, height, cols, rows) {
    const wide = Math.floor((width - PAD * 2 + GAP) / cols) - GAP;
    const tall = Math.floor((height - PAD * 2 + GAP) / rows) - GAP;
    return Math.max(12, Math.min(wide, tall));
  }

  /* ---- state ------------------------------------------------------------ */

  const HIDDEN = 0;
  const OPEN = 1;
  const FLAG = 2;

  let state = null;
  let scores = {};
  let cells = [];
  let ticker = null;
  let lastTick = 0;
  let freshScore = null;

  function blank(level, cols, rows, mines) {
    return {
      level: level,
      cols: cols,
      rows: rows,
      mineCount: mines,
      mines: null,
      mask: new Uint8Array(cols * rows),
      status: 'ready',
      elapsed: 0,
      boom: -1
    };
  }

  function neighbours(i) {
    const out = [];
    const x = i % state.cols;
    const y = (i / state.cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) continue;
        out.push(ny * state.cols + nx);
      }
    }
    return out;
  }

  function around(i) {
    if (!state.mines) return 0;
    let n = 0;
    for (const j of neighbours(i)) if (state.mines[j]) n++;
    return n;
  }

  function flagsUsed() {
    let n = 0;
    for (let i = 0; i < state.mask.length; i++) if (state.mask[i] === FLAG) n++;
    return n;
  }

  function openCount() {
    let n = 0;
    for (let i = 0; i < state.mask.length; i++) if (state.mask[i] === OPEN) n++;
    return n;
  }

  // Mines are laid after the first click, never before, so the opening tap
  // cannot lose and always opens a patch. See _README.md.
  function layMines(safe) {
    const total = state.cols * state.rows;
    const mines = new Uint8Array(total);
    const forbidden = new Set([safe]);
    state.mines = mines;
    if (total - 9 >= state.mineCount) for (const j of neighbours(safe)) forbidden.add(j);

    const pool = [];
    for (let i = 0; i < total; i++) if (!forbidden.has(i)) pool.push(i);
    for (let k = 0; k < state.mineCount && pool.length; k++) {
      const pick = Math.floor(Math.random() * pool.length);
      mines[pool[pick]] = 1;
      pool.splice(pick, 1);
    }
  }

  /* ---- persistence ------------------------------------------------------ */

  function packed(arr) {
    let out = '';
    for (let i = 0; i < arr.length; i++) out += arr[i];
    return out;
  }

  function unpacked(str, length, max) {
    if (typeof str !== 'string' || str.length !== length) return null;
    const arr = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      const v = str.charCodeAt(i) - 48;
      if (!(v >= 0 && v <= max)) return null;
      arr[i] = v;
    }
    return arr;
  }

  function save() {
    Store.save(KEY, {
      level: state.level,
      cols: state.cols,
      rows: state.rows,
      mineCount: state.mineCount,
      mines: state.mines ? packed(state.mines) : null,
      mask: packed(state.mask),
      status: state.status,
      elapsed: Math.round(state.elapsed),
      boom: state.boom,
      flagMode: flagMode,
      scores: scores
    });
  }

  function loadScores(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const key in raw) {
      const entry = raw[key];
      if (!entry || !Array.isArray(entry.times)) continue;
      const times = entry.times.filter(t => Number.isFinite(t) && t >= 0).slice(0, TOP_N);
      if (!times.length) continue;
      out[key] = {
        level: LEVELS[entry.level] ? entry.level : 'medium',
        cols: Number.isInteger(entry.cols) ? entry.cols : 0,
        rows: Number.isInteger(entry.rows) ? entry.rows : 0,
        mines: Number.isInteger(entry.mines) ? entry.mines : 0,
        at: Number.isFinite(entry.at) ? entry.at : 0,
        times: times
      };
    }
    return out;
  }

  function load() {
    const saved = Store.load(KEY);
    if (!saved || typeof saved !== 'object') return null;
    scores = loadScores(saved.scores);
    flagMode = saved.flagMode === true;

    const level = LEVELS[saved.level] ? saved.level : 'medium';
    if (!Number.isInteger(saved.cols) || !Number.isInteger(saved.rows)) return null;
    if (saved.cols < MIN_COLS || saved.rows < MIN_ROWS) return null;
    if (saved.cols * saved.rows > MAX_CELLS) return null;

    const total = saved.cols * saved.rows;
    const mask = unpacked(saved.mask, total, 2);
    if (!mask) return null;

    const s = blank(level, saved.cols, saved.rows,
      Number.isInteger(saved.mineCount) ? saved.mineCount : 1);
    s.mask = mask;
    if (typeof saved.mines === 'string') {
      const mines = unpacked(saved.mines, total, 1);
      if (!mines) return null;
      s.mines = mines;
    }
    if (['ready', 'playing', 'won', 'lost'].indexOf(saved.status) >= 0) s.status = saved.status;
    if (Number.isFinite(saved.elapsed) && saved.elapsed >= 0) s.elapsed = saved.elapsed;
    if (Number.isInteger(saved.boom)) s.boom = saved.boom;
    // A board that claims to be under way with no mines laid never was.
    if (!s.mines && s.status !== 'ready') return null;
    return s;
  }

  /* ---- scores ----------------------------------------------------------- */

  function boardKey() {
    return state.level + ':' + state.cols + 'x' + state.rows + 'x' + state.mineCount;
  }

  function recordWin(ms) {
    const key = boardKey();
    const entry = scores[key] || {
      level: state.level, cols: state.cols, rows: state.rows,
      mines: state.mineCount, times: []
    };
    entry.times = entry.times.concat([Math.round(ms)]).sort((a, b) => a - b).slice(0, TOP_N);
    entry.at = Date.now();
    scores[key] = entry;

    // Keep the list to a handful of boards, oldest-used first out, so a phone
    // that has seen many window sizes does not accumulate them forever.
    const keys = Object.keys(scores);
    if (keys.length > MAX_BOARDS) {
      keys.sort((a, b) => (scores[a].at || 0) - (scores[b].at || 0));
      for (const dead of keys.slice(0, keys.length - MAX_BOARDS)) delete scores[dead];
    }
    freshScore = { key: key, ms: Math.round(ms) };
    return entry.times.indexOf(Math.round(ms));
  }

  function asTime(ms) {
    const total = Math.floor(ms / 1000);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function renderScores() {
    const body = $('score-body');
    if (!body) return;
    body.textContent = '';

    const keys = Object.keys(scores).sort((a, b) => {
      const byLevel = ORDER.indexOf(scores[a].level) - ORDER.indexOf(scores[b].level);
      return byLevel || (scores[b].at || 0) - (scores[a].at || 0);
    });
    if (!keys.length) {
      const p = document.createElement('p');
      p.className = 'score-empty';
      p.textContent = 'No wins yet. Times are kept per board size, so each ' +
        'difficulty and screen keeps its own list.';
      body.append(p);
      return;
    }

    for (const key of keys) {
      const entry = scores[key];
      const head = document.createElement('h3');
      head.className = 'score-size';
      head.textContent = LEVELS[entry.level].name + ' · ' + entry.cols + ' × ' +
        entry.rows + ' · ' + entry.mines + ' mines';
      const list = document.createElement('ol');
      list.className = 'score-list';
      entry.times.forEach((ms, i) => {
        const li = document.createElement('li');
        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = String(i + 1);
        const time = document.createElement('span');
        time.textContent = asTime(ms);
        li.append(rank, time);
        if (freshScore && freshScore.key === key && freshScore.ms === ms) {
          li.dataset.fresh = '';
        }
        list.append(li);
      });
      body.append(head, list);
    }
  }

  /* ---- rendering -------------------------------------------------------- */

  function buildBoard() {
    const board = $('board');
    if (!board) return;
    board.style.gridTemplateColumns = 'repeat(' + state.cols + ', var(--cell))';
    board.textContent = '';
    cells = [];
    for (let i = 0; i < state.cols * state.rows; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.i = String(i);
      board.append(cell);
      cells.push(cell);
    }
    paintAll();
  }

  function paint(i) {
    const cell = cells[i];
    if (!cell) return;
    const over = state.status === 'lost' || state.status === 'won';
    const mine = state.mines && state.mines[i];
    const mask = state.mask[i];

    delete cell.dataset.n;
    delete cell.dataset.mine;
    delete cell.dataset.wrong;
    delete cell.dataset.boom;
    cell.textContent = '';

    let label;
    if (mask === OPEN) {
      cell.dataset.state = 'open';
      if (mine) {
        cell.innerHTML = '<svg aria-hidden="true"><use href="#glyph-mine"></use></svg>';
        cell.dataset.mine = '';
        if (i === state.boom) cell.dataset.boom = '';
        label = 'mine';
      } else {
        const n = around(i);
        if (n) {
          cell.textContent = String(n);
          cell.dataset.n = String(n);
        }
        label = n ? n + ' near' : 'clear';
      }
    } else if (mask === FLAG) {
      cell.dataset.state = 'flag';
      cell.innerHTML = '<svg aria-hidden="true"><use href="#glyph-flag"></use></svg>';
      if (over && !mine) cell.dataset.wrong = '';
      label = 'flagged';
    } else {
      cell.dataset.state = 'hidden';
      // Losing shows the mines you had not found; winning does not need to.
      if (over && mine && state.status === 'lost') {
        cell.innerHTML = '<svg aria-hidden="true"><use href="#glyph-mine"></use></svg>';
        cell.dataset.mine = '';
        label = 'mine';
      } else {
        label = 'hidden';
      }
    }

    const x = (i % state.cols) + 1;
    const y = ((i / state.cols) | 0) + 1;
    cell.setAttribute('aria-label', 'Column ' + x + ' row ' + y + ', ' + label);
  }

  function paintAll() {
    for (let i = 0; i < cells.length; i++) paint(i);
  }

  const FACES = { ready: '\u{1F642}', playing: '\u{1F642}', won: '\u{1F60E}', lost: '\u{1F635}' };

  function renderHud() {
    document.body.dataset.status = state.status;

    const left = $('mines-left');
    if (left) left.textContent = String(state.mineCount - flagsUsed());

    const timer = $('timer');
    if (timer) timer.textContent = asTime(state.elapsed);

    const face = $('face');
    if (face) face.textContent = FACES[state.status] || FACES.ready;

    const size = $('board-size');
    if (size) {
      size.textContent = state.cols + ' × ' + state.rows + ' · ' +
        state.mineCount + ' mines';
    }

    const flag = $('flag-btn');
    if (flag) flag.setAttribute('aria-pressed', flagMode ? 'true' : 'false');
    const flagLabel = $('flag-label');
    if (flagLabel) flagLabel.textContent = flagMode ? 'Flagging' : 'Flag mode';
  }

  function say(text) {
    const el = $('say');
    if (el) el.textContent = text;
  }

  /* ---- playing ---------------------------------------------------------- */

  function tick() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (state.status !== 'playing') return;
    lastTick = Date.now();
    ticker = setInterval(() => {
      const now = Date.now();
      state.elapsed += now - lastTick;
      lastTick = now;
      const timer = $('timer');
      if (timer) timer.textContent = asTime(state.elapsed);
    }, 250);
  }

  function finish(status) {
    state.status = status;
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (status === 'won') {
      // Clearing the last safe square finds the mines by elimination, so the
      // board flags them for you and the counter lands on zero.
      for (let i = 0; i < state.mask.length; i++) {
        if (state.mines[i] && state.mask[i] !== OPEN) state.mask[i] = FLAG;
      }
      const rank = recordWin(state.elapsed);
      say('Cleared in ' + asTime(state.elapsed) +
        (rank === 0 ? '. A new best for this board.' : '.'));
      renderScores();
    } else {
      say('Mine. Game over.');
    }
  }

  function revealFrom(start) {
    const stack = [start];
    const changed = [];
    while (stack.length) {
      const i = stack.pop();
      if (state.mask[i] !== HIDDEN) continue;
      state.mask[i] = OPEN;
      changed.push(i);
      if (state.mines[i]) continue;
      if (around(i) === 0) {
        for (const j of neighbours(i)) if (state.mask[j] === HIDDEN) stack.push(j);
      }
    }
    return changed;
  }

  function reveal(i) {
    if (state.mask[i] !== HIDDEN) return;
    if (!state.mines) {
      layMines(i);
      state.status = 'playing';
      tick();
    }
    if (state.mines[i]) {
      state.mask[i] = OPEN;
      state.boom = i;
      finish('lost');
      paintAll();
      return;
    }
    for (const j of revealFrom(i)) paint(j);
    if (openCount() === state.cols * state.rows - state.mineCount) {
      finish('won');
      paintAll();
    }
  }

  function flag(i) {
    if (state.mask[i] === OPEN) return;
    state.mask[i] = state.mask[i] === FLAG ? HIDDEN : FLAG;
    paint(i);
  }

  // Tapping a number with that many flags around it opens the rest — the
  // standard shortcut, and the only way a big board is playable by thumb.
  function chord(i) {
    const n = around(i);
    if (!n) return;
    const near = neighbours(i);
    let flags = 0;
    for (const j of near) if (state.mask[j] === FLAG) flags++;
    if (flags !== n) return;
    for (const j of near) if (state.mask[j] === HIDDEN) reveal(j);
  }

  function act(i, wantFlag) {
    if (state.status === 'won' || state.status === 'lost') return;
    if (state.mask[i] === OPEN) chord(i);
    else if (wantFlag) flag(i);
    else if (state.mask[i] !== FLAG) reveal(i);
    renderHud();
    save();
  }

  /* ---- new games and fitting -------------------------------------------- */

  let flagMode = false;

  function stageBox() {
    const stage = document.querySelector('.stage');
    if (!stage) return { width: 320, height: 320 };
    const box = stage.getBoundingClientRect();
    return { width: Math.max(80, box.width), height: Math.max(80, box.height) };
  }

  function applyCellSize() {
    const box = stageBox();
    const px = cellPx(box.width, box.height, state.cols, state.rows);
    document.documentElement.style.setProperty('--cell', px + 'px');
  }

  function newGame(level) {
    const box = stageBox();
    const pick = LEVELS[level] ? level : state.level;
    const shape = fit(box.width, box.height, pick);
    state = blank(pick, shape.cols, shape.rows, shape.mines);
    freshScore = null;
    if (ticker) { clearInterval(ticker); ticker = null; }
    applyCellSize();
    buildBoard();
    renderHud();
    renderLevels();
    save();
  }

  // A resize before the first click re-cuts the board; after it, the board is
  // only rescaled, because re-cutting it would throw the game away.
  function onResize() {
    if (!state) return;
    if (state.status === 'ready') {
      const box = stageBox();
      const shape = fit(box.width, box.height, state.level);
      if (shape.cols !== state.cols || shape.rows !== state.rows) {
        state = blank(state.level, shape.cols, shape.rows, shape.mines);
        applyCellSize();
        buildBoard();
        renderHud();
        renderLevels();
        save();
        return;
      }
    }
    applyCellSize();
  }

  function renderLevels() {
    const el = $('opt-level');
    if (el) {
      el.textContent = '';
      for (const key of ORDER) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = LEVELS[key].name;
        btn.dataset.level = key;
        btn.setAttribute('aria-pressed', key === state.level ? 'true' : 'false');
        btn.addEventListener('click', () => {
          newGame(key);
          say(LEVELS[key].name + ' board, ' + state.cols + ' by ' + state.rows +
            ', ' + state.mineCount + ' mines.');
        });
        el.append(btn);
      }
    }
    const note = $('level-note');
    if (note) {
      note.textContent = 'Now: ' + state.cols + ' × ' + state.rows + ', ' +
        state.mineCount + ' mines. Changing this starts a new board.';
    }
  }

  /* ---- wiring ----------------------------------------------------------- */

  state = load();
  const restored = Boolean(state);
  if (!state) {
    const box = stageBox();
    const shape = fit(box.width, box.height, 'medium');
    state = blank('medium', shape.cols, shape.rows, shape.mines);
  }

  Modal.create($('settings'), { trigger: $('settings-btn'), onOpen: renderLevels });
  Modal.create($('scores'), { trigger: $('scores-btn'), onOpen: renderScores });

  on($('face'), 'click', () => newGame(state.level));
  on($('flag-btn'), 'click', () => {
    flagMode = !flagMode;
    renderHud();
    save();
  });

  const board = $('board');
  if (board) {
    let held = null;
    let swallow = false;
    let from = null;

    board.addEventListener('click', event => {
      const cell = event.target.closest('.cell');
      if (!cell) return;
      if (swallow) { swallow = false; return; }
      act(Number(cell.dataset.i), flagMode);
    });

    board.addEventListener('contextmenu', event => {
      const cell = event.target.closest('.cell');
      event.preventDefault();
      if (!cell || state.status === 'won' || state.status === 'lost') return;
      flag(Number(cell.dataset.i));
      renderHud();
      save();
    });

    // Press and hold flags, so flag mode is a convenience rather than the
    // only way to mark a square.
    board.addEventListener('pointerdown', event => {
      const cell = event.target.closest('.cell');
      // A long press on touch does not always produce a click afterwards, so
      // the suppression is cleared here rather than trusted to be consumed.
      swallow = false;
      if (!cell || event.button === 2) return;
      const i = Number(cell.dataset.i);
      from = { x: event.clientX, y: event.clientY };
      held = setTimeout(() => {
        held = null;
        swallow = true;
        if (state.status === 'won' || state.status === 'lost') return;
        if (state.mask[i] === OPEN) return;
        flag(i);
        renderHud();
        save();
      }, LONG_PRESS);
    });
    const drop = () => {
      if (held) { clearTimeout(held); held = null; }
      from = null;
    };
    board.addEventListener('pointerup', drop);
    board.addEventListener('pointercancel', drop);
    board.addEventListener('pointerleave', drop);
    board.addEventListener('pointermove', event => {
      if (!held || !from) return;
      if (Math.abs(event.clientX - from.x) > 8 || Math.abs(event.clientY - from.y) > 8) drop();
    });
  }

  applyCellSize();
  buildBoard();
  renderHud();
  renderLevels();
  renderScores();
  if (restored && state.status === 'playing') tick();

  if (typeof ResizeObserver === 'function') {
    const stage = document.querySelector('.stage');
    let first = true;
    if (stage) {
      new ResizeObserver(() => {
        // The observer fires once on observe, before anything has moved.
        if (first) { first = false; applyCellSize(); return; }
        onResize();
      }).observe(stage);
    }
  } else {
    window.addEventListener('resize', onResize);
  }
})();
