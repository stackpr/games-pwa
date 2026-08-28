/*
 * "Is that a word?", asked of api.dictionaryapi.dev, with the answers kept.
 *
 * Two games need this and they need it the same way, which is why it is here
 * rather than in either of them. Honeycomb: Spelling has no word list at all
 * and asks about everything; Word Sprint ships seventeen thousand words and
 * asks only about the ones it does not carry. Both want the same three-way
 * answer and both want yesterday's answers to still be free today.
 *
 *   Dictionary.look(word)  -> Promise of 'yes' | 'no' | 'off'
 *   Dictionary.verdict(w)  -> 'yes' | 'no' | null, from the cache alone
 *   Dictionary.last()      -> what happened to the last word asked about
 *   Dictionary.size()      -> how many verdicts are remembered
 *
 * look() always settles, and settles inside DEADLINE. A caller that gates
 * input on the answer is entitled to assume that; see the note on DEADLINE.
 *
 * 'off' is not a no. It means the question went unanswered — offline, a bad
 * gateway, a rate limit, no answer in time — and it is never remembered and
 * must never count against a player. A game that treats 'off' as 'no' will
 * call a real word wrong on a bad connection, which is the worst thing
 * either of these games can do.
 *
 * The cache is shared across games under one key, on the same grounds as the
 * recent-names list: whether "quixotic" is a word does not depend on which
 * game is asking. See CLAUDE.md.
 */
window.Dictionary = (function () {
  const KEY = 'games.dictionary.v1';
  const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
  // Enough to cover a lot of play, small enough that the write stays cheap.
  const MAX = 3000;
  /*
   * fetch has no timeout of its own: a request that hangs hangs for ever, and
   * so does a game waiting on the promise. That is not a hypothetical — Word
   * Sprint locked solid on a guess of "rater", input dead and the clock
   * stopped, because look() never settled. So the deadline lives here rather
   * than in each caller: whatever else it does, look() answers within this.
   * Long enough for a slow phone on a slow network; short enough to be a
   * pause rather than a hang.
   */
  const DEADLINE = 6000;

  // Insertion-ordered, which is what makes dropping the oldest one line.
  const known = new Map();

  function valid(word) {
    return typeof word === 'string' && /^[a-z]+$/.test(word);
  }

  (function restore() {
    const saved = window.Store ? Store.load(KEY) : null;
    if (!saved || typeof saved !== 'object') return;
    for (const verdict of ['yes', 'no']) {
      const line = saved[verdict];
      if (typeof line !== 'string' || !line) continue;
      for (const word of line.split(' ')) {
        if (valid(word) && known.size < MAX) known.set(word, verdict);
      }
    }
  })();

  function keep() {
    if (!window.Store) return;
    const yes = [];
    const no = [];
    for (const [word, verdict] of known) {
      (verdict === 'yes' ? yes : no).push(word);
    }
    Store.save(KEY, { yes: yes.join(' '), no: no.join(' ') });
  }

  function remember(word, verdict) {
    known.set(word, verdict);
    // Oldest out first. A verdict is cheap to fetch again and this keeps the
    // stored line from growing without end.
    while (known.size > MAX) known.delete(known.keys().next().value);
    keep();
    return verdict;
  }

  /** The cached answer, or null. Never touches the network. */
  function verdict(word) {
    const w = String(word || '').toLowerCase();
    return known.has(w) ? known.get(w) : null;
  }

  /*
   * What happened to the last word asked about. Every way of failing ends as
   * the same 'off' for the game — deliberately, since a player does not care
   * why — but from the outside that makes a rate limit, a dead host, a
   * browser refusing the request and a slow answer completely
   * indistinguishable, and there is then no way to tell "the service is
   * down" from "we broke the library". This is what tells them apart:
   *
   *   Dictionary.look('quixotic').then(() => console.log(Dictionary.last()))
   *
   * from the console of any page that loads this file.
   */
  let recent = null;

  function note(word, answer, why, started) {
    recent = { word: word, verdict: answer, why: why,
      ms: Date.now() - started, at: Date.now() };
    /*
     * One line, and only when nothing was learned — 'yes' and 'no' are the
     * service working, and a game that asks about every word would flood the
     * console. warn rather than error: an unreachable dictionary is a
     * degraded game, not a broken page, and the shell specs count errors.
     */
    if (answer === 'off') {
      console.warn('Dictionary: "' + word + '" unanswered — ' + why +
        ' after ' + recent.ms + 'ms');
    }
    return answer;
  }

  /** The last attempt, or null. For diagnosis; games do not read this. */
  function last() {
    return recent ? Object.assign({}, recent) : null;
  }

  /*
   * The request, with the deadline attached. Resolves to `{ res }` with the
   * Response, or `{ why }` naming how there wasn't one. It never rejects, so
   * look() cannot either.
   */
  function ask(url) {
    const stop = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const expire = new Promise(resolve => {
      timer = setTimeout(() => {
        // Abort as well as resolve: without it the socket stays open and the
        // browser keeps waiting on an answer nobody is listening for.
        if (stop) stop.abort();
        resolve({ why: 'timed out at ' + DEADLINE + 'ms' });
      }, DEADLINE);
    });
    const asked = fetch(url, stop ? { signal: stop.signal } : undefined).then(
      res => ({ res: res }),
      /*
       * A rejected fetch is the browser refusing to hand the answer over,
       * and the distinction it will not make in script is exactly the one
       * worth knowing: a CORS block, a DNS failure and a refused connection
       * all arrive here as the same opaque TypeError. The console line the
       * browser itself logs alongside this one has the detail.
       */
      err => ({ why: err && err.name === 'AbortError' ? 'aborted' : 'request refused' })
    );
    return Promise.race([asked, expire]).then(out => {
      clearTimeout(timer);
      return out;
    });
  }

  function look(word) {
    const started = Date.now();
    const w = String(word || '').toLowerCase();
    if (!valid(w)) return Promise.resolve('no');
    if (known.has(w)) {
      return Promise.resolve(note(w, known.get(w), 'already known', started));
    }

    /*
     * Asked before the request, not caught after it: a request the browser
     * cannot complete is logged to the console by the browser itself, and no
     * catch suppresses that. Not asking is the only way an offline game
     * stays quiet. Same reasoning as js/joke.js — see CLAUDE.md.
     */
    if (navigator.onLine === false) {
      return Promise.resolve(note(w, 'off', 'browser reports offline', started));
    }

    return ask(API + encodeURIComponent(w)).then(out => {
      // No response at all: refused, or slower than we are prepared to wait.
      // Either way the word went unjudged, which is 'off', not 'no'.
      if (!out.res) return note(w, 'off', out.why, started);
      if (out.res.ok) return note(w, remember(w, 'yes'), 'answered', started);
      if (out.res.status === 404) return note(w, remember(w, 'no'), 'answered', started);
      // Anything else is the service having a bad day, not a verdict.
      return note(w, 'off', 'HTTP ' + out.res.status, started);
    });
  }

  function size() {
    return known.size;
  }

  return { look, verdict, last, size, KEY, MAX, DEADLINE };
})();
