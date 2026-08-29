/*
 * "Is that a word?", asked of a dictionary service, with the answers kept.
 *
 * Two games need this and they need it the same way, which is why it is here
 * rather than in either of them. Honeycomb: Spelling has no word list at all
 * and asks about everything; Word Sprint ships seventeen thousand words and
 * asks only about the ones it does not carry. Both want the same three-way
 * answer and both want yesterday's answers to still be free today.
 *
 * Ordinary words never leave the device: js/lib/words.js ships forty thousand
 * of them and is consulted first, so a service is asked only about what the
 * site does not already know.
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
  /*
   * v2, not v1: while a source was trusted on one control alone it could
   * answer yes to anything, and those verdicts were cached and persisted.
   * A wrong 'yes' cannot be told from a right one after the fact, so the old
   * key is abandoned rather than migrated. That costs a few lookups; keeping
   * it would cost wrong answers for ever.
   */
  const KEY = 'games.dictionary.v2';
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
  /*
   * Each source carries its own `reads`, because they do not answer the same
   * way and a shared rule gets one of them wrong. It turns a Response into
   * 'yes', 'no', or null for "that was not a verdict".
   */
  const SOURCES = [
    {
      id: 'api.dictionaryapi.dev',
      url: w => 'https://api.dictionaryapi.dev/api/v2/entries/en/' + w,
      // Says no with a 404. Anything else non-2xx is a bad day, not a no.
      reads: res => {
        if (res.ok) return Promise.resolve('yes');
        if (res.status === 404) return Promise.resolve('no');
        return Promise.resolve(null);
      }
    },
    {
      id: 'freedictionaryapi.com',
      url: w => 'https://freedictionaryapi.com/api/v1/entries/en/' + w,
      /*
       * This one answers 200 to EVERYTHING and puts the verdict in the body:
       * `entries` holds the senses for a word and is an empty array for
       * anything else. Reading the status alone makes every string a word,
       * which is exactly how `bigie` was accepted on the live site — the
       * endpoint was right and the interpretation was wrong.
       */
      reads: res => {
        if (res.status === 404) return Promise.resolve('no');
        if (!res.ok) return Promise.resolve(null);
        return res.json().then(
          body => (body && Array.isArray(body.entries) && body.entries.length
            ? 'yes' : 'no'),
          // A body we cannot read is not a verdict either way.
          () => null
        );
      }
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
   * And the other control, which matters just as much and was missing at
   * first. A source can be wrong in two directions:
   *
   *   404 to everything — a wrong path on a strict host — makes every real
   *   word "not a word", because 404 is how these services say no.
   *
   *   200 to everything — a wrong path on a host that serves a page rather
   *   than an error — makes every string a word. This one is worse: it is
   *   silent, and it accepts a player's typos. `bigie` was accepted this
   *   way, which is how the hole was found.
   *
   * Checking only that a real word comes back found catches the first and
   * sails straight past the second, so a source has to get BOTH controls
   * right: this string must come back not-found.
   */
  const PROBE_NONSENSE = 'zqxjvwkfp';

  /*
   * Health, and the growing wait after a failure. A service that is down
   * stays down for minutes, not milliseconds, so asking it again on the next
   * word buys nothing and costs the player a DEADLINE-long wait every time.
   * Each consecutive failure doubles the wait, and a success clears it.
   */
  const BACKOFF_MS = 30 * 1000;
  const BACKOFF_MAX_MS = 30 * 60 * 1000;
  /*
   * How many failures in a row before a source is set aside. Two, not one:
   * a single 503 or one timeout on a patchy connection is a stumble, and
   * parking a working service for half a minute over it would be worse than
   * asking again. A failed control word skips this — that is not a stumble,
   * it is a source that cannot do the job at all.
   */
  const STUMBLES = 2;
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
        fails: Number.isFinite(h.fails) && h.fails >= 0 ? Math.min(h.fails, 20) : 0,
        /*
         * The reason survives too. A source set aside stays that way through
         * its whole backoff without being asked again, so dropping this left
         * `health()` unable to say WHY a service was not being used for the
         * next half hour — which is the one question it exists to answer.
         */
        why: typeof h.why === 'string' ? h.why : undefined
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
    const parks = Math.max(0, fails - STUMBLES);
    return Math.min(BACKOFF_MAX_MS, BACKOFF_MS * Math.pow(2, parks));
  }

  /** Is this source worth contacting at all right now? */
  function due(src) {
    const h = well[src.id];
    if (h.state !== 'down') return true;
    return Date.now() - h.at >= waitFor(h.fails);
  }

  /*
   * Record how a source did. `hard` is for a failure that settles the
   * question on its own — a control word it could not answer — and sets it
   * aside at once; anything else has to happen STUMBLES times in a row.
   */
  function mark(src, good, why, hard) {
    const h = well[src.id];
    h.fails = good ? 0 : (hard ? Math.max(h.fails + 1, STUMBLES) : h.fails + 1);
    h.state = good ? 'up' : (h.fails >= STUMBLES ? 'down' : h.state);
    // An unproven source that stumbles is still unproven, not 'up'.
    if (!good && h.state === 'unknown' && h.fails < STUMBLES) h.state = 'unknown';
    h.at = Date.now();
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

  function disqualify(src, why) {
    mark(src, false, why, true);
    console.warn('Dictionary: not using ' + src.id + ' — ' + why + '; trying ' +
      'again in ' + Math.round(waitFor(well[src.id].fails) / 1000) + 's');
    return false;
  }

  /*
   * Put a source through both controls. It has to find a word every English
   * dictionary holds, AND refuse a string no dictionary could — see the note
   * on PROBE_NONSENSE for why either one alone proves nothing.
   */
  function test(src) {
    /*
     * Both controls at once, not one after the other. Asked in turn they
     * cost two deadlines per source and four across both — up to twenty-four
     * seconds before a game can even say the dictionary is down, which is
     * most of a minute of a player being told nothing. Asked together the
     * whole probe is one deadline. The cost is one extra request against a
     * source that was going to fail the first control anyway, which is
     * nothing next to the wait it saves.
     */
    return Promise.all([
      ask(src.url(PROBE_WORD)),
      ask(src.url(PROBE_NONSENSE))
    ]).then(([yes, no]) => {
      if (!yes.res) return disqualify(src, yes.why);
      if (!no.res) return disqualify(src, no.why);
      /*
       * Read through the source's own rule, so what is being tested is the
       * whole interpretation — endpoint, status handling and body shape
       * together — rather than a status code. A source whose shape we have
       * misunderstood fails here, which is the point.
       */
      return Promise.all([src.reads(yes.res), src.reads(no.res)])
        .then(([sawWord, sawJunk]) => {
          if (sawWord !== 'yes') {
            return disqualify(src, 'does not find "' + PROBE_WORD + '"' +
              (sawWord === null ? ' (HTTP ' + yes.res.status + ')' : ''));
          }
          // The dangerous one: a source that calls this a word would accept
          // every typo a player makes.
          if (sawJunk !== 'no') {
            return disqualify(src, 'calls "' + PROBE_NONSENSE + '" a word, so it ' +
              'is answering yes to anything');
          }
          if (!known.has(PROBE_WORD)) remember(PROBE_WORD, 'yes');
          mark(src, true, 'answered both controls');
          return true;
        });
    });
  }

  /*
   * Check the sources. Called on load by whichever game pulled this file in,
   * so a game knows whether word checking works before anybody types — and
   * costs nothing when the answer is already known: a source proved good
   * recently is trusted, and one inside its backoff is left alone.
   */
  let probing = null;

  function probe() {
    // Never two at once: a second would double the requests and race the
    // first to write the health record.
    if (probing) return probing;
    probing = runProbe().then(out => { probing = null; return out; },
      err => { probing = null; throw err; });
    return probing;
  }

  function runProbe() {
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
  function fromSources(list, i, w, started, tried) {
    if (i >= list.length) {
      /*
       * Each source's own reason, not just "it failed". The whole point of
       * saying anything here is to tell a rate limit from a dead host from a
       * wrong endpoint, and a summary that drops the detail answers none of
       * those questions.
       */
      const said = tried.length ? tried.join('; ') : 'no source was available';
      return Promise.resolve(note(w, 'off', said, started));
    }
    const src = list[i];
    const onwards = why => {
      mark(src, false, why);
      tried.push(src.id + ': ' + why);
      return fromSources(list, i + 1, w, started, tried);
    };

    return ask(src.url(w)).then(out => {
      if (!out.res) return onwards(out.why);
      // Through the source's own rule, the same one its controls passed.
      return src.reads(out.res).then(verdict => {
        if (verdict === 'yes' || verdict === 'no') {
          mark(src, true, 'answered');
          return note(w, remember(w, verdict), 'answered by ' + src.id, started);
        }
        return onwards('HTTP ' + out.res.status);
      });
    });
  }

  /** What every source is doing, for the line a failed lookup logs. */
  function census() {
    return SOURCES
      .map(src => src.id + ': ' + (well[src.id].why || well[src.id].state))
      .join('; ');
  }

  function look(word) {
    const started = Date.now();
    const w = String(word || '').toLowerCase();
    if (!valid(w)) return Promise.resolve('no');
    if (known.has(w)) {
      return Promise.resolve(note(w, known.get(w), 'already known', started));
    }

    /*
     * The shipped list, before anything goes near a network. This is what
     * makes an ordinary word free: no request, no wait, no connection, and
     * no dependence on a service that has already gone down once. It is a
     * yes-list only — a miss here is not a no, it is a question for someone
     * else — so nothing below changes except that it is asked far less.
     */
    if (window.Words && window.Words.has(w)) {
      return Promise.resolve(note(w, 'yes', 'on the shipped list', started));
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

    /*
     * Only sources already known good are asked, and a lookup NEVER probes.
     *
     * It used to. `SOURCES.filter(due)` put a source back in the running the
     * moment its backoff lapsed, and a source that was not currently 'up'
     * got probed inline — so with the first service dead and the second
     * working, every guess after each backoff window paid a full deadline
     * re-probing the dead one before reaching the live one. The player is
     * waiting on that; probing is slow and belongs out of band.
     *
     * With nothing known good there is nothing to wait for either: say so at
     * once, and start a probe in the background so the next word may fare
     * better. That probe respects the backoff, so a dead pair is not
     * hammered.
     */
    const answer = () => {
      const usable = SOURCES.filter(src => well[src.id].state === 'up');
      if (!usable.length) {
        probe();
        return Promise.resolve(note(w, 'off', census(), started));
      }
      return fromSources(usable, 0, w, started, []);
    };

    // A word asked while the load probe is still out waits for it rather
    // than starting a second one, which is where the duplicate work was.
    return probing ? probing.then(answer, answer) : answer();
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
    KEY, MAX, DEADLINE, SOURCES, PROBE_WORD, PROBE_NONSENSE, BACKOFF_MS };
})();
