/*
 * Maze — everyone types the same code and runs the same maze.
 *
 * The code is the seed: five letters in, one maze out, identically on every
 * phone. Its last letter also carries the maze size, which is why any five
 * letters someone invents is a playable code. See _README.md.
 */
(function () {
  const KEY = 'games.maze.v1';

  // Squares, not tiles: with walls on the edges every square is somewhere you
  // can stand, so a 25 here is four times the maze a 25 used to be.
  const MAZE_SIZES = [11, 15, 21, 25];
  const DEFAULT_SIZE = 25;
  const VIEWS = [3, 5, 7, 9];
  const TRAILS = [0, 5, 10, 20];
  const WALL_PX = { 3: 4, 5: 3, 7: 3, 9: 2 };
  const PATH_CAP = 32;

  const VOWELS = 'AEIOU';
  const CONSONANTS = 'BCDFGHJKLMNPRSTVWXYZ';
  const DIRS = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]
  };

  const $ = id => document.getElementById(id);
  // A worker can serve this script with the previous release's HTML, so every
  // binding tolerates a missing node rather than taking the page down.
  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  /* ---- the code, and the maze it names ---------------------------------- */

  function letterIndex(ch) { return ch.charCodeAt(0) - 65; }

  function validCode(code) {
    return typeof code === 'string' && /^[A-Z]{5}$/.test(code);
  }

  function sizeFor(code) {
    return MAZE_SIZES[letterIndex(code.charAt(4)) % MAZE_SIZES.length];
  }

  // Consonant–vowel–consonant–vowel–consonant, so a code can be read across a
  // room. The final consonant is chosen from those that select the size.
  function makeCode(size) {
    const want = Math.max(0, MAZE_SIZES.indexOf(size));
    const enders = CONSONANTS.split('')
      .filter(ch => letterIndex(ch) % MAZE_SIZES.length === want);
    const pick = list => list[Math.floor(Math.random() * list.length)];
    return pick(CONSONANTS.split('')) + pick(VOWELS.split('')) +
           pick(CONSONANTS.split('')) + pick(VOWELS.split('')) + pick(enders);
  }

  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /*
   * Walls live on the edges between squares, not in squares of their own, so
   * every square of the grid is somewhere you can stand and every one of them
   * is a decision. Two planes hold them: a square owns its north and west
   * wall, and the grid carries the extra south and east edge. See _README.md.
   *
   * The carve is a recursive backtracker over the squares. Every square joins
   * one spanning tree, so there is exactly one route between any two of them
   * — which is what guarantees the exit is reachable, without a check.
   */
  function buildMaze(code) {
    const n = sizeFor(code);
    const rand = mulberry32(hash(code));
    const vert = new Uint8Array((n + 1) * n).fill(1);
    const horiz = new Uint8Array(n * (n + 1)).fill(1);
    const vi = (x, y) => y * (n + 1) + x;
    const hi = (x, y) => y * n + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;

    // The whole wall model, for any square in or out of the grid: the wall
    // above it and the wall to its left. Everything else is these two read
    // from a neighbour.
    function edge(x, y, side) {
      if (side === 'up') {
        if (x < 0 || x >= n || y < 0 || y > n) return 0;
        return horiz[hi(x, y)];
      }
      if (y < 0 || y >= n || x < 0 || x > n) return 0;
      return vert[vi(x, y)];
    }

    function wall(x, y, dir) {
      if (dir === 'up') return edge(x, y, 'up');
      if (dir === 'down') return edge(x, y + 1, 'up');
      if (dir === 'left') return edge(x, y, 'left');
      return edge(x + 1, y, 'left');
    }

    function knock(x, y, dir) {
      if (dir === 'up') horiz[hi(x, y)] = 0;
      else if (dir === 'down') horiz[hi(x, y + 1)] = 0;
      else if (dir === 'left') vert[vi(x, y)] = 0;
      else vert[vi(x + 1, y)] = 0;
    }

    const start = { x: n >> 1, y: n >> 1 };
    const seen = new Uint8Array(n * n);
    seen[hi(start.x, start.y)] = 1;
    const stack = [[start.x, start.y]];
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const options = [];
      for (const key in DIRS) {
        const nx = x + DIRS[key][0];
        const ny = y + DIRS[key][1];
        if (inside(nx, ny) && !seen[hi(nx, ny)]) options.push([key, nx, ny]);
      }
      if (!options.length) { stack.pop(); continue; }
      const [dir, nx, ny] = options[Math.floor(rand() * options.length)];
      knock(x, y, dir);
      seen[hi(nx, ny)] = 1;
      stack.push([nx, ny]);
    }

    // Distances from the start, so the exit can be the furthest way out
    // rather than one that happens to sit next door.
    const dist = new Int32Array(n * n).fill(-1);
    dist[hi(start.x, start.y)] = 0;
    let queue = [[start.x, start.y]];
    while (queue.length) {
      const next = [];
      for (const [x, y] of queue) {
        for (const key in DIRS) {
          const nx = x + DIRS[key][0];
          const ny = y + DIRS[key][1];
          if (!inside(nx, ny) || wall(x, y, key) || dist[hi(nx, ny)] >= 0) continue;
          dist[hi(nx, ny)] = dist[hi(x, y)] + 1;
          next.push([nx, ny]);
        }
      }
      queue = next;
    }

    // Every square on the outer ring could be the way out; the furthest one
    // wins, with rand() breaking ties so two mazes of a shape still differ.
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      for (const c of [[i, 0, 'up'], [i, n - 1, 'down'], [0, i, 'left'], [n - 1, i, 'right']]) {
        const score = dist[hi(c[0], c[1])] * 4 + rand();
        if (score > bestScore) { bestScore = score; best = c; }
      }
    }
    knock(best[0], best[1], best[2]);
    const exit = { x: best[0], y: best[1], dir: best[2] };
    const step = DIRS[exit.dir];

    return {
      n: n,
      code: code,
      start: start,
      exit: exit,
      // The square just outside the opening: stepping onto it is the win.
      exitTile: { x: exit.x + step[0], y: exit.y + step[1] },
      inside: inside,
      edge: edge,
      wall: wall,
      canMove: function (x, y, dir) {
        return inside(x, y) && !wall(x, y, dir);
      }
    };
  }

  // The generator is pure, and "there is always a way out" is a claim about
  // every code rather than about the one on screen. The spec samples it at
  // each size instead of walking a maze through the D-pad. See _README.md.
  window.MazeSeed = { build: buildMaze, sizeFor: sizeFor, makeCode: makeCode };

  /* ---- state ------------------------------------------------------------ */

  let maze = null;
  let state = null;
  let cells = [];
  let cellView = 0;
  let ticker = null;

  function fresh(code, view, trail) {
    const m = buildMaze(code);
    return {
      code: code,
      view: view,
      trail: trail,
      x: m.start.x,
      y: m.start.y,
      path: [],
      steps: 0,
      startedAt: null,
      finishedAt: null,
      pending: true
    };
  }

  function oneOf(list, value, fallback) {
    return list.indexOf(value) >= 0 ? value : fallback;
  }

  function load() {
    const saved = Store.load(KEY);
    if (!saved || typeof saved !== 'object' || !validCode(saved.code)) return null;

    const s = fresh(saved.code, oneOf(VIEWS, saved.view, 5), oneOf(TRAILS, saved.trail, 10));
    const m = buildMaze(s.code);
    s.pending = saved.pending !== false;
    const onExit = saved.x === m.exitTile.x && saved.y === m.exitTile.y;
    // A position off the grid makes the steps and the trail meaningless too,
    // so the whole run goes rather than half of it. The square outside the
    // exit is the one exception: that is a finished run.
    if (!Number.isInteger(saved.x) || !Number.isInteger(saved.y) ||
        (!m.inside(saved.x, saved.y) && !onExit)) {
      return s;
    }
    s.x = saved.x;
    s.y = saved.y;
    if (Array.isArray(saved.path)) {
      s.path = saved.path
        .filter(p => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]))
        .slice(-PATH_CAP)
        .map(p => [p[0], p[1]]);
    }
    if (Number.isInteger(saved.steps) && saved.steps >= 0) s.steps = saved.steps;
    if (Number.isFinite(saved.startedAt)) s.startedAt = saved.startedAt;
    if (Number.isFinite(saved.finishedAt)) s.finishedAt = saved.finishedAt;
    // A saved position out of the exit is a finished run, however it was saved.
    if (onExit && !s.finishedAt) s.finishedAt = Date.now();
    return s;
  }

  function save() {
    Store.save(KEY, state);
  }

  function won() {
    return Boolean(state && state.finishedAt);
  }

  /* ---- rendering -------------------------------------------------------- */

  function buildGrid() {
    const board = $('board');
    if (!board) return;
    board.style.gridTemplateColumns = 'repeat(' + state.view + ', 1fr)';
    // Thinner walls when there are more of them on screen.
    board.style.setProperty('--wall-w', (WALL_PX[state.view] || 3) + 'px');
    board.textContent = '';
    cells = [];
    for (let i = 0; i < state.view * state.view; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      board.append(cell);
      cells.push(cell);
    }
    cellView = state.view;
  }

  function fades() {
    const map = new Map();
    const count = Math.min(state.trail, state.path.length);
    for (let k = 0; k < count; k++) {
      const p = state.path[state.path.length - 1 - k];
      const value = count === 1 ? 0.5 : 0.5 - (0.44 * k) / (count - 1);
      const key = p[0] + ',' + p[1];
      // A square walked twice shows its most recent visit, not its oldest.
      if (!map.has(key)) map.set(key, value);
    }
    return map;
  }

  function clock() {
    if (!state.startedAt) return 0;
    return Math.max(0, (state.finishedAt || Date.now()) - state.startedAt);
  }

  function asTime(ms) {
    const total = Math.floor(ms / 1000);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return mins + ':' + String(secs).padStart(2, '0');
  }

  function render() {
    if (cellView !== state.view || !cells.length) buildGrid();

    const half = (state.view - 1) / 2;
    const fade = fades();
    const last = state.view - 1;
    for (let j = 0; j < state.view; j++) {
      for (let i = 0; i < state.view; i++) {
        const cell = cells[j * state.view + i];
        if (!cell) continue;
        const mx = state.x + i - half;
        const my = state.y + j - half;
        const isExit = mx === maze.exitTile.x && my === maze.exitTile.y;
        const kind = isExit ? 'exit' : (maze.inside(mx, my) ? 'floor' : 'outside');
        cell.dataset.t = kind;

        // Each square draws the wall above it and the wall to its left, and
        // the far row and column of the view close it off. Drawn once each,
        // so every wall in the view is the same weight.
        const walls = [];
        if (maze.edge(mx, my, 'up')) walls.push('n');
        if (maze.edge(mx, my, 'left')) walls.push('w');
        if (j === last && maze.edge(mx, my + 1, 'up')) walls.push('s');
        if (i === last && maze.edge(mx + 1, my, 'left')) walls.push('e');
        cell.dataset.walls = walls.join(' ');

        const key = fade.get(mx + ',' + my);
        if (key !== undefined && kind === 'floor') {
          cell.dataset.trail = '';
          cell.style.setProperty('--fade', key.toFixed(3));
        } else {
          delete cell.dataset.trail;
          cell.style.removeProperty('--fade');
        }

        if (i === half && j === half) cell.dataset.you = '';
        else delete cell.dataset.you;
      }
    }

    const openDirs = [];
    for (const key in DIRS) {
      const btn = document.querySelector('.dir[data-dir="' + key + '"]');
      const ok = maze.canMove(state.x, state.y, key);
      if (ok) openDirs.push(key);
      if (btn) {
        if (ok && !won()) delete btn.dataset.blocked;
        else btn.dataset.blocked = '';
      }
    }

    document.body.dataset.state = won() ? 'won' : 'playing';

    const steps = $('steps');
    if (steps) steps.textContent = String(state.steps);

    const status = $('status');
    if (status) {
      status.textContent = state.code + ' · ' + maze.n + '×' + maze.n +
        ' · ' + asTime(clock());
    }

    const codeBtn = $('code-btn');
    if (codeBtn) {
      codeBtn.textContent = state.code;
      codeBtn.setAttribute('aria-label', 'Game code ' + state.code.split('').join(' ') +
        ', tap to change');
    }

    const winLine = $('win-line');
    if (winLine) {
      winLine.textContent = asTime(clock()) + ' · ' + state.steps + ' steps';
    }

    return openDirs;
  }

  function announce(openDirs) {
    const label = $('move-label');
    if (!label) return;
    label.textContent = won()
      ? 'Out of the maze in ' + state.steps + ' steps, ' + asTime(clock()) + '.'
      : 'Open: ' + (openDirs.length ? openDirs.join(', ') : 'nothing') + '.';
  }

  /* ---- playing ---------------------------------------------------------- */

  function move(dir) {
    if (!DIRS[dir] || won() || sheetOpen()) return;
    if (!maze.canMove(state.x, state.y, dir)) return;
    const nx = state.x + DIRS[dir][0];
    const ny = state.y + DIRS[dir][1];

    if (!state.startedAt) state.startedAt = Date.now();
    state.path.push([state.x, state.y]);
    if (state.path.length > PATH_CAP) state.path = state.path.slice(-PATH_CAP);
    state.x = nx;
    state.y = ny;
    state.steps++;
    if (nx === maze.exitTile.x && ny === maze.exitTile.y) state.finishedAt = Date.now();

    save();
    announce(render());
    tick();
  }

  function tick() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (!state.startedAt || won()) return;
    ticker = setInterval(() => {
      const status = $('status');
      if (status) {
        status.textContent = state.code + ' · ' + maze.n + '×' + maze.n +
          ' · ' + asTime(clock());
      }
    }, 500);
  }

  function begin(code, view, trail) {
    state = fresh(code, view, trail);
    maze = buildMaze(code);
    cells = [];
    save();
    render();
    tick();
  }

  /* ---- sheets ----------------------------------------------------------- */

  let startSheet = null;
  let settingsSheet = null;

  function sheetOpen() {
    return Boolean((startSheet && startSheet.isOpen()) ||
                   (settingsSheet && settingsSheet.isOpen()));
  }

  function showStartSheet() {
    const code = $('start-code');
    const size = $('start-size');
    if (code) code.textContent = state.code;
    if (size) size.textContent = maze.n + ' × ' + maze.n + ' squares';
    const err = $('join-error');
    if (err) err.textContent = '';
    const input = $('code-input');
    if (input) input.value = '';
    if (startSheet) startSheet.open();
  }

  function options(el, values, current, format, onPick) {
    if (!el) return;
    el.textContent = '';
    for (const value of values) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = format(value);
      btn.dataset.value = String(value);
      btn.setAttribute('aria-pressed', value === current ? 'true' : 'false');
      btn.addEventListener('click', () => onPick(value));
      el.append(btn);
    }
  }

  function renderSettings() {
    options($('opt-size'), MAZE_SIZES, maze.n, v => v + '×' + v, v => {
      if (v === maze.n) return;
      begin(makeCode(v), state.view, state.trail);
      renderSettings();
      if (settingsSheet) settingsSheet.close();
      showStartSheet();
    });
    options($('opt-view'), VIEWS, state.view, v => v + '×' + v, v => {
      state.view = v;
      save();
      renderSettings();
      render();
    });
    options($('opt-trail'), TRAILS, state.trail, v => (v === 0 ? 'None' : String(v)), v => {
      state.trail = v;
      save();
      renderSettings();
      render();
    });
  }

  function joinCode() {
    const input = $('code-input');
    const err = $('join-error');
    const raw = (input && input.value ? input.value : '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!validCode(raw)) {
      if (err) err.textContent = 'Codes are five letters, A to Z.';
      return;
    }
    begin(raw, state.view, state.trail);
    state.pending = false;
    save();
    renderSettings();
    if (startSheet) startSheet.close();
  }

  /* ---- wiring ----------------------------------------------------------- */

  state = load();
  if (!state) state = fresh(makeCode(DEFAULT_SIZE), 5, 10);
  maze = buildMaze(state.code);

  startSheet = Modal.create($('start'), {
    onClose: function () {
      if (!state.pending) return;
      state.pending = false;
      save();
    }
  });
  settingsSheet = Modal.create($('settings'), { trigger: $('settings-btn'), onOpen: renderSettings });

  on($('code-btn'), 'click', showStartSheet);
  on($('new-btn'), 'click', () => {
    begin(makeCode(maze.n), state.view, state.trail);
    showStartSheet();
  });
  on($('win-new'), 'click', () => {
    begin(makeCode(maze.n), state.view, state.trail);
    showStartSheet();
  });
  on($('code-go'), 'click', joinCode);
  on($('code-input'), 'keydown', event => {
    if (event.key === 'Enter') { joinCode(); event.preventDefault(); }
  });

  for (const btn of document.querySelectorAll('.dir')) {
    btn.addEventListener('click', () => move(btn.dataset.dir));
  }

  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right'
  };
  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const dir = KEYS[event.key] || KEYS[String(event.key).toLowerCase()];
    if (!dir || sheetOpen()) return;
    move(dir);
    event.preventDefault();
  });

  // Swipe the view itself, for anyone who would rather not aim at the pad.
  const board = $('board');
  if (board) {
    let from = null;
    board.addEventListener('pointerdown', event => {
      from = { x: event.clientX, y: event.clientY };
    });
    board.addEventListener('pointerup', event => {
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      from = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
    });
    board.addEventListener('pointercancel', () => { from = null; });
  }

  render();
  renderSettings();
  tick();
  if (state.pending) showStartSheet();
})();
