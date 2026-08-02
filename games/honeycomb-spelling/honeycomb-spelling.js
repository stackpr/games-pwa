// Honeycomb: Spelling — seven letters, one of them compulsory, against a
// clock you choose. See _README.md for the rules, the scoring and the shape
// of the saved state.
(function () {
  const STORAGE_KEY = 'games.honeycomb-spelling.v1';
  // Each limit keeps its own top five: a minute and ten minutes are not the
  // same game, so their scores are not the same list.
  const LIMITS = [60, 120, 180, 300, 600];
  const DEFAULT_LIMIT = 180;
  const TOP_N = 5;
  // How many hives to remember, so the next game is unlikely to repeat one.
  const RECENT = 12;
  const RING = ['n', 'ne', 'se', 's', 'sw', 'nw'];
  const FLASH_MS = 1100;

  const HIVES = window.Hives || [];

  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'div');
  }

  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  const el = {
    score: pick('score'),
    count: pick('count'),
    clock: pick('clock'),
    typed: pick('typed'),
    flash: pick('flash'),
    say: pick('say'),
    hive: pick('hive'),
    del: pick('delete', 'button'),
    shuffle: pick('shuffle', 'button'),
    enter: pick('enter', 'button'),
    found: pick('found'),
    newBtn: pick('new', 'button'),
    scoresBtn: pick('scores-btn', 'button'),
    start: pick('start', 'section'),
    limits: pick('limits'),
    boardFor: pick('board-for', 'span'),
    board: pick('board', 'table'),
    boardRows: pick('board-rows', 'tbody'),
    boardEmpty: pick('board-empty', 'p'),
    play: pick('play', 'button'),
    over: pick('over', 'section'),
    overTitle: pick('over-title', 'h1'),
    overSub: pick('over-sub', 'p'),
    overBadge: pick('over-badge', 'p'),
    finalScore: pick('final-score', 'dd'),
    finalCount: pick('final-count', 'dd'),
    finalLongest: pick('final-longest', 'dd'),
    overBoardFor: pick('over-board-for', 'span'),
    overBoardRows: pick('over-board-rows', 'tbody'),
    allWords: pick('all-words'),
    again: pick('again', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  let state = load();
  // The game in play. Not persisted: a clock cannot be paused honestly
  // across a reload, so a reload ends the game rather than resuming it.
  let game = null;
  let phase = 'idle';
  let flashHandle = 0;
  let clock = null;

  function load() {
    const p = Store.load(STORAGE_KEY) || {};
    const limit = LIMITS.indexOf(p.limit) !== -1 ? p.limit : DEFAULT_LIMIT;
    const scores = {};
    for (const seconds of LIMITS) {
      const raw = p.scores && Array.isArray(p.scores[seconds]) ? p.scores[seconds] : [];
      scores[seconds] = raw.filter(isEntry).sort(byScore).slice(0, TOP_N);
    }
    const recent = Array.isArray(p.recent)
      ? p.recent.filter(i => Number.isInteger(i) && i >= 0 && i < HIVES.length)
      : [];
    return { limit, scores, recent };
  }

  function isEntry(e) {
    return e && Number.isFinite(e.score) && e.score > 0 && typeof e.longest === 'string';
  }

  // Highest first; an earlier game keeps the higher rank on a tie, which is
  // what "you have to beat it, not match it" means.
  function byScore(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.at || '').localeCompare(String(b.at || ''));
  }

  function save() {
    state.recent = state.recent.slice(-RECENT);
    Store.save(STORAGE_KEY, state);
  }

  function clockText(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // A stopped clock shows the limit, not 0:00, and never the last-ten-seconds
  // red — that state belongs to a game in play.
  function showIdleClock() {
    el.clock.textContent = clockText(state.limit);
    delete el.clock.dataset.low;
  }

  function shortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }

  function wordScore(word) {
    // Four letters is the floor and scores one; after that a letter is a
    // point, and using all seven is worth another seven.
    const base = word.length === 4 ? 1 : word.length;
    return base + (new Set(word).size === 7 ? 7 : 0);
  }

  // --- the hive ------------------------------------------------------------

  function nextHive() {
    if (!HIVES.length) return -1;
    const recent = new Set(state.recent);
    const fresh = HIVES.map((_, i) => i).filter(i => !recent.has(i));
    const pool = fresh.length ? fresh : HIVES.map((_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function shuffled(letters) {
    const out = letters.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function paintHive() {
    const cells = el.hive.querySelectorAll('.hex');
    for (const cell of cells) {
      const pos = cell.dataset.pos;
      if (!game) { cell.textContent = ''; continue; }
      const letter = pos === 'c' ? game.hive.centre : game.ring[RING.indexOf(pos)];
      cell.textContent = letter || '';
      cell.setAttribute('aria-label', pos === 'c'
        ? (letter || '') + ', the middle letter'
        : (letter || ''));
    }
  }

  // --- the word being typed ------------------------------------------------

  function paintTyped() {
    el.typed.textContent = '';
    const word = game ? game.typed : '';
    for (const ch of word) {
      const node = document.createElement(ch === game.hive.centre ? 'b' : 'span');
      node.textContent = ch;
      el.typed.append(node);
    }
    const caret = document.createElement('span');
    caret.className = 'caret';
    el.typed.append(caret);
  }

  function flash(text, tone) {
    clearFlash();
    el.flash.textContent = text;
    el.flash.dataset.tone = tone;
    el.flash.dataset.show = '';
    el.say.textContent = text;
    flashHandle = setTimeout(() => {
      delete el.flash.dataset.show;
      flashHandle = 0;
    }, FLASH_MS);
  }

  // The verdict shares a line with the word being typed, so starting the next
  // word takes it away rather than letting the two sit on top of each other.
  function clearFlash() {
    if (flashHandle) clearTimeout(flashHandle);
    flashHandle = 0;
    delete el.flash.dataset.show;
  }

  function typeLetter(letter) {
    if (phase !== 'playing' || !game) return;
    if (game.hive.letters.indexOf(letter) === -1) return;
    clearFlash();
    game.typed += letter;
    paintTyped();
  }

  function backspace() {
    if (phase !== 'playing' || !game) return;
    clearFlash();
    game.typed = game.typed.slice(0, -1);
    paintTyped();
  }

  function submit() {
    if (phase !== 'playing' || !game) return;
    const word = game.typed;
    game.typed = '';
    paintTyped();
    if (!word) return;

    if (word.length < 4) return flash('Too short', 'bad');
    if (word.indexOf(game.hive.centre) === -1) {
      return flash('Missing ' + game.hive.centre.toUpperCase(), 'bad');
    }
    if (game.found.indexOf(word) !== -1) return flash('Already found', 'bad');
    if (!game.answers.has(word)) return flash('Not in the list', 'bad');

    const points = wordScore(word);
    const pangram = new Set(word).size === 7;
    game.found.unshift(word);
    game.score += points;
    if (word.length > game.longest.length) game.longest = word;
    paintStats();
    paintFound();
    flash(pangram ? 'Pangram! +' + points : '+' + points, pangram ? 'wow' : 'good');
  }

  function paintStats() {
    el.score.textContent = game ? game.score : 0;
    el.count.textContent = game ? game.found.length : 0;
  }

  function paintFound() {
    el.found.textContent = '';
    if (!game || !game.found.length) {
      const empty = document.createElement('span');
      empty.className = 'found-empty';
      empty.textContent = 'Found words appear here';
      el.found.append(empty);
      return;
    }
    for (const word of game.found) {
      const chip = document.createElement('span');
      chip.className = 'word';
      chip.textContent = word;
      if (new Set(word).size === 7) chip.dataset.pangram = '';
      el.found.append(chip);
    }
  }

  // --- the score boards ----------------------------------------------------

  function paintBoard(tbody, seconds, freshAt) {
    tbody.textContent = '';
    const rows = state.scores[seconds] || [];
    rows.forEach((entry, i) => {
      const tr = document.createElement('tr');
      if (i === freshAt) tr.dataset.fresh = '';
      const rank = document.createElement('td');
      rank.className = 'rank';
      rank.textContent = i + 1;
      const pts = document.createElement('td');
      pts.className = 'pts';
      pts.textContent = entry.score;
      const longest = document.createElement('td');
      longest.className = 'longest';
      longest.textContent = entry.longest;
      const when = document.createElement('td');
      when.className = 'when';
      when.textContent = shortDate(entry.at);
      tr.append(rank, pts, longest, when);
      tbody.append(tr);
    });
    return rows.length;
  }

  function paintStartSheet() {
    for (const btn of el.limits.querySelectorAll('.limit')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.seconds) === state.limit));
    }
    el.boardFor.textContent = 'at ' + clockText(state.limit);
    // Column headings over nothing read as a broken table, so an unplayed
    // limit gets the sentence instead.
    const rows = paintBoard(el.boardRows, state.limit, -1);
    el.board.hidden = rows === 0;
    el.boardEmpty.hidden = rows > 0;
    showIdleClock();
  }

  function buildLimits() {
    el.limits.textContent = '';
    for (const seconds of LIMITS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'limit';
      btn.dataset.seconds = seconds;
      btn.textContent = clockText(seconds);
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        state.limit = seconds;
        save();
        paintStartSheet();
      });
      el.limits.append(btn);
    }
  }

  // --- the game ------------------------------------------------------------

  function openStart() {
    phase = 'idle';
    delete el.over.dataset.open;
    el.start.dataset.open = '';
    el.newBtn.textContent = 'New';
    el.scoresBtn.disabled = true;
    paintStartSheet();
  }

  function startGame() {
    const index = nextHive();
    if (index < 0) return;
    const hive = HIVES[index];
    state.recent.push(index);
    save();

    game = {
      hive: hive,
      ring: shuffled(hive.outer),
      answers: new Set(hive.words),
      found: [],
      typed: '',
      score: 0,
      longest: ''
    };
    phase = 'playing';
    clearFlash();
    delete el.start.dataset.open;
    delete el.over.dataset.open;
    el.newBtn.textContent = 'Done';
    el.scoresBtn.disabled = false;
    paintHive();
    paintTyped();
    paintStats();
    paintFound();

    clock = Timer.create(el.clock, { seconds: state.limit, onEnd: () => finish(true) });
    clock.start();
  }

  function finish(ranOut) {
    if (phase !== 'playing' || !game) return;
    phase = 'over';
    if (clock) clock.stop();
    clearFlash();
    el.overTitle.textContent = ranOut ? 'Time!' : 'Done';
    el.newBtn.textContent = 'New';
    el.scoresBtn.disabled = false;

    // A blank game is not a result: nothing goes on the board unless a word
    // was found.
    let freshAt = -1;
    if (game.score > 0) {
      const entry = {
        score: game.score,
        words: game.found.length,
        longest: game.longest,
        at: new Date().toISOString()
      };
      const board = state.scores[state.limit].concat([entry]).sort(byScore);
      freshAt = board.indexOf(entry);
      state.scores[state.limit] = board.slice(0, TOP_N);
      if (freshAt >= TOP_N) freshAt = -1;
      save();
    }

    el.finalScore.textContent = game.score;
    el.finalCount.textContent = game.found.length;
    el.finalLongest.textContent = game.longest || '—';
    el.overSub.textContent = clockText(state.limit) + ' — ' + game.found.length +
      ' of ' + game.hive.words.length + ' words.';
    el.overBadge.hidden = freshAt !== 0;
    el.overBadge.textContent = freshAt === 0 ? 'Best yet at ' + clockText(state.limit) : '';
    el.overBoardFor.textContent = 'at ' + clockText(state.limit);
    paintBoard(el.overBoardRows, state.limit, freshAt);

    el.allWords.textContent = '';
    for (const word of game.hive.words) {
      const chip = document.createElement('span');
      chip.className = 'word';
      chip.textContent = word;
      if (game.found.indexOf(word) === -1) chip.dataset.missed = '';
      else if (new Set(word).size === 7) chip.dataset.pangram = '';
      el.allWords.append(chip);
    }

    el.over.dataset.open = '';
    showIdleClock();
  }

  // --- wiring --------------------------------------------------------------

  on(el.hive, 'click', event => {
    const hex = event.target.closest ? event.target.closest('.hex') : null;
    if (hex) typeLetter(hex.textContent.trim());
  });
  on(el.del, 'click', backspace);
  on(el.enter, 'click', submit);
  on(el.shuffle, 'click', () => {
    if (!game) return;
    game.ring = shuffled(game.ring);
    paintHive();
  });
  on(el.play, 'click', startGame);
  on(el.again, 'click', startGame);
  on(el.scoresBtn, 'click', openStart);
  on(el.newBtn, 'click', () => {
    if (phase === 'playing') finish(false);
    else openStart();
  });

  const rules = Modal.create(el.rules, { trigger: el.rulesBtn });

  document.addEventListener('keydown', event => {
    if (phase !== 'playing' || rules.isOpen()) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') { submit(); event.preventDefault(); return; }
    if (event.key === 'Backspace') { backspace(); event.preventDefault(); return; }
    if (event.key === ' ') {
      if (game) { game.ring = shuffled(game.ring); paintHive(); }
      event.preventDefault();
      return;
    }
    if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
      typeLetter(event.key.toLowerCase());
      event.preventDefault();
    }
  });

  buildLimits();
  openStart();
  paintTyped();
})();
