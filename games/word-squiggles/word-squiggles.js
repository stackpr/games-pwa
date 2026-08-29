/*
 * Word Squiggles — every letter on the board belongs to one themed word, and
 * the words snake. See _README.md for the theme sets, the layout search and
 * the shape of the saved state.
 */
(function () {
  const KEY = 'games.word-squiggles.v1';
  // Eight-way, because a squiggle that could only turn square corners is a
  // word search with extra steps.
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  /*
   * The board is never predetermined: the words are picked first and the
   * grid is whatever shape their letters divide into. That is what keeps a
   * theme worth playing twice — same twenty sets, a different board and a
   * different subset nearly every time. See _README.md.
   */
  const SHAPE = { minWords: 6, maxWords: 9, minCols: 5, maxCols: 7, minRows: 6, maxRows: 9 };
  // A failed search is cheap and a retry usually lands, so the budget is
  // per-attempt rather than a single long grind.
  const STEP_BUDGET = 60000;
  const ATTEMPTS = 25;
  /*
   * How many whole boards to build before picking one, and it is worth the
   * time. A word that can be traced along more than one path is the game's
   * worst moment — the player spells it correctly and is told it is wrong,
   * because a squiggle is matched by the path the builder laid.
   *
   * Steering the SEARCH away from that (preferring cells whose neighbours do
   * not already carry the same letter) was tried and measured: 59% of words
   * ambiguous down to 55%, for double the build time. Building several whole
   * boards and keeping the least ambiguous takes 59% to 31%. Same idea,
   * applied where it can actually see the answer.
   *
   * Avoided, never prohibited: a board with no ambiguity at all may not
   * exist for a given set of words, so this picks the best of what it built
   * rather than searching until it finds perfection. There is no loop that
   * can fail to end.
   */
  const BOARD_TRIES = 6;
  const TOP_N = 5;
  /*
   * A hint costs time, and each one costs more than the last: the first is a
   * nudge, the fourth is being carried. Arithmetic rather than doubling, so
   * a player who wants four hints is not looking at a nonsense number.
   */
  const HINT_PENALTY_MS = 15000;

  const $ = id => document.getElementById(id);
  // A worker can serve this script with the previous release's HTML, so
  // every binding tolerates a missing node rather than taking the page down.
  function on(node, type, fn, opts) {
    if (node) node.addEventListener(type, fn, opts);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  /* ---- state ------------------------------------------------------------ */

  let puzzle = null;      // { title, cols, rows, letters, words, spanner }
  let found = [];         // words already got, in the order they were found
  let solved = 0;         // puzzles completed, all time
  let hinted = [];        // cell indexes revealed by a hint
  let trail = [];         // the path being drawn right now
  let drawing = false;
  let overSheet = null;
  let boardSheet = null;
  let times = {};         // best times, keyed by board shape
  let startedAt = null;   // when the clock started, or null while stopped
  let elapsed = 0;        // banked milliseconds
  let ticker = null;
  let fresh = null;       // the entry just recorded, to mark on the board

  /* ---- the random source ------------------------------------------------ */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rnd) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /* ---- building a puzzle ------------------------------------------------ */

  /*
   * Pick the words, and let them choose the board. Fixing the grid first
   * would mean hunting for a subset that totals one exact number; this way
   * any total with a sensible factorisation will do, which is a far easier
   * thing to ask of sixteen words.
   */
  function pickBoard(words, rnd) {
    for (let tries = 0; tries < 400; tries++) {
      const take = SHAPE.minWords +
        Math.floor(rnd() * (SHAPE.maxWords - SHAPE.minWords + 1));
      const set = shuffle(words, rnd).slice(0, take);
      let total = 0;
      for (const w of set) total += w.length;
      for (let cols = SHAPE.minCols; cols <= SHAPE.maxCols; cols++) {
        if (total % cols) continue;
        const rows = total / cols;
        if (rows < SHAPE.minRows || rows > SHAPE.maxRows) continue;
        // Something has to be able to cross the board for the spanner.
        if (!set.some(w => w.length >= Math.min(cols, rows))) continue;
        return { words: set, cols: cols, rows: rows };
      }
    }
    return null;
  }

  /*
   * Lay the words so every cell is used exactly once. Backtracking, longest
   * word first, with one piece of pruning doing nearly all the work — see
   * blobsOk below.
   */
  function layout(words, cols, rows, rnd) {
    const size = cols * rows;
    const grid = new Int16Array(size).fill(-1);
    const order = words.slice().sort((a, b) => b.length - a.length);
    const shortest = order[order.length - 1].length;
    let steps = 0;
    let spanner = -1;

    const near = [];
    for (let i = 0; i < size; i++) {
      const x = i % cols;
      const y = (i - x) / cols;
      const list = [];
      for (const [dy, dx] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) list.push(ny * cols + nx);
      }
      near.push(list);
    }

    /*
     * The pruning that makes this finish in milliseconds instead of seconds.
     * After each word the empty cells fall into connected blobs, and a blob
     * smaller than the shortest word left can never be filled — so the whole
     * branch is dead and there is no point exploring it. Without this the
     * search spends its life painting itself into corners.
     */
    function blobsOk() {
      const seen = new Uint8Array(size);
      const stack = [];
      for (let i = 0; i < size; i++) {
        if (grid[i] !== -1 || seen[i]) continue;
        let n = 0;
        stack.push(i);
        seen[i] = 1;
        while (stack.length) {
          const c = stack.pop();
          n++;
          for (const j of near[c]) {
            if (grid[j] === -1 && !seen[j]) { seen[j] = 1; stack.push(j); }
          }
        }
        if (n < shortest) return false;
      }
      return true;
    }

    // Touching two opposite edges is what makes a word the spanner.
    function spans(path) {
      let l = false, r = false, t = false, b = false;
      for (const i of path) {
        const x = i % cols;
        const y = (i - x) / cols;
        if (x === 0) l = true;
        if (x === cols - 1) r = true;
        if (y === 0) t = true;
        if (y === rows - 1) b = true;
      }
      return (l && r) || (t && b);
    }

    const paths = [];

    function walk(n, path, word) {
      if (++steps > STEP_BUDGET) return false;
      if (path.length === word.length) {
        if (n + 1 < order.length && !blobsOk()) return false;
        const took = spanner === -1 && spans(path);
        if (took) spanner = n;
        paths[n] = path.slice();
        if (next(n + 1)) return true;
        if (took) spanner = -1;
        return false;
      }
      for (const i of shuffle(near[path[path.length - 1]], rnd)) {
        if (grid[i] !== -1) continue;
        grid[i] = n;
        path.push(i);
        if (walk(n, path, word)) return true;
        path.pop();
        grid[i] = -1;
      }
      return false;
    }

    function next(n) {
      // Every word placed, but no spanner means no puzzle.
      if (n === order.length) return spanner !== -1;
      const empty = [];
      for (let i = 0; i < size; i++) if (grid[i] === -1) empty.push(i);
      for (const start of shuffle(empty, rnd)) {
        grid[start] = n;
        if (walk(n, [start], order[n])) return true;
        grid[start] = -1;
      }
      return false;
    }

    if (!next(0)) return null;
    return { order: order, paths: paths, spanner: spanner };
  }

  /*
   * Can this word be spelled over a DIFFERENT set of squares from the one it
   * was given? That, and only that, is what the game refuses — a path over
   * the word's own cells in another order is accepted, so it is not
   * ambiguity and must not be counted as any.
   *
   * Stops at the first one found: whether there are two such paths or twenty
   * makes no difference to the board's score, and a full count on a dense
   * grid is exponential for no extra information.
   */
  function elsewhere(letters, cols, rows, entry) {
    const own = new Set(entry.cells);
    const used = new Set();
    let other = false;
    function go(i, k, strayed) {
      if (other) return;
      if (k === entry.word.length) {
        if (strayed) other = true;
        return;
      }
      const x = i % cols;
      const y = (i - x) / cols;
      for (const [dy, dx] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const j = ny * cols + nx;
        if (used.has(j) || letters[j] !== entry.word[k]) continue;
        used.add(j);
        go(j, k + 1, strayed || !own.has(j));
        used.delete(j);
        if (other) return;
      }
    }
    for (let i = 0; i < letters.length && !other; i++) {
      if (letters[i] !== entry.word[0]) continue;
      used.clear();
      used.add(i);
      go(i, 1, !own.has(i));
    }
    return other;
  }

  /** How many of a board's words can be spelled off their own squares. */
  function murkiness(made) {
    let n = 0;
    for (const entry of made.words) {
      if (elsewhere(made.letters, made.cols, made.rows, entry)) n++;
    }
    return n;
  }

  /** A whole puzzle, or null if the search came up empty. */
  function build(set, seed) {
    const rnd = mulberry32(seed);
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const board = pickBoard(set.words, rnd);
      if (!board) continue;
      const laid = layout(board.words, board.cols, board.rows, rnd);
      if (!laid) continue;
      const letters = new Array(board.cols * board.rows).fill('');
      const words = laid.order.map((word, n) => {
        const cells = laid.paths[n];
        for (let k = 0; k < word.length; k++) letters[cells[k]] = word[k];
        return { word: word, cells: cells, spanner: n === laid.spanner };
      });
      return {
        title: set.title,
        cols: board.cols,
        rows: board.rows,
        letters: letters,
        words: words
      };
    }
    return null;
  }

  /* ---- the clock -------------------------------------------------------- */

  function shape() {
    return puzzle.cols + '\u00d7' + puzzle.rows;
  }

  function onClock() {
    if (!startedAt) return elapsed;
    return elapsed + (Date.now() - startedAt);
  }

  function asTime(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function paintClock() {
    const clock = $('clock');
    if (clock) clock.textContent = asTime(onClock());
  }

  function tick() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (!startedAt) return;
    ticker = setInterval(paintClock, 200);
  }

  // Starts on the first squiggle, not on load: reading the theme, or picking
  // the phone up again, costs nothing.
  function startClock() {
    if (startedAt || done()) return;
    startedAt = Date.now();
    tick();
  }

  function stopClock() {
    elapsed = onClock();
    startedAt = null;
    if (ticker) { clearInterval(ticker); ticker = null; }
    paintClock();
  }

  function done() {
    return Boolean(puzzle) && found.length === puzzle.words.length;
  }

  /*
   * What a solve was worth. The clock is the raw time; each hint adds more
   * than the one before it, and the total is what ranks.
   */
  function reckon() {
    const raw = onClock();
    let penalty = 0;
    for (let n = 1; n <= hinted.length; n++) penalty += n * HINT_PENALTY_MS;
    return { raw: raw, hints: hinted.length, penalty: penalty,
      total: raw + penalty };
  }

  /* ---- persistence ------------------------------------------------------ */

  function valid(p) {
    if (!p || typeof p !== 'object') return false;
    if (typeof p.title !== 'string' || !p.title) return false;
    if (!Number.isInteger(p.cols) || !Number.isInteger(p.rows)) return false;
    if (p.cols < 3 || p.rows < 3 || p.cols > 12 || p.rows > 12) return false;
    if (!Array.isArray(p.letters) || p.letters.length !== p.cols * p.rows) return false;
    if (!Array.isArray(p.words) || !p.words.length) return false;
    const size = p.cols * p.rows;
    let covered = 0;
    for (const entry of p.words) {
      if (!entry || typeof entry.word !== 'string') return false;
      if (!Array.isArray(entry.cells) || entry.cells.length !== entry.word.length) return false;
      for (const c of entry.cells) if (!Number.isInteger(c) || c < 0 || c >= size) return false;
      covered += entry.cells.length;
    }
    // Every cell used exactly once is the one invariant the whole game rests
    // on, so a saved board that breaks it is thrown away rather than played.
    return covered === size;
  }

  /** Best times per board shape, thrown away rather than trusted if wrong. */
  function loadTimes(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const key of Object.keys(raw)) {
      if (!/^\d{1,2}\u00d7\d{1,2}$/.test(key) || !Array.isArray(raw[key])) continue;
      out[key] = raw[key]
        .filter(e => e && Number.isFinite(e.total) && e.total >= 0 &&
          Number.isInteger(e.hints) && e.hints >= 0)
        .slice(0, TOP_N)
        .map(e => ({
          total: Math.round(e.total),
          raw: Number.isFinite(e.raw) ? Math.round(e.raw) : Math.round(e.total),
          hints: e.hints,
          title: typeof e.title === 'string' ? e.title : '',
          at: Number.isFinite(e.at) ? e.at : 0
        }))
        .sort((a, b) => a.total - b.total);
    }
    return out;
  }

  function load() {
    const saved = Store.load(KEY) || {};
    solved = Number.isFinite(saved.solved) && saved.solved >= 0
      ? Math.floor(saved.solved) : 0;
    times = loadTimes(saved.times);
    if (valid(saved.puzzle)) {
      puzzle = saved.puzzle;
      const words = puzzle.words.map(w => w.word);
      found = Array.isArray(saved.found)
        ? saved.found.filter(w => words.indexOf(w) !== -1) : [];
      hinted = Array.isArray(saved.hinted)
        ? saved.hinted.filter(c => Number.isInteger(c) && c >= 0 && c < puzzle.letters.length)
        : [];
      /*
       * The clock is restored but never left running. A reload cannot be
       * timed honestly — the page was not open — so what was banked is kept
       * and the clock starts again on the next squiggle.
       */
      elapsed = Number.isFinite(saved.elapsed) && saved.elapsed >= 0
        ? Math.floor(saved.elapsed) : 0;
      startedAt = null;
      return true;
    }
    return false;
  }

  function save() {
    Store.save(KEY, {
      puzzle: puzzle, found: found, hinted: hinted, solved: solved,
      elapsed: onClock(), times: times
    });
  }

  /** Files a solve, and says where it landed. */
  function record(sum) {
    const key = shape();
    const list = times[key] || [];
    const entry = { total: sum.total, raw: sum.raw, hints: sum.hints,
      title: puzzle.title, at: Date.now() };
    list.push(entry);
    list.sort((a, b) => a.total - b.total);
    times[key] = list.slice(0, TOP_N);
    fresh = times[key].indexOf(entry) >= 0 ? entry : null;
    return times[key].indexOf(entry);
  }

  /* ---- rendering -------------------------------------------------------- */

  function wordAt(cell) {
    for (const entry of puzzle.words) {
      if (entry.cells.indexOf(cell) !== -1) return entry;
    }
    return null;
  }

  function isFound(entry) {
    return found.indexOf(entry.word) !== -1;
  }

  function render() {
    const board = $('board');
    if (board) {
      board.style.gridTemplateColumns = 'repeat(' + puzzle.cols + ', 1fr)';
      board.style.gridTemplateRows = 'repeat(' + puzzle.rows + ', 1fr)';
      if (board.childElementCount !== puzzle.letters.length) {
        board.textContent = '';
        puzzle.letters.forEach((ch, i) => {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.i = String(i);
          const span = document.createElement('span');
          span.textContent = ch;
          cell.append(span);
          board.append(cell);
        });
      }
      for (const cell of board.children) {
        const i = Number(cell.dataset.i);
        /*
         * The letter is written every time, not only when the grid is
         * rebuilt. The cells above are reused whenever the new board has as
         * many squares as the old one — which happens often, since the
         * builder only picks from ten shapes — and a reused cell kept the
         * letter it had. The symptom was a new theme appearing over the
         * previous puzzle's letters.
         */
        const face = cell.firstElementChild;
        if (face && face.textContent !== puzzle.letters[i]) {
          face.textContent = puzzle.letters[i];
        }
        const entry = wordAt(i);
        const done = entry && isFound(entry);
        cell.dataset.state = done ? (entry.spanner ? 'span' : 'found') : 'open';
        if (trail.indexOf(i) !== -1) cell.dataset.trail = '';
        else delete cell.dataset.trail;
        if (!done && hinted.indexOf(i) !== -1) cell.dataset.hint = '';
        else delete cell.dataset.hint;
      }
    }

    const theme = $('theme');
    if (theme) theme.textContent = puzzle.title;
    const tally = $('tally');
    if (tally) tally.textContent = found.length + ' of ' + puzzle.words.length;

    const list = $('words');
    if (list) {
      list.textContent = '';
      for (const entry of puzzle.words) {
        const chip = document.createElement('li');
        chip.className = 'chip-word';
        if (isFound(entry)) {
          chip.textContent = entry.word;
          if (entry.spanner) chip.dataset.spanner = '';
        } else {
          chip.textContent = '·'.repeat(entry.word.length);
          chip.dataset.hidden = '';
        }
        list.append(chip);
      }
    }

    /*
     * Sized last, and again on the next frame. The word list below wraps to
     * however many chips there are, which changes the height the board has
     * to fit into — measuring before it is built measures a box that will
     * not exist by the time anything is painted.
     */
    sizeBoard();
    if (window.requestAnimationFrame) requestAnimationFrame(sizeBoard);
  }

  /*
   * The board is square-celled and has to fit whatever the bars leave, at
   * any of the ten shapes the builder produces. Measured rather than
   * guessed, so the header can grow without pushing the grid off-screen.
   */
  function sizeBoard() {
    const board = $('board');
    const stage = document.querySelector('.stage');
    if (!board || !stage) return;
    const box = stage.getBoundingClientRect();
    const gap = 0.25 * 16;
    const wide = (box.width - gap * (puzzle.cols - 1)) / puzzle.cols;
    const tall = (box.height - gap * (puzzle.rows - 1)) / puzzle.rows;
    /*
     * Floored so the letters stay readable, but floored LOW: a nine-row
     * board on a short phone genuinely has less room than a comfortable
     * cell, and a floor that wins over the measurement makes the board
     * taller than its stage — which .stage then clips, silently eating the
     * bottom row. Whole pixels, because a fraction rounds the wrong way and
     * spills.
     */
    const cell = Math.max(16, Math.floor(Math.min(wide, tall)));
    board.style.width = (cell * puzzle.cols + gap * (puzzle.cols - 1)) + 'px';
    board.style.height = (cell * puzzle.rows + gap * (puzzle.rows - 1)) + 'px';
  }

  let flashTimer = null;
  function flash(text, tone) {
    const el = $('flash');
    if (!el) return;
    el.textContent = text;
    el.dataset.show = '';
    if (tone) el.dataset.tone = tone;
    else delete el.dataset.tone;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { delete el.dataset.show; }, 1600);
  }

  function say(text) {
    const el = $('say');
    if (el) el.textContent = text;
  }

  /* ---- drawing a squiggle ----------------------------------------------- */

  function adjacent(a, b) {
    const ax = a % puzzle.cols;
    const ay = (a - ax) / puzzle.cols;
    const bx = b % puzzle.cols;
    const by = (b - bx) / puzzle.cols;
    return a !== b && Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
  }

  function locked(cell) {
    const entry = wordAt(cell);
    return Boolean(entry && isFound(entry));
  }

  /*
   * How far from a cell's centre still counts as being in it, as a fraction
   * of the cell. A drag from one centre to a diagonal neighbour passes
   * through the corner where four cells meet, and without this it picks up
   * whichever neighbour it grazed on the way — so the squiggle recorded is
   * not the one the player drew, and a word they traced correctly is
   * refused. Corners are dead space; the middle of a cell is what selects
   * it.
   */
  const INNER = 0.34;

  function cellFrom(event, loose) {
    const node = document.elementFromPoint(event.clientX, event.clientY);
    const cell = node && node.closest ? node.closest('.cell') : null;
    if (!cell) return -1;
    // A tap starts anywhere in the cell; only the drag is fussy.
    if (loose) return Number(cell.dataset.i);
    const box = cell.getBoundingClientRect();
    if (!box.width || !box.height) return -1;
    const dx = Math.abs(event.clientX - (box.left + box.width / 2)) / box.width;
    const dy = Math.abs(event.clientY - (box.top + box.height / 2)) / box.height;
    if (dx > INNER || dy > INNER) return -1;
    return Number(cell.dataset.i);
  }

  function extend(i) {
    if (i < 0 || locked(i)) return;
    const at = trail.indexOf(i);
    // Dragging back over the last-but-one undoes a step, which is how a
    // wrong turn is corrected without lifting a finger.
    if (at !== -1) {
      if (at === trail.length - 2) { trail.pop(); render(); }
      return;
    }
    if (trail.length && !adjacent(trail[trail.length - 1], i)) return;
    trail.push(i);
    render();
  }

  function start(event) {
    if (!puzzle || event.button > 0) return;
    const i = cellFrom(event, true);
    if (i < 0 || locked(i)) return;
    drawing = true;
    startClock();
    trail = [i];
    render();
    if (event.pointerId !== undefined && event.target.setPointerCapture) {
      // Capture so a finger that slides off the board still reports moves.
      try { event.target.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
    }
    event.preventDefault();
  }

  function move(event) {
    if (!drawing) return;
    extend(cellFrom(event));
    event.preventDefault();
  }

  /*
   * The end of a drag. Named apart from finish() below on purpose: both were
   * called `finish` once, declarations hoist, and the later one silently
   * took the name — so every pointerup ran the puzzle-complete handler and
   * no traced word was ever submitted. Nothing in the file looked wrong.
   */
  function endTrail() {
    if (!drawing) return;
    drawing = false;
    const path = trail.slice();
    trail = [];
    submit(path);
  }

  /*
   * The same squares, in any order. What a word owns is its cells, not the
   * order they were laid in — so a path over exactly those cells claims
   * exactly that word's squares and leaves the tiling intact, which is the
   * invariant the whole game rests on.
   */
  function sameCells(laid, path) {
    if (laid.length !== path.length) return false;
    const own = new Set(laid);
    for (const i of path) if (!own.has(i)) return false;
    return true;
  }

  function reading(path) {
    let out = '';
    for (const i of path) out += puzzle.letters[i];
    return out;
  }

  function backwards(word) {
    return word.split('').reverse().join('');
  }

  /*
   * Two tests, and it takes both.
   *
   * **The same squares.** A word must be traced over the cells the builder
   * gave it. Two different squiggles can spell the same word on a dense
   * board, and accepting one that borrowed a neighbour's cells would leave
   * the real word unsolvable through no fault of the player.
   *
   * **Spelling the word, from either end.** The ORDER within those cells is
   * not checked, because it is not always meaningful: DRESS puts its two
   * S's on two particular squares, and a player who traces them in the other
   * order has drawn a squiggle nobody could tell from the intended one —
   * same squares, same letters, same word. Refusing that refuses a correct
   * answer. What the letters still rule out is a scramble of the right cells
   * spelling nothing.
   *
   * Order used to be the whole test, and it rejected every backwards trace,
   * because reading `discard` from the far end gives `dracsid`. Hence
   * comparing the reading against the word AND its reverse.
   */
  function submit(path) {
    if (path.length < 2) { render(); return; }
    const drawn = reading(path);
    for (const entry of puzzle.words) {
      if (isFound(entry)) continue;
      if (!sameCells(entry.cells, path)) continue;
      if (drawn !== entry.word && drawn !== backwards(entry.word)) continue;
      found.push(entry.word);
      save();
      render();
      flash(entry.spanner ? 'The spanner! ' + entry.word : entry.word, 'good');
      say(entry.word + ' found. ' + found.length + ' of ' +
        puzzle.words.length + '.');
      if (done()) finish();
      return;
    }
    render();
    // Silent on a short scribble, but a full word that is not one of them
    // deserves an answer.
    if (path.length >= 3) flash('Not one of them', 'bad');
  }

  function finish() {
    stopClock();
    solved++;
    const sum = reckon();
    const rank = record(sum);
    save();

    const title = $('over-title');
    if (title) title.textContent = 'Solved';
    const sub = $('over-sub');
    if (sub) sub.textContent = puzzle.title;
    const count = $('over-count');
    if (count) {
      count.textContent = puzzle.words.length + ' words, ' + shape() +
        ', not a letter spare';
    }
    const tag = $('best-tag');
    if (tag) tag.hidden = rank !== 0;

    const sums = $('sums');
    if (sums) {
      sums.textContent = '';
      sums.append(sumLine('On the clock', asTime(sum.raw)));
      sums.append(sumLine(
        sum.hints ? sum.hints + (sum.hints === 1 ? ' hint' : ' hints') : 'No hints',
        sum.penalty ? '+' + Math.round(sum.penalty / 1000) + 's' : '0s',
        sum.penalty ? 'penalty' : ''));
      sums.append(sumLine('Your time at ' + shape(), asTime(sum.total), 'final'));
    }

    const tallyAll = $('over-solved');
    if (tallyAll) {
      tallyAll.textContent = solved === 1
        ? 'Your first' : solved + ' puzzles solved';
    }
    say('Solved. ' + puzzle.title + '. ' + asTime(sum.total) + '.');
    if (overSheet) overSheet.open();
  }

  function sumLine(label, value, className) {
    const row = document.createElement('div');
    if (className) row.className = className;
    const a = document.createElement('span');
    a.textContent = label;
    const b = document.createElement('span');
    b.textContent = value;
    row.append(a, b);
    return row;
  }

  /* ---- the leaderboard --------------------------------------------------- */

  /*
   * Kept per board shape, because they are not comparable: a 7x9 board is
   * more than twice the work of a 5x7 and a single list would only ever show
   * the small ones. Sorted small to large so a shape's difficulty is legible
   * from the order.
   */
  function shapesPlayed() {
    return Object.keys(times).filter(k => times[k] && times[k].length)
      .sort((a, b) => cells(a) - cells(b));
  }

  function cells(key) {
    const parts = key.split('\u00d7');
    return Number(parts[0]) * Number(parts[1]);
  }

  function renderBoard() {
    const body = $('board-body');
    if (!body) return;
    body.textContent = '';
    const played = shapesPlayed();
    if (!played.length) {
      const p = document.createElement('p');
      p.className = 'score-empty';
      p.textContent = 'No times yet. Solve a board and it lands here under ' +
        'its own size — and every hint you take adds to the clock, more each ' +
        'time.';
      body.append(p);
      return;
    }
    for (const key of played) {
      const head = document.createElement('h3');
      head.className = 'score-shape';
      head.textContent = key;
      body.append(head);

      const ol = document.createElement('ol');
      ol.className = 'score-list';
      times[key].forEach(entry => {
        const li = document.createElement('li');
        const time = document.createElement('span');
        time.textContent = asTime(entry.total);
        const detail = document.createElement('span');
        detail.className = 'detail';
        detail.textContent = entry.hints
          ? asTime(entry.raw) + ' + ' + entry.hints +
            (entry.hints === 1 ? ' hint' : ' hints')
          : 'no hints';
        li.append(time, detail);
        if (fresh && entry === fresh) li.dataset.fresh = '';
        ol.append(li);
      });
      body.append(ol);
    }
  }

  /* ---- hints ------------------------------------------------------------ */

  /*
   * A hint gives the first letter of a word still out, and nothing more.
   * Showing the whole shape would just be the answer; showing where a word
   * begins is the part that is genuinely hard to see on a full board.
   */
  function hint() {
    if (!puzzle) return;
    const left = puzzle.words.filter(entry => !isFound(entry) &&
      hinted.indexOf(entry.cells[0]) === -1);
    if (!left.length) {
      flash(found.length === puzzle.words.length ? 'All found' : 'No more hints', 'bad');
      return;
    }
    const entry = left[Math.floor(Math.random() * left.length)];
    hinted.push(entry.cells[0]);
    // Each hint costs more than the last, so the price is worth saying out
    // loud rather than discovering on the finish screen.
    const cost = Math.round(hinted.length * HINT_PENALTY_MS / 1000);
    save();
    render();
    flash('A word starts here  ·  +' + cost + 's', 'good');
    say('A word starts at the marked letter. That cost ' + cost + ' seconds.');
  }

  /* ---- setting up ------------------------------------------------------- */

  function deal() {
    const sets = window.SquiggleSets ? SquiggleSets.all() : [];
    if (!sets.length) {
      flash('No themes to play', 'bad');
      return false;
    }
    const set = sets[Math.floor(Math.random() * sets.length)];
    /*
     * Several boards, and the clearest one wins. A fresh seed each time, so
     * the same theme is a different board — and a board where fewer words
     * can be traced two ways is a board that will not refuse a squiggle the
     * player drew correctly. A perfect board may not exist for these words,
     * so this takes the best it built rather than searching for one.
     */
    let best = null;
    let bestScore = Infinity;
    for (let tries = 0; tries < BOARD_TRIES; tries++) {
      const made = build(set, Math.floor(Math.random() * 0xffffffff));
      if (!made) continue;
      const score = murkiness(made);
      if (score < bestScore) { bestScore = score; best = made; }
      if (!score) break;
    }
    if (best) {
      puzzle = best;
      found = [];
      hinted = [];
      trail = [];
      fresh = null;
      elapsed = 0;
      startedAt = null;
      if (ticker) { clearInterval(ticker); ticker = null; }
      save();
      render();
      paintClock();
      return true;
    }
    flash('Could not build a board', 'bad');
    return false;
  }

  /* ---- wiring ----------------------------------------------------------- */

  if (!load() || !puzzle) deal();
  else render();

  overSheet = Modal.create($('over'));
  boardSheet = Modal.create($('board-sheet'), {
    trigger: $('board-btn'),
    onOpen: renderBoard
  });
  Modal.create($('rules'), { trigger: $('rules-btn') });
  paintClock();
  // A finished board that was restored keeps its clock stopped.
  if (done()) stopClock();

  on($('new-btn'), 'click', () => {
    if (overSheet) overSheet.close();
    deal();
  });
  on($('again'), 'click', () => {
    if (overSheet) overSheet.close();
    deal();
  });
  on($('hint-btn'), 'click', hint);

  const board = $('board');
  if (window.PointerEvent) {
    on(board, 'pointerdown', start);
    on(board, 'pointermove', move);
    on(board, 'pointerup', endTrail);
    on(board, 'pointercancel', endTrail);
  } else {
    on(board, 'mousedown', start);
    on(board, 'mousemove', move);
    on(board, 'mouseup', endTrail);
  }
  // A finger lifted outside the board still ends the squiggle.
  window.addEventListener('pointerup', endTrail);

  window.addEventListener('resize', sizeBoard);
  window.addEventListener('orientationchange', sizeBoard);
})();
