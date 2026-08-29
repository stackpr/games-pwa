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

  function load() {
    const saved = Store.load(KEY) || {};
    solved = Number.isFinite(saved.solved) && saved.solved >= 0
      ? Math.floor(saved.solved) : 0;
    if (valid(saved.puzzle)) {
      puzzle = saved.puzzle;
      const words = puzzle.words.map(w => w.word);
      found = Array.isArray(saved.found)
        ? saved.found.filter(w => words.indexOf(w) !== -1) : [];
      hinted = Array.isArray(saved.hinted)
        ? saved.hinted.filter(c => Number.isInteger(c) && c >= 0 && c < puzzle.letters.length)
        : [];
      return true;
    }
    return false;
  }

  function save() {
    Store.save(KEY, {
      puzzle: puzzle, found: found, hinted: hinted, solved: solved
    });
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

  function finish() {
    if (!drawing) return;
    drawing = false;
    const path = trail.slice();
    trail = [];
    submit(path);
  }

  function samePath(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /*
   * Matched on the PATH alone, never on the letters.
   *
   * The path has to be the one the builder laid: two different squiggles can
   * spell the same word on a dense board, and accepting the wrong one leaves
   * the real word's cells claimed by its neighbour, which makes the rest of
   * the puzzle unsolvable through no fault of the player. Since the cells
   * decide the letters, the path is the whole identity — and comparing the
   * typed-out letters as well is not a second check, it is a bug waiting to
   * happen. It was one: reading a backwards trace gave `dracsid` for
   * `discard`, and the word test rejected it before the reversed-path test
   * could accept it.
   */
  function submit(path) {
    if (path.length < 2) { render(); return; }
    const back = path.slice().reverse();
    for (const entry of puzzle.words) {
      if (isFound(entry)) continue;
      // Either way round: a squiggle read from either end is the same one.
      if (!samePath(entry.cells, path) && !samePath(entry.cells, back)) continue;
      found.push(entry.word);
      save();
      render();
      flash(entry.spanner ? 'The spanner! ' + entry.word : entry.word, 'good');
      say(entry.word + ' found. ' + found.length + ' of ' +
        puzzle.words.length + '.');
      if (found.length === puzzle.words.length) done();
      return;
    }
    render();
    // Silent on a short scribble, but a full word that is not one of them
    // deserves an answer.
    if (path.length >= 3) flash('Not one of them', 'bad');
  }

  function done() {
    solved++;
    save();
    const title = $('over-title');
    if (title) title.textContent = 'Solved';
    const sub = $('over-sub');
    if (sub) sub.textContent = puzzle.title;
    const count = $('over-count');
    if (count) {
      count.textContent = puzzle.words.length + ' words, ' +
        puzzle.cols + '×' + puzzle.rows + ', not a letter spare';
    }
    const tallyAll = $('over-solved');
    if (tallyAll) {
      tallyAll.textContent = solved === 1
        ? 'Your first' : solved + ' puzzles solved';
    }
    say('Solved. ' + puzzle.title + '.');
    if (overSheet) overSheet.open();
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
    save();
    render();
    flash('A word starts here', 'good');
    say('A word starts at the marked letter.');
  }

  /* ---- setting up ------------------------------------------------------- */

  function deal() {
    const sets = window.SquiggleSets ? SquiggleSets.all() : [];
    if (!sets.length) {
      flash('No themes to play', 'bad');
      return false;
    }
    // A fresh seed each time, so the same theme is a different board.
    for (let tries = 0; tries < 8; tries++) {
      const set = sets[Math.floor(Math.random() * sets.length)];
      const made = build(set, Math.floor(Math.random() * 0xffffffff));
      if (made) {
        puzzle = made;
        found = [];
        hinted = [];
        trail = [];
        save();
        render();
        return true;
      }
    }
    flash('Could not build a board', 'bad');
    return false;
  }

  /* ---- wiring ----------------------------------------------------------- */

  if (!load() || !puzzle) deal();
  else render();

  overSheet = Modal.create($('over'));
  Modal.create($('rules'), { trigger: $('rules-btn') });

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
    on(board, 'pointerup', finish);
    on(board, 'pointercancel', finish);
  } else {
    on(board, 'mousedown', start);
    on(board, 'mousemove', move);
    on(board, 'mouseup', finish);
  }
  // A finger lifted outside the board still ends the squiggle.
  window.addEventListener('pointerup', finish);

  window.addEventListener('resize', sizeBoard);
  window.addEventListener('orientationchange', sizeBoard);
})();
