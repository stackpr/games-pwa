/*
 * "Is that a word?", asked of a dictionary service, with the answers kept.
 *
 * Two games need this and they need it the same way, which is why it is here
 * rather than in either of them. Honeycomb: Spelling has no word list at all
 * and asks about everything; Word Sprint ships seventeen thousand words and
 * asks only about the ones it does not carry. Both want the same three-way
 * answer and both want yesterday's answers to still be free today.
 *
 *   Dictionary.look(word)  -> Promise of 'yes' | 'no' | 'off'
 *   Dictionary.verdict(w)  -> 'yes' | 'no' | null, from the cache alone
 *   Dictionary.ready()     -> is any source known to be answering?
 *   Dictionary.probe()     -> check the sources now; resolves to ready()
 *   Dictionary.health()    -> per-source state, for diagnosis
 *   Dictionary.last()      -> what happened to the last word asked about
 *   Dictionary.size()      -> how many verdicts are remembered
 *
 * look() always settles, and settles inside DEADLINE per source. A caller
 * that gates input on the answer is entitled to assume that.
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

  /*
   * Two services, tried in order, because one of them being down should not
   * be the same as the dictionary being down — which is exactly what
   * happened: api.dictionaryapi.dev stopped answering entirely (connections
   * opened, nothing came back, every lookup timing out) and took the word
   * checking in both games with it. See CLAUDE.md for the standing terms
   * every network dependency here is held to.
   */
  const SOURCES = [
    {
      id: 'dictionaryapi.dev',
      url: w => 'https://api.dictionaryapi.dev/api/v2/entries/en/' + w
    },
    {
      id: 'freedictionaryapi.com',
      url: w => 'https://freedictionaryapi.com/api/v1/entries/en/' + w
    }
  ];

  /*
   * A source has to prove itself before it is allowed to answer, and this is
   * the word it proves itself with. Every English dictionary has "apple", so
   * a 404 for it does not mean the service is missing a word — it means the
   * URL is not the endpoint we think it is.
   *
   * That distinction is the whole point. A wrong path answers 404 to
   * everything, and a 404 is how these services say "not a word": an
   * unverified source would quietly start calling real words wrong, which is
   * the one failure this library exists to prevent. So an unproven source is
   * never asked about a real word, and a wrong URL costs a disabled source
   * rather than a poisoned verdict.
   */
  const PROBE_WORD = 'apple';

  /*
   * Health, and the growing wait after a failure. A service that is down
   * stays down for minutes, not milliseconds, so asking it again on the next
   * word buys nothing and costs the player a DEADLINE-long wait every time.
   * Each consecutive failure doubles the wait, and a success clears it.
   */
  const BACKOFF_MS = 30 * 1000;
  const BACKOFF_MAX_MS = 30 * 60 * 1000;
  // How long a clean bill of health is taken on trust before a fresh probe.
  const FRESH_MS = 10 * 60 * 1000;

  // Insertion-ordered, which is what makes dropping the oldest one line.
  const known = new Map();
  // id -> { state: 'unknown' | 'up' | 'down', at, fails }
  const well = {};
  for (const src of SOURCES) well[src.id] = { state: 'unknown', at: 0, fails: 0 };

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
    /*
     * Health outlives the page on purpose: a reload during an outage would
     * otherwise start the backoff again from nothing and hand the player a
     * fresh wait on every load. Anything unrecognised is simply left as
     * 'unknown', which costs one probe.
     */
    const saw = saved.health;
    if (!saw || typeof saw !== 'object') return;
    for (const src of SOURCES) {
      const h = saw[src.id];
      if (!h || (h.state !== 'up' && h.state !== 'down')) continue;
      well[src.id] = {
        state: h.state,
        at: Number.isFinite(h.at) ? h.at : 0,
        fails: Number.isFinite(h.fails) && h.fails >= 0 ? Math.min(h.fails, 20) : 0
      };
    }
  })();

  function keep() {
    if (!window.Store) return;
    const yes = [];
    const no = [];
    for (const [word, verdict] of known) {
      (verdict === 'yes' ? yes : no).push(word);
    }
    Store.save(KEY, { yes: yes.join(' '), no: no.join(' '), health: well });
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

  /* ---- health ----------------------------------------------------------- */

  function waitFor(fails) {
    return Math.min(BACKOFF_MAX_MS, BACKOFF_MS * Math.pow(2, Math.max(0, fails - 1)));
  }

  /** Is this source worth contacting at all right now? */
  function due(src) {
    const h = well[src.id];
    if (h.state !== 'down') return true;
    return Date.now() - h.at >= waitFor(h.fails);
  }

  function mark(src, good, why) {
    const h = well[src.id];
    h.state = good ? 'up' : 'down';
    h.at = Date.now();
    h.fails = good ? 0 : h.fails + 1;
    h.why = why;
    keep();
    return h.state;
  }

  /** True once any source has answered something. */
  function ready() {
    return SOURCES.some(src => well[src.id].state === 'up');
  }

  function health() {
    const out = {};
    for (const src of SOURCES) out[src.id] = Object.assign({}, well[src.id]);
    return out;
  }

  /*
   * Ask one source for the control word and record what came back. Only a
   * 2xx counts: a 404 here is a wrong endpoint, not a missing word.
   */
  function test(src) {
    return ask(src.url(PROBE_WORD)).then(out => {
      const good = Boolean(out.res && out.res.ok);
      const why = out.res ? 'HTTP ' + out.res.status : out.why;
      if (good && !known.has(PROBE_WORD)) remember(PROBE_WORD, 'yes');
      mark(src, good, why);
      if (!good) {
        console.warn('Dictionary: ' + src.id + ' did not answer for "' +
          PROBE_WORD + '" — ' + why + '; not using it for ' +
          Math.round(waitFor(well[src.id].fails) / 1000) + 's');
      }
      return good;
    });
  }

  /*
   * Check the sources. Called on load by whichever game pulled this file in,
   * so a game knows whether word checking works before anybody types — and
   * costs nothing when the answer is already known: a source proved good
   * recently is trusted, and one inside its backoff is left alone.
   */
  function probe() {
    return Promise.all(SOURCES.map(src => {
      const h = well[src.id];
      if (h.state === 'up' && Date.now() - h.at < FRESH_MS) return true;
      if (!due(src)) return false;
      return test(src);
    })).then(() => ready());
  }

  /* ---- asking ----------------------------------------------------------- */

  /*
   * What happened to the last word asked about. Every way of failing ends as
   * the same 'off' for the game — deliberately, since a player does not care
   * why — but from the outside that makes a rate limit, a dead host, a
   * browser refusing the request and a slow answer completely
   * indistinguishable, and there is then no way to tell "the service is
   * down" from "we broke the library". This is what tells them apart:
   *
   *   Dictionary.look('quixotic').then(() => console.log(Dictionary.last()))
   *   Dictionary.health()
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

  /*
   * Walk the sources in order until one gives a verdict. A source that fails
   * here is marked down — so the next word skips it rather than paying its
   * deadline again — and the next source gets the question.
   */
  function fromSources(list, i, w, started) {
    if (i >= list.length) {
      return Promise.resolve(note(w, 'off', 'no source answered', started));
    }
    const src = list[i];
    const proven = well[src.id].state === 'up'
      ? Promise.resolve(true)
      : test(src);

    return proven.then(good => {
      if (!good) return fromSources(list, i + 1, w, started);
      return ask(src.url(w)).then(out => {
        if (out.res && out.res.ok) {
          mark(src, true, 'answered');
          return note(w, remember(w, 'yes'), 'answered by ' + src.id, started);
        }
        if (out.res && out.res.status === 404) {
          // Trustworthy only because the source passed its control word.
          mark(src, true, 'answered');
          return note(w, remember(w, 'no'), 'answered by ' + src.id, started);
        }
        mark(src, false, out.res ? 'HTTP ' + out.res.status : out.why);
        return fromSources(list, i + 1, w, started);
      });
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

    const worth = SOURCES.filter(due);
    if (!worth.length) {
      /*
       * Every source is inside its backoff. Asking anyway would cost the
       * player a wait whose answer is already known, which is the whole
       * reason the backoff exists — so this returns at once rather than
       * after two deadlines.
       */
      return Promise.resolve(note(w, 'off', 'every source is in backoff', started));
    }
    return fromSources(worth, 0, w, started);
  }

  function size() {
    return known.size;
  }

  /*
   * Probing on load is the point — a game should know whether checking works
   * before anyone types, not on the first guess that needs it. Deferred past
   * load so it never competes with rendering the game.
   */
  function probeSoon() {
    if (document.readyState === 'complete') setTimeout(probe, 0);
    else window.addEventListener('load', () => setTimeout(probe, 0));
  }
  probeSoon();

  return { look, verdict, ready, probe, health, last, size,
    KEY, MAX, DEADLINE, SOURCES, PROBE_WORD, BACKOFF_MS };
})();
