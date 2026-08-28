/*
 * Word Sprint: six tries at a hidden word, against the clock, with every
 * unused try worth ten seconds off. See _README.md.
 */
(function () {
  const KEY = 'games.word-sprint.v1';
  const TRIES = 6;
  const BONUS_MS = 10000;
  const TOP_N = 5;
  const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  const $ = id => document.getElementById(id);
  // A worker can serve this script with the previous release's HTML, so every
  // binding tolerates a missing node rather than taking the page down.
  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  /* ---- state ------------------------------------------------------------ */

  let state = null;
  let scores = {};
  let boardLength = 5;
  let ticker = null;
  let checking = false;
  let flashTimer = null;
  let fresh = null;
  let overSheet = null;
  let boardSheet = null;

  function blankGame(length) {
    return {
      length: length,
      answer: SprintWords.answer(length) || '',
      rows: [],
      typed: '',
      startedAt: null,
      elapsed: 0,
      done: null
    };
  }

  function playing() {
    return state && !state.done;
  }

  /* ---- persistence ------------------------------------------------------ */

  function loadScores(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const length of SprintWords.LENGTHS) {
      const list = raw[length];
      if (!Array.isArray(list)) continue;
      out[length] = list
        .filter(r => r && Number.isFinite(r.ms) && r.ms >= 0 &&
          Number.isInteger(r.tries) && r.tries >= 1 && r.tries <= TRIES)
        .slice(0, TOP_N)
        .map(r => ({
          ms: Math.round(r.ms),
          raw: Number.isFinite(r.raw) ? Math.round(r.raw) : Math.round(r.ms),
          tries: r.tries,
          word: typeof r.word === 'string' ? r.word : '',
          at: Number.isFinite(r.at) ? r.at : 0
        }));
    }
    return out;
  }

  function load() {
    const saved = Store.load(KEY);
    scores = loadScores(saved && saved.scores);
    const length = saved && SprintWords.LENGTHS.indexOf(saved.length) >= 0
      ? saved.length : 5;
    boardLength = length;
    return length;
  }

  function save() {
    Store.save(KEY, { length: state.length, scores: scores });
  }

  /* ---- the clock -------------------------------------------------------- */

  function elapsed() {
    if (!state.startedAt) return state.elapsed;
    return state.elapsed + (Date.now() - state.startedAt);
  }

  function asTime(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function tick() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (!playing() || !state.startedAt) return;
    ticker = setInterval(paintClock, 200);
  }

  function paintClock() {
    const clock = $('clock');
    if (clock) clock.textContent = asTime(elapsed());
  }

  /* ---- scoring ---------------------------------------------------------- */

  /** Raw time, the bonus for tries not needed, and what counts. */
  function reckon() {
    const used = state.rows.length;
    const spare = Math.max(0, TRIES - used);
    const raw = elapsed();
    const bonus = spare * BONUS_MS;
    return { used: used, spare: spare, raw: raw, bonus: bonus,
      final: Math.max(0, raw - bonus) };
  }

  function record(sum) {
    const length = state.length;
    const list = scores[length] || [];
    const entry = { ms: sum.final, raw: sum.raw, tries: sum.used,
      word: state.answer, at: Date.now() };
    list.push(entry);
    list.sort((a, b) => a.ms - b.ms);
    scores[length] = list.slice(0, TOP_N);
    fresh = scores[length].indexOf(entry) >= 0 ? entry : null;
    return scores[length].indexOf(entry);
  }

  /* ---- marking a guess -------------------------------------------------- */

  /*
   * Two passes, and it has to be two: exact positions are claimed first, so a
   * repeated letter is only called "somewhere else" if there is still one of
   * it left unaccounted for. Guess SASSY against BASIS and its two S's are
   * spent — one exactly placed, one amber — leaving the third S grey. A
   * single pass would call all three amber, which tells the player the
   * answer holds three S's when it holds two.
   */
  function mark(guess, answer) {
    const marks = new Array(guess.length).fill('wrong');
    const left = {};
    for (let i = 0; i < answer.length; i++) {
      if (guess[i] === answer[i]) marks[i] = 'right';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < guess.length; i++) {
      if (marks[i] === 'right') continue;
      const ch = guess[i];
      if (left[ch]) { marks[i] = 'near'; left[ch]--; }
    }
    return marks;
  }

  /** The best news each letter has had, for the keyboard. */
  function letterMarks() {
    const rank = { wrong: 0, near: 1, right: 2 };
    const best = {};
    for (const row of state.rows) {
      for (let i = 0; i < row.word.length; i++) {
        const ch = row.word[i];
        const m = row.marks[i];
        if (!best[ch] || rank[m] > rank[best[ch]]) best[ch] = m;
      }
    }
    return best;
  }

  /* ---- rendering -------------------------------------------------------- */

  function render() {
    const board = $('board');
    if (board) {
      board.textContent = '';
      board.style.gridTemplateRows = 'repeat(' + TRIES + ', 1fr)';
      for (let r = 0; r < TRIES; r++) {
        const row = document.createElement('div');
        row.className = 'row';
        row.dataset.r = String(r);
        row.style.gridTemplateColumns = 'repeat(' + state.length + ', 1fr)';
        const done = state.rows[r];
        for (let i = 0; i < state.length; i++) {
          const box = document.createElement('div');
          box.className = 'box';
          if (done) {
            box.textContent = done.word[i];
            box.dataset.mark = done.marks[i];
          } else if (r === state.rows.length && state.typed[i]) {
            box.textContent = state.typed[i];
            box.dataset.filled = '';
          }
          row.append(box);
        }
        board.append(row);
      }
      sizeBoard();
    }

    const marks = letterMarks();
    for (const key of document.querySelectorAll('.key[data-ch]')) {
      const m = marks[key.dataset.ch];
      if (m) key.dataset.mark = m;
      else delete key.dataset.mark;
    }

    for (const b of document.querySelectorAll('#lengths button')) {
      b.setAttribute('aria-pressed',
        Number(b.dataset.length) === state.length ? 'true' : 'false');
    }
    paintClock();
  }

  /*
   * The board is square-celled and must fit whatever the keyboard and the
   * bars leave, at any length. Width is the limit on a phone at six letters;
   * height is the limit at four, where six big rows would otherwise run off
   * the top. Measured rather than guessed at, so the two bars can grow.
   */
  function sizeBoard() {
    const board = $('board');
    const stage = document.querySelector('.stage');
    if (!board || !stage) return;
    const box = stage.getBoundingClientRect();
    const gap = 0.3 * 16;
    const wide = (box.width - 8 - gap * (state.length - 1)) / state.length;
    const tall = (box.height - 28 - gap * (TRIES - 1)) / TRIES;
    const cell = Math.max(18, Math.min(wide, tall));
    board.style.width = (cell * state.length + gap * (state.length - 1)) + 'px';
    board.style.height = (cell * TRIES + gap * (TRIES - 1)) + 'px';
  }

  function flash(text, tone) {
    const el = $('flash');
    if (!el) return;
    el.textContent = text;
    el.dataset.show = '';
    if (tone) el.dataset.tone = tone;
    else delete el.dataset.tone;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      delete el.dataset.show;
    }, 1800);
  }

  function say(text) {
    const el = $('say');
    if (el) el.textContent = text;
  }

  function shake() {
    const row = document.querySelector('.row[data-r="' + state.rows.length + '"]');
    if (!row) return;
    row.dataset.bad = '';
    setTimeout(() => { if (row) delete row.dataset.bad; }, 400);
  }

  /* ---- playing ---------------------------------------------------------- */

  function type(ch) {
    if (!playing() || checking) return;
    if (state.typed.length >= state.length) return;
    if (!state.startedAt) {
      // The clock starts on the first letter, so reading the rules is free.
      state.startedAt = Date.now();
      tick();
    }
    state.typed += ch;
    render();
  }

  function back() {
    if (!playing() || checking) return;
    state.typed = state.typed.slice(0, -1);
    render();
  }

  function submit() {
    if (!playing() || checking) return;
    const word = state.typed;
    if (word.length !== state.length) {
      flash('Needs ' + state.length + ' letters', 'bad');
      shake();
      return;
    }
    if (SprintWords.has(word)) return accept(word);

    const cached = Dictionary.verdict(word);
    if (cached === 'yes') return accept(word);
    if (cached === 'no') return reject(word);

    // Not one of the words on the page. Ask, and say so, because the answer
    // is not instant. See _README.md on why the clock keeps running.
    checking = true;
    flash('Checking…');
    Dictionary.look(word).then(verdict => {
      checking = false;
      if (verdict === 'yes') accept(word);
      else if (verdict === 'no') reject(word);
      else {
        // Unanswered is not a no. It costs nothing and nothing is recorded.
        flash('Cannot check that one now', 'bad');
        shake();
      }
    });
  }

  function reject(word) {
    flash('Not a word: ' + word, 'bad');
    shake();
  }

  function accept(word) {
    const marks = mark(word, state.answer);
    state.rows.push({ word: word, marks: marks });
    state.typed = '';

    if (word === state.answer) finish(true);
    else if (state.rows.length >= TRIES) finish(false);
    else {
      render();
      say(word + ': ' + marks.join(', '));
    }
  }

  function finish(won) {
    // Stop the clock before anything is reckoned from it.
    state.elapsed = elapsed();
    state.startedAt = null;
    if (ticker) { clearInterval(ticker); ticker = null; }
    state.done = won ? 'won' : 'lost';
    render();

    const sum = reckon();
    let rank = -1;
    if (won) rank = record(sum);
    else fresh = null;
    save();

    showOver(won, sum, rank);
    say(won ? 'Solved in ' + sum.used + '. ' + asTime(sum.final)
      : 'Out of tries. The word was ' + state.answer + '.');
  }

  function showOver(won, sum, rank) {
    const title = $('over-title');
    if (title) title.textContent = won ? 'Solved' : 'Out of tries';
    const word = $('over-word');
    if (word) word.textContent = state.answer;
    const line = $('over-line');
    if (line) {
      line.textContent = won
        ? sum.used + (sum.used === 1 ? ' try' : ' tries') + ' of ' + TRIES
        : 'Six tries, no luck.';
    }
    const tag = $('best-tag');
    if (tag) tag.hidden = !(won && rank === 0);

    const sums = $('sums');
    if (sums) {
      sums.textContent = '';
      if (won) {
        sums.append(sumLine('On the clock', asTime(sum.raw)));
        sums.append(sumLine(sum.spare + (sum.spare === 1 ? ' try spare' : ' tries spare'),
          sum.spare ? '-' + (sum.spare * 10) + 's' : '0s', 'bonus'));
        sums.append(sumLine('Your time', asTime(sum.final), 'final'));
      } else {
        sums.append(sumLine('On the clock', asTime(sum.raw)));
        sums.append(sumLine('Not recorded', '—', 'final'));
      }
    }
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

  /* ---- the leaderboard -------------------------------------------------- */

  function renderBoard() {
    const head = $('board-head');
    if (head) {
      head.textContent = '';
      for (const n of SprintWords.LENGTHS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.length = String(n);
        b.textContent = n + ' letters';
        b.setAttribute('aria-pressed', n === boardLength ? 'true' : 'false');
        b.addEventListener('click', () => { boardLength = n; renderBoard(); });
        head.append(b);
      }
    }

    const body = $('board-body');
    if (!body) return;
    body.textContent = '';
    const list = scores[boardLength] || [];
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'score-empty';
      p.textContent = 'No times at ' + boardLength +
        ' letters yet. Solve one — and remember every try you do not use is ' +
        'ten seconds off.';
      body.append(p);
      return;
    }
    const ol = document.createElement('ol');
    ol.className = 'score-list';
    list.forEach((entry, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(i + 1);
      const time = document.createElement('span');
      time.textContent = asTime(entry.ms);
      const detail = document.createElement('span');
      detail.className = 'detail';
      const spare = Math.max(0, TRIES - entry.tries);
      detail.textContent = asTime(entry.raw) + ' · ' + entry.tries +
        (entry.tries === 1 ? ' try' : ' tries') + (spare ? ' · -' + spare * 10 + 's' : '');
      li.append(rank, time, detail);
      if (fresh && entry === fresh) li.dataset.fresh = '';
      ol.append(li);
    });
    body.append(ol);
  }

  /* ---- setting up ------------------------------------------------------- */

  function begin(length) {
    state = blankGame(length);
    fresh = null;
    checking = false;
    if (ticker) { clearInterval(ticker); ticker = null; }
    boardLength = length;
    save();
    render();
    const clock = $('clock');
    if (clock) clock.textContent = '0:00';
  }

  function buildKeys() {
    const keys = $('keys');
    if (!keys) return;
    keys.textContent = '';
    KEY_ROWS.forEach((letters, i) => {
      const row = document.createElement('div');
      row.className = 'row-keys';
      if (i === 2) row.append(wideKey('Enter', submit));
      for (const ch of letters) {
        const b = document.createElement('button');
        b.className = 'key';
        b.type = 'button';
        b.dataset.ch = ch;
        b.textContent = ch;
        b.addEventListener('click', () => type(ch));
        row.append(b);
      }
      if (i === 2) row.append(wideKey('Delete', back));
      keys.append(row);
    });
  }

  function wideKey(label, fn) {
    const b = document.createElement('button');
    b.className = 'key wide';
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function buildLengths() {
    const row = $('lengths');
    if (!row) return;
    row.textContent = '';
    for (const n of SprintWords.LENGTHS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.length = String(n);
      b.textContent = n + ' letters';
      b.addEventListener('click', () => {
        if (state.length === n && !state.rows.length && !state.startedAt) return;
        begin(n);
      });
      row.append(b);
    }
  }

  /* ---- wiring ----------------------------------------------------------- */

  const startLength = load();

  overSheet = Modal.create($('over'));
  boardSheet = Modal.create($('board-sheet'), {
    trigger: $('board-btn'),
    onOpen: renderBoard
  });
  Modal.create($('rules'), { trigger: $('rules-btn') });

  buildKeys();
  buildLengths();
  begin(startLength);

  on($('new-btn'), 'click', () => begin(state.length));
  on($('play-again'), 'click', () => {
    if (overSheet) overSheet.close();
    begin(state.length);
  });

  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if ((overSheet && overSheet.isOpen()) || (boardSheet && boardSheet.isOpen())) return;
    if (event.key === 'Enter') { submit(); event.preventDefault(); return; }
    if (event.key === 'Backspace') { back(); event.preventDefault(); return; }
    const ch = String(event.key).toLowerCase();
    if (/^[a-z]$/.test(ch)) { type(ch); event.preventDefault(); }
  });

  window.addEventListener('resize', sizeBoard);
  window.addEventListener('orientationchange', sizeBoard);
})();
