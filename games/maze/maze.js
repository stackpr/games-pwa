/*
 * Maze — everyone types the same code and runs the same maze.
 *
 * The code is the seed: five letters in, one maze out, identically on every
 * phone. Its last letter also carries the maze size, which is why any five
 * letters someone invents is a playable code. See _README.md.
 */
(function () {
  const KEY = 'games.maze.v1';

  const MAZE_SIZES = [15, 21, 25, 31];
  const DEFAULT_SIZE = 25;
  const VIEWS = [3, 5, 7, 9];
  const TRAILS = [0, 5, 10, 20];
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
   * A recursive-backtracker carve over the odd cells. Every carved cell joins
   * a single spanning tree, so there is exactly one route between any two of
   * them — which is what guarantees the exit is reachable, without a check.
   */
  function buildMaze(code) {
    const n = sizeFor(code);
    const rand = mulberry32(hash(code));
    const wall = new Uint8Array(n * n).fill(1);
    const at = (x, y) => y * n + x;

    const mid = n >> 1;
    const sx = mid % 2 === 1 ? mid : mid - 1;
    const start = { x: sx, y: sx };

    wall[at(start.x, start.y)] = 0;
    const stack = [[start.x, start.y]];
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const options = [];
      for (const key in DIRS) {
        const [dx, dy] = DIRS[key];
        const nx = x + dx * 2;
        const ny = y + dy * 2;
        if (nx > 0 && ny > 0 && nx < n - 1 && ny < n - 1 && wall[at(nx, ny)]) {
          options.push([nx, ny, x + dx, y + dy]);
        }
      }
      if (!options.length) { stack.pop(); continue; }
      const [nx, ny, wx, wy] = options[Math.floor(rand() * options.length)];
      wall[at(wx, wy)] = 0;
      wall[at(nx, ny)] = 0;
      stack.push([nx, ny]);
    }

    // Distances from the start, so the exit can be the furthest way out
    // rather than one that happens to sit next door.
    const dist = new Int32Array(n * n).fill(-1);
    dist[at(start.x, start.y)] = 0;
    let queue = [[start.x, start.y]];
    while (queue.length) {
      const next = [];
      for (const [x, y] of queue) {
        for (const key in DIRS) {
          const [dx, dy] = DIRS[key];
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          if (wall[at(nx, ny)] || dist[at(nx, ny)] >= 0) continue;
          dist[at(nx, ny)] = dist[at(x, y)] + 1;
          next.push([nx, ny]);
        }
      }
      queue = next;
    }

    const candidates = [];
    for (let i = 1; i <= n - 2; i += 2) {
      candidates.push([i, 0, i, 1]);
      candidates.push([i, n - 1, i, n - 2]);
      candidates.push([0, i, 1, i]);
      candidates.push([n - 1, i, n - 2, i]);
    }
    let best = candidates[0];
    let bestScore = -1;
    for (const c of candidates) {
      // rand() breaks ties, so two mazes of the same shape still differ.
      const score = dist[at(c[2], c[3])] * 4 + rand();
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const exit = { x: best[0], y: best[1] };
    wall[at(exit.x, exit.y)] = 0;

    return {
      n: n,
      code: code,
      start: start,
      exit: exit,
      open: function (x, y) {
        if (x < 0 || y < 0 || x >= n || y >= n) return false;
        return !wall[y * n + x];
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
    // A position that is off the grid or inside a wall makes the steps and
    // the trail meaningless too, so the whole run goes rather than half of it.
    if (!Number.isInteger(saved.x) || !Number.isInteger(saved.y) || !m.open(saved.x, saved.y)) {
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
    // A saved position on the exit is a finished run, however it was saved.
    if (s.x === m.exit.x && s.y === m.exit.y && !s.finishedAt) s.finishedAt = Date.now();
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
    for (let j = 0; j < state.view; j++) {
      for (let i = 0; i < state.view; i++) {
        const cell = cells[j * state.view + i];
        if (!cell) continue;
        const mx = state.x + i - half;
        const my = state.y + j - half;
        const isExit = mx === maze.exit.x && my === maze.exit.y;
        const kind = isExit ? 'exit' : (maze.open(mx, my) ? 'floor' : 'wall');
        cell.dataset.t = kind;

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
      const ok = maze.open(state.x + DIRS[key][0], state.y + DIRS[key][1]);
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
    const nx = state.x + DIRS[dir][0];
    const ny = state.y + DIRS[dir][1];
    if (!maze.open(nx, ny)) return;

    if (!state.startedAt) state.startedAt = Date.now();
    state.path.push([state.x, state.y]);
    if (state.path.length > PATH_CAP) state.path = state.path.slice(-PATH_CAP);
    state.x = nx;
    state.y = ny;
    state.steps++;
    if (nx === maze.exit.x && ny === maze.exit.y) state.finishedAt = Date.now();

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
