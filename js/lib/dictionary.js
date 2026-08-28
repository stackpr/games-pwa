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
 *   Dictionary.size()      -> how many verdicts are remembered
 *
 * look() always settles, and settles inside DEADLINE. A caller that gates
 * input on the answer is entitled to assume that; see the note on DEADLINE.
 *
 * 'off' is not a no. It means the question went unanswered — offline, a bad
 * gateway, a rate limit, no answer in time — and it is never remembered and
 * must never count
 * against a player. A game that treats 'off' as 'no' will call a real word
 * wrong on a bad connection, which is the worst thing either of these games
 * can do.
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
   * The request, with the deadline attached. Resolves to a Response, or to
   * null for every way of not getting one — refused, aborted, timed out.
   * It never rejects, so look() cannot either.
   */
  function ask(url) {
    const stop = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const expire = new Promise(resolve => {
      timer = setTimeout(() => {
        // Abort as well as resolve: without it the socket stays open and the
        // browser keeps waiting on an answer nobody is listening for.
        if (stop) stop.abort();
        resolve(null);
      }, DEADLINE);
    });
    const asked = fetch(url, stop ? { signal: stop.signal } : undefined)
      .catch(() => null);
    return Promise.race([asked, expire]).then(res => {
      clearTimeout(timer);
      return res;
    });
  }

  function look(word) {
    const w = String(word || '').toLowerCase();
    if (!valid(w)) return Promise.resolve('no');
    if (known.has(w)) return Promise.resolve(known.get(w));

    /*
     * Asked before the request, not caught after it: a request the browser
     * cannot complete is logged to the console by the browser itself, and no
     * catch suppresses that. Not asking is the only way an offline game
     * stays quiet. Same reasoning as js/joke.js — see CLAUDE.md.
     */
    if (navigator.onLine === false) return Promise.resolve('off');

    return ask(API + encodeURIComponent(w)).then(res => {
      // No response at all: failed, or took longer than we are prepared to
      // wait. Either way the word went unjudged, which is 'off', not 'no'.
      if (!res) return 'off';
      if (res.ok) return remember(w, 'yes');
      if (res.status === 404) return remember(w, 'no');
      // Anything else is the service having a bad day, not a verdict.
      return 'off';
    });
  }

  function size() {
    return known.size;
  }

  return { look, verdict, size, KEY, MAX, DEADLINE };
})();
