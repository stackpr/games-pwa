// Honeycomb: Spelling — seven random letters, one of them compulsory,
// against a clock you choose. Guesses are checked against an online
// dictionary, so this one needs a connection. See _README.md for the rules,
// the scoring and the shape of the saved state.
(function () {
  const STORAGE_KEY = 'games.honeycomb-spelling.v1';
  // Each limit keeps its own top five: a minute and ten minutes are not the
  // same game, so their scores are not the same list.
  const LIMITS = [60, 120, 180, 300, 600];
  const DEFAULT_LIMIT = 180;
  const TOP_N = 10;
  const RING = ['n', 'ne', 'se', 's', 'sw', 'nw'];
  const FLASH_MS = 1100;
  const MIN_LENGTH = 4;
  // The dictionary answers inconsistently, so a question that went unanswered
  // is asked again rather than thrown away. Five tries in all, the waits
  // doubling: 1s, 2s, 4s, 8s. See _README.md.
  const RETRY_TRIES = 5;
  const RETRY_BASE_MS = 1000;
  // Once the clock has stopped the finish screen is waiting on the queue, so
  // the politeness delays collapse to one short gap — and the whole wait is
  // capped, because a dictionary that never answers must not strand a game.
  const SETTLE_GAP_MS = 400;
  const SETTLE_LIMIT_MS = 12000;

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
    freshBtn: pick('fresh', 'button'),
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
    netNote: pick('net-note', 'p'),
    again: pick('again', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  let state = load();
  // The game in play. Not persisted: a clock cannot be paused honestly
  // across a reload, so a reload ends the game rather than resuming it.
  let game = null;
  // 'idle' | 'playing' | 'settling' | 'over'. `settling` is the beat between
  // the clock stopping and the result appearing, while the queue drains.
  let phase = 'idle';
  let flashHandle = 0;
  let clock = null;
  let pumpHandle = 0;
  let settleHandle = 0;
  let settleUntil = 0;
  let ranOutOfTime = false;

  function load() {
    const p = Store.load(STORAGE_KEY) || {};
    const limit = LIMITS.indexOf(p.limit) !== -1 ? p.limit : DEFAULT_LIMIT;
    const scores = {};
    for (const seconds of LIMITS) {
      const raw = p.scores && Array.isArray(p.scores[seconds]) ? p.scores[seconds] : [];
      scores[seconds] = raw.filter(isEntry).sort(byScore).slice(0, TOP_N);
    }
    return { limit, scores };
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

  // Scrabble's letter values, which is the point: they are a scale players
  // already know, and every tile shows its own. See _README.md.
  const SCRABBLE = {
    a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1,
    m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8,
    y: 4, z: 10
  };
  const PANGRAM_BONUS = 10;

  // Letters + length + pangram. The length bonus squares how far past the
  // four-letter floor a word reaches, so it pays nothing at the floor and
  // carries a long word — which leaves each half a range where it decides
  // the score.
  function wordScore(word) {
    let letters = 0;
    for (const ch of word) letters += SCRABBLE[ch] || 0;
    // Clamped so a word below the floor is worth its letters and nothing
    // more. submit() rejects those before they get here, but squaring a
    // negative reach would quietly pay a bonus for being too short.
    const reach = Math.max(0, word.length - MIN_LENGTH);
    const pangram = new Set(word).size === HIVE_SIZE ? PANGRAM_BONUS : 0;
    return letters + reach * reach + pangram;
  }

  // --- the hive ------------------------------------------------------------

  // Every game draws its own seven letters. They are weighted by how often
  // each turns up in English rather than picked flat, because a flat draw
  // produces hives nothing can be spelled from. There is no `s` in the table
  // at all — see _README.md.
  const VOWELS = { a: 8.2, e: 12.7, i: 7.0, o: 7.5, u: 2.8 };
  const CONSONANTS = {
    b: 1.5, c: 2.8, d: 4.3, f: 2.2, g: 2.0, h: 6.1, j: 0.15, k: 0.77,
    l: 4.0, m: 2.4, n: 6.7, p: 1.9, q: 0.10, r: 6.0, t: 9.1, v: 1.0,
    w: 2.4, x: 0.15, y: 2.0, z: 0.07
  };
  // English frequency alone hands out t, n and r nearly every game and keeps
  // the letters that actually pay off the bench, so the consonant table is
  // flattened towards even before it is drawn from. The order is unchanged —
  // t is still the commonest — but a k, a v or a w turns up often enough to
  // build a scoring hive on. See _README.md.
  const FLATTEN = 0.75;
  for (const ch of Object.keys(CONSONANTS)) {
    CONSONANTS[ch] = Math.pow(CONSONANTS[ch], FLATTEN);
  }
  // These are spellable but they make a seat in the hive close to wasted, so
  // they stay below even their own low frequency — a q or a z should be a
  // rare novelty, not a letter you resent.
  const HARD = ['j', 'q', 'x', 'z'];
  const HARD_PENALTY = 0.4;
  for (const ch of HARD) CONSONANTS[ch] *= HARD_PENALTY;
  // A hive with one vowel is unplayable and one with four is thin on
  // consonants, so the count is drawn from this range and never outside it.
  const MIN_VOWELS = 2;
  const MAX_VOWELS = 3;
  const HIVE_SIZE = 7;

  // Draws `n` distinct letters, each one's chance being its share of what is
  // still in the pool.
  function draw(weights, n) {
    const pool = Object.keys(weights);
    const out = [];
    while (out.length < n && pool.length) {
      let total = 0;
      for (const ch of pool) total += weights[ch];
      let r = Math.random() * total;
      let i = 0;
      while (i < pool.length - 1 && (r -= weights[pool[i]]) > 0) i++;
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  function weightOf(ch) {
    return VOWELS[ch] || CONSONANTS[ch] || 1;
  }

  // A q with no u is a letter you cannot use, so a hive that draws one is
  // given the other. It costs a vowel seat rather than a consonant one, which
  // is what keeps the vowel count exactly where it was drawn — and u is a
  // vowel itself, so the hive is no poorer for it.
  function withU(vowels, consonants) {
    if (consonants.indexOf('q') === -1 || vowels.indexOf('u') !== -1) return vowels;
    return vowels.slice(0, -1).concat('u');
  }

  function newHive() {
    const count = MIN_VOWELS + Math.floor(Math.random() * (MAX_VOWELS - MIN_VOWELS + 1));
    const consonants = draw(CONSONANTS, HIVE_SIZE - count);
    const letters = withU(draw(VOWELS, count), consonants).concat(consonants);
    // The centre is weighted the same way, which is what keeps a q or a z off
    // the one letter every word has to contain.
    const weights = {};
    for (const ch of letters) weights[ch] = weightOf(ch);
    const centre = draw(weights, 1)[0];
    return { centre: centre, outer: letters.filter(ch => ch !== centre), letters: letters };
  }

  // The draw is pure, and the specs sample it many thousands of times to
  // check the vowel floor and the q/u rule — neither is reachable by playing
  // games at the rate a q turns up. See _README.md.
  // `score` is here for the same reason: the table is worth asserting on real
  // words, which random letters cannot be relied on to produce.
  window.HoneycombHive = {
    next: newHive,
    score: wordScore,
    knows: word => VOCAB.has(word)
  };

  // --- the dictionary ------------------------------------------------------

  // A guess is looked up at dictionaryapi.dev; there is no word list on the
  // page. Verdicts are kept for the session so a repeat costs no round trip,
  // and only definite answers are kept — see _README.md.
  const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
  const verdicts = new Map();

  // The site's own word list, which every page here already ships. It is a
  // yes-list only — a word missing from it proves nothing — but a hit costs
  // no request, no wait and no connection. Multi-word and hyphenated entries
  // are dropped: nothing with a space in it can be typed on a hive.
  const VOCAB = (function () {
    const known = new Set();
    const pool = window.Vocab ? Vocab.pool() : [];
    for (const entry of pool) {
      const word = String((entry && entry.word) || '').toLowerCase();
      if (/^[a-z]+$/.test(word)) known.add(word);
    }
    return known;
  })();

  // Resolves to 'yes', 'no', or 'off' for a question that went unanswered.
  // 'off' is not a no: it is never remembered and never counts against you.
  function lookUp(word) {
    // Our own vocabulary first, before anything goes near the network.
    if (VOCAB.has(word)) return Promise.resolve('yes');
    if (verdicts.has(word)) return Promise.resolve(verdicts.get(word));
    return fetch(API + encodeURIComponent(word))
      .then(res => {
        if (res.ok) return remember(word, 'yes');
        if (res.status === 404) return remember(word, 'no');
        return 'off';
      })
      .catch(() => 'off');
  }

  function remember(word, verdict) {
    verdicts.set(word, verdict);
    return verdict;
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
      const letter = !game ? ''
        : (pos === 'c' ? game.hive.centre : game.ring[RING.indexOf(pos)]) || '';
      // The letter lives in the attribute as well as the markup, so a tap
      // reads it without having to strip the value back off again.
      cell.dataset.letter = letter;

      const letterNode = cell.querySelector('.hex-letter');
      const valueNode = cell.querySelector('.hex-value');
      if (letterNode) {
        letterNode.textContent = letter;
        if (valueNode) valueNode.textContent = letter ? String(SCRABBLE[letter]) : '';
      } else {
        // Markup from the neighbouring release has no spans inside the hex.
        // A hive with no values beats a blank game — see CLAUDE.md.
        cell.textContent = letter;
      }

      const value = letter ? ', worth ' + SCRABBLE[letter] : '';
      cell.setAttribute('aria-label', letter
        ? letter + value + (pos === 'c' ? ', the middle letter' : '')
        : '');
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

  // `hold` keeps the line up indefinitely, which is what a word still being
  // looked up needs — it has no verdict to fade to yet.
  function flash(text, tone, hold) {
    clearFlash();
    el.flash.textContent = text;
    el.flash.dataset.tone = tone;
    el.flash.dataset.show = '';
    el.say.textContent = text;
    if (hold) return;
    flashHandle = setTimeout(() => {
      delete el.flash.dataset.show;
      flashHandle = 0;
      // A verdict is transient; a word still out is not, so the line goes
      // back to naming what is still waiting.
      if (pendingWords().length) showPending();
    }, FLASH_MS);
  }

  /**
   * Words still out at the dictionary, named and nothing more. Whether one is
   * on its first ask, its fourth, or has just run out of asks is a detail
   * about the network rather than about the game, so the line carries the
   * words alone and they simply stop being listed once they resolve. Several
   * at once are comma-separated, which is all the room there is.
   * See _README.md.
   */
  function pendingWords() {
    if (!game) return [];
    return Array.from(game.checking).concat(game.retry.map(entry => entry.word));
  }

  function showPending() {
    const words = pendingWords();
    if (words.length) flash(words.join(', '), 'wait', true);
    else clearFlash();
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

    if (word.length < MIN_LENGTH) return flash('Too short', 'bad');
    if (word.indexOf(game.hive.centre) === -1) {
      return flash('Missing ' + game.hive.centre.toUpperCase(), 'bad');
    }
    if (game.found.indexOf(word) !== -1) return flash('Already found', 'bad');
    // Neither a word already out nor one already queued goes out a second
    // time — one guess is one place in the queue, however often it is typed.
    if (game.checking.has(word) || queued(word)) return showPending();

    ask(word, 1);
  }

  /**
   * One trip to the dictionary. `tries` counts this attempt, so an answer
   * that never comes turns into a queued retry until the tries are spent.
   * `round` pins the game the guess belongs to: a verdict for a game that has
   * already been packed away goes nowhere.
   */
  function ask(word, tries) {
    const round = game;
    game.checking.add(word);
    paintFound();
    showPending();
    lookUp(word).then(verdict => {
      if (game !== round || phase === 'idle') return;
      game.checking.delete(word);
      if (verdict === 'yes') {
        if (game.found.indexOf(word) === -1) accept(word);
        else showPending();
      } else if (verdict === 'no') {
        flash('Not a word: ' + word, 'bad');
      } else if (tries < RETRY_TRIES) {
        queue(word, tries + 1);
      } else {
        // Five unanswered asks is not a verdict, but it is enough waiting.
        // The word simply stops being listed; why is the network's business.
        showPending();
      }
      paintFound();
      settle();
    });
  }

  function queued(word) {
    return !!game && game.retry.some(entry => entry.word === word);
  }

  function queue(word, tries) {
    if (queued(word) || game.found.indexOf(word) !== -1) return;
    game.retry.push({ word: word, tries: tries, due: Date.now() + delayFor(tries) });
    showPending();
    pump();
  }

  function unqueue(word) {
    if (game) game.retry = game.retry.filter(entry => entry.word !== word);
  }

  function delayFor(tries) {
    // The second ask waits a second, and each one after that doubles.
    return phase === 'settling' ? SETTLE_GAP_MS : RETRY_BASE_MS * Math.pow(2, tries - 2);
  }

  // One timer for the whole queue, always set for whichever word is due
  // soonest. A timer per word would be harder to cancel and easy to leak.
  function pump() {
    if (pumpHandle) { clearTimeout(pumpHandle); pumpHandle = 0; }
    if (!game || !game.retry.length) return;

    let next = game.retry[0];
    for (const entry of game.retry) if (entry.due < next.due) next = entry;
    pumpHandle = setTimeout(() => {
      pumpHandle = 0;
      if (!game || game.retry.indexOf(next) === -1) return pump();
      unqueue(next.word);
      ask(next.word, next.tries);
      pump();
    }, Math.max(0, next.due - Date.now()));
  }

  function outstanding() {
    return game ? game.checking.size + game.retry.length : 0;
  }

  function stopQueue() {
    if (pumpHandle) { clearTimeout(pumpHandle); pumpHandle = 0; }
    if (settleHandle) { clearTimeout(settleHandle); settleHandle = 0; }
  }

  function accept(word) {
    const points = wordScore(word);
    const pangram = new Set(word).size === HIVE_SIZE;
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

  /**
   * The strip under the hive: words still owed an answer at the head, then
   * the ones that scored. Putting the queue here rather than in a row of its
   * own is what keeps it visible without costing the hive any height — see
   * _README.md.
   */
  function paintFound() {
    el.found.textContent = '';
    const waiting = [];
    if (game) {
      for (const word of game.checking) waiting.push({ word: word, tries: 0 });
      for (const entry of game.retry) waiting.push({ word: entry.word, tries: entry.tries });
    }

    if (!game || (!game.found.length && !waiting.length)) {
      const empty = document.createElement('span');
      empty.className = 'found-empty';
      empty.textContent = 'Found words appear here';
      el.found.append(empty);
      return;
    }

    // How many times a word has been asked for is not shown: waiting is
    // waiting. See _README.md.
    for (const row of waiting) {
      const chip = document.createElement('span');
      chip.className = 'word';
      chip.dataset.waiting = '';
      chip.textContent = row.word;
      chip.setAttribute('aria-label', row.word + ', being checked');
      el.found.append(chip);
    }

    for (const word of game.found) {
      const chip = document.createElement('span');
      chip.className = 'word';
      chip.textContent = word;
      if (new Set(word).size === HIVE_SIZE) chip.dataset.pangram = '';
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
    paintNet();
    showIdleClock();
  }

  // Words are checked over the network, so being offline is worth saying
  // before the clock starts rather than once per rejected word.
  function paintNet() {
    el.netNote.hidden = navigator.onLine !== false;
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
    stopQueue();
    phase = 'idle';
    delete el.over.dataset.open;
    el.start.dataset.open = '';
    el.newBtn.textContent = 'New';
    el.freshBtn.hidden = true;
    el.scoresBtn.disabled = true;
    paintStartSheet();
  }

  function startGame() {
    stopQueue();
    // Reachable mid-game through New, so the clock in play is stopped rather
    // than left running to end a game that no longer exists.
    if (clock) clock.stop();
    const hive = newHive();
    game = {
      hive: hive,
      ring: shuffled(hive.outer),
      found: [],
      // Words out at the dictionary right now, so the same guess sent twice
      // in a row does not go out twice.
      checking: new Set(),
      // Words the dictionary would not answer for, waiting to be asked
      // again. One entry per word — see _README.md.
      retry: [],
      typed: '',
      score: 0,
      longest: ''
    };
    phase = 'playing';
    clearFlash();
    delete el.start.dataset.open;
    delete el.over.dataset.open;
    el.newBtn.textContent = 'Done';
    // Only while a game is on: a hive nothing can be spelled from is worth
    // trading in, and there is no cost to doing it — the score is nothing yet
    // if it is being traded in for a reason.
    el.freshBtn.hidden = false;
    el.scoresBtn.disabled = false;
    paintHive();
    paintTyped();
    paintStats();
    paintFound();

    clock = Timer.create(el.clock, { seconds: state.limit, onEnd: () => finish(true) });
    clock.start();
  }

  /**
   * The clock has stopped. Words already sent are still owed an answer, and
   * a word submitted in time should score even if the dictionary was slow —
   * so the result waits for the queue rather than abandoning it.
   */
  function finish(ranOut) {
    if (phase !== 'playing' || !game) return;
    // A word half-typed when the clock stops is still a word that was typed
    // in time, so Enter is optional on the last one: the letters on the line
    // go out as a guess and the settling wait covers the answer.
    if (ranOut && game.typed) submit();
    phase = 'settling';
    ranOutOfTime = ranOut;
    if (clock) clock.stop();
    showIdleClock();
    el.newBtn.textContent = 'Skip';
    el.freshBtn.hidden = true;
    el.scoresBtn.disabled = false;

    // Nothing is waiting to be polite to any more, so every queued retry is
    // pulled forward to the short gap.
    for (const entry of game.retry) entry.due = Date.now() + SETTLE_GAP_MS;
    settleUntil = Date.now() + SETTLE_LIMIT_MS;
    settleHandle = setTimeout(showOver, SETTLE_LIMIT_MS);
    pump();
    settle();
  }

  // Called every time the queue moves. It either shows the result or says
  // what is still holding it up.
  function settle() {
    if (phase !== 'settling') return;
    if (!outstanding() || Date.now() >= settleUntil) return showOver();
    showPending();
  }

  function showOver() {
    if (phase !== 'settling' || !game) return;
    phase = 'over';
    stopQueue();
    // Anything still unanswered is abandoned here rather than scored later.
    game.retry = [];
    paintFound();
    clearFlash();
    el.overTitle.textContent = ranOutOfTime ? 'Time!' : 'Done';
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
    // No answer key exists to count against, so the line reports what was
    // found and nothing else. See _README.md.
    el.overSub.textContent = clockText(state.limit) + ' — ' + game.found.length +
      (game.found.length === 1 ? ' word.' : ' words.');
    el.overBadge.hidden = freshAt !== 0;
    el.overBadge.textContent = freshAt === 0 ? 'Best yet at ' + clockText(state.limit) : '';
    el.overBoardFor.textContent = 'at ' + clockText(state.limit);
    paintBoard(el.overBoardRows, state.limit, freshAt);

    el.over.dataset.open = '';
    showIdleClock();
  }

  // --- wiring --------------------------------------------------------------

  /**
   * Taps are taken on pointerdown, not click. A click needs press *and*
   * release on the same element, so a finger that lands on one hex and
   * drifts a few pixels onto its neighbour before lifting produces no click
   * at all — which is exactly what a hive of touching hexagons invites, and
   * what made tapping feel unreliable. Pointerdown fires the moment the
   * finger lands. See _README.md.
   *
   * Only one of the two is ever bound, so a tap cannot register twice.
   */
  function tapHive(event) {
    const hex = event.target.closest ? event.target.closest('.hex') : null;
    if (!hex) return;
    // Left button or any touch/pen contact; a right-click is not a tap.
    if (event.button !== undefined && event.button !== 0) return;
    typeLetter(hex.dataset.letter || hex.textContent.trim());
  }
  on(el.hive, window.PointerEvent ? 'pointerdown' : 'click', tapHive);
  on(el.del, 'click', backspace);
  on(el.enter, 'click', submit);
  on(el.shuffle, 'click', () => {
    if (!game) return;
    game.ring = shuffled(game.ring);
    paintHive();
  });
  on(el.play, 'click', startGame);
  on(el.again, 'click', startGame);
  // Seven letters again, from the top. Deliberately no confirmation: it is
  // only reachable mid-game, where the alternative is a wasted clock.
  on(el.freshBtn, 'click', startGame);
  on(el.scoresBtn, 'click', openStart);
  on(el.newBtn, 'click', () => {
    if (phase === 'playing') finish(false);
    // Skip: a dictionary that has stopped answering should not be able to
    // hold the result hostage for the full wait.
    else if (phase === 'settling') showOver();
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

  window.addEventListener('online', paintNet);
  window.addEventListener('offline', paintNet);

  buildLimits();
  openStart();
  paintTyped();
})();
