const { test, expect } = require('@playwright/test');
const { clearState } = require('../helpers');

// Any page that loads js/lib/dictionary.js will do; Word Sprint is the one
// that also uses the cached verdicts synchronously.
const URL = '/games/word-sprint/';
const FIRST = 'https://api.dictionaryapi.dev/api/v2/entries/en/**';
const SECOND = 'https://freedictionaryapi.com/api/v1/entries/en/**';
const APIS = [FIRST, SECOND];
const KEY = 'games.dictionary.v1';
// The control word every source has to answer before it is trusted.
const PROBE = 'apple';

const wordOf = route => decodeURIComponent(route.request().url().split('/').pop());

/**
 * Stands in for one dictionary service.
 *
 * `probe` decides whether it answers the control word, which is what decides
 * whether the library will trust it with a real one — the two are separate on
 * purpose, because "the endpoint is wrong" and "the service is down" are
 * different failures and the library treats them differently.
 */
async function serve(page, api, opts) {
  const options = opts || {};
  await page.route(api, route => {
    const word = wordOf(route);
    if (word === PROBE) {
      if (options.probe === false) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
    }
    if (options.abort) return route.abort('failed');
    if (options.hang) return; // never answered
    if (options.status) return route.fulfill({ status: options.status, body: '{}' });
    const known = options.known || [];
    if (known.indexOf(word) >= 0) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

/** Both services, same behaviour. */
async function serveBoth(page, opts) {
  for (const api of APIS) await serve(page, api, opts);
}

async function unserve(page) {
  for (const api of APIS) await page.unroute(api);
}

/** Counts requests per service, ignoring the control word. */
function counter(page) {
  const seen = { first: 0, second: 0, probes: 0, get n() { return this.first + this.second; } };
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('dictionaryapi.dev') && !url.includes('freedictionaryapi.com')) return;
    if (url.endsWith('/' + PROBE)) { seen.probes++; return; }
    if (url.includes('freedictionaryapi.com')) seen.second++;
    else seen.first++;
  });
  return seen;
}

const look = (page, word) => page.evaluate(w => window.Dictionary.look(w), word);
const health = page => page.evaluate(() => window.Dictionary.health());
const reason = page => page.evaluate(() => window.Dictionary.last());

/** Loads the page with both services already mocked, as they must be. */
async function open(page, opts) {
  await serveBoth(page, opts);
  await page.goto(URL);
  await clearState(page);
  // The load probe settles before any test asks a question of its own.
  await expect.poll(() => page.evaluate(() => window.Dictionary.ready())).toBe(true);
}

test.describe('the shared dictionary', () => {
  test('answers yes, no, and off', async ({ page }) => {
    await open(page, { known: ['quixotic'] });
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(await look(page, 'zzzzqqq')).toBe('no');

    await unserve(page);
    await serveBoth(page, { status: 503 });
    // 'off' is not a no: the services failed, the word was not judged.
    expect(await look(page, 'flummox')).toBe('off');
  });

  test('a verdict is asked for once, then remembered', async ({ page }) => {
    await open(page, { known: ['quixotic'] });
    const seen = counter(page);

    expect(await look(page, 'quixotic')).toBe('yes');
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(await look(page, 'zzzzqqq')).toBe('no');
    expect(await look(page, 'zzzzqqq')).toBe('no');
    // Two words, one request each, and the first service answered both.
    expect(seen.first).toBe(2);
    expect(seen.second).toBe(0);
  });

  test('what it was told survives a reload', async ({ page }) => {
    await open(page, { known: ['quixotic'] });
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(await look(page, 'zzzzqqq')).toBe('no');

    await page.reload();
    const seen = counter(page);
    // Straight out of the cache, and answerable without waiting.
    expect(await page.evaluate(() => window.Dictionary.verdict('quixotic'))).toBe('yes');
    expect(await page.evaluate(() => window.Dictionary.verdict('zzzzqqq'))).toBe('no');
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(seen.n).toBe(0);
  });

  test('an unanswered question is never remembered', async ({ page }) => {
    await open(page, { status: 503 });
    const seen = counter(page);

    expect(await look(page, 'flummox')).toBe('off');
    expect(await page.evaluate(() => window.Dictionary.verdict('flummox'))).toBeNull();
    // Both services were tried before giving up on the word.
    expect(seen.first).toBe(1);
    expect(seen.second).toBe(1);

    /*
     * And both are asked again, because one failure is a stumble rather than
     * a dead service — parking a working dictionary for half a minute over a
     * single 503 would be worse than asking twice.
     */
    expect(await look(page, 'gubbins')).toBe('off');
    expect(seen.first).toBe(2);
    // The second failure in a row is what sets them aside.
    expect(await look(page, 'wossname')).toBe('off');
    expect(seen.first, 'kept asking a service that failed twice running').toBe(2);
    expect((await reason(page)).why).toBe('every source is in backoff');
  });

  test('offline it asks nothing at all', async ({ page, context }) => {
    await open(page, { known: ['quixotic'] });
    const seen = counter(page);
    await context.setOffline(true);
    try {
      // Checked before fetching, not caught after: a request the browser
      // cannot complete is logged by the browser itself. See CLAUDE.md.
      expect(await look(page, 'quixotic')).toBe('off');
      expect(seen.n).toBe(0);
      expect((await reason(page)).why).toBe('browser reports offline');
    } finally {
      await context.setOffline(false);
    }
  });

  test('nonsense input never reaches the network', async ({ page }) => {
    await open(page, { known: [] });
    const seen = counter(page);
    for (const bad of ['', '  ', 'two words', 'has-a-dash', '12345']) {
      expect(await look(page, bad)).toBe('no');
    }
    expect(seen.n).toBe(0);
  });

  test('the cache is stored under the shared key', async ({ page }) => {
    await open(page, { known: ['quixotic'] });
    await look(page, 'quixotic');
    await look(page, 'zzzzqqq');

    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.yes.split(' ')).toContain('quixotic');
    expect(saved.no.split(' ')).toContain('zzzzqqq');
  });

  test('a corrupt cache is dropped, not carried', async ({ page }) => {
    await open(page, { known: ['quixotic'] });
    await page.evaluate(key => localStorage.setItem(key, 'not json'), KEY);
    await page.reload();
    expect(await page.evaluate(() => window.Dictionary.size())).toBeLessThanOrEqual(1);
    expect(await look(page, 'quixotic')).toBe('yes');
  });

  test('it stops growing at its cap', async ({ page }) => {
    await open(page, {});
    const size = await page.evaluate(async () => {
      const cap = window.Dictionary.MAX;
      const line = [];
      for (let i = 0; i < cap + 40; i++) line.push('w' + i.toString(36).replace(/[^a-z]/g, 'q'));
      localStorage.setItem(window.Dictionary.KEY, JSON.stringify({ yes: line.join(' '), no: '' }));
      return cap;
    });
    await page.reload();
    expect(await page.evaluate(() => window.Dictionary.size()))
      .toBeLessThanOrEqual(size);
  });
});

test.describe('two services', () => {
  test('the second answers when the first will not', async ({ page }) => {
    await serve(page, FIRST, { status: 503 });
    await serve(page, SECOND, { known: ['quixotic'] });
    await page.goto(URL);
    await clearState(page);
    const seen = counter(page);

    // The first is asked, fails, and the question moves along rather than
    // becoming an 'off' — which is the whole point of having two.
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(seen.first).toBe(1);
    expect(seen.second).toBe(1);
    expect((await reason(page)).why).toContain('freedictionaryapi.com');

    const state = await health(page);
    expect(state['api.dictionaryapi.dev'].state).toBe('down');
    expect(state['freedictionaryapi.com'].state).toBe('up');
  });

  test('a service that fails its control word is never asked about a real one',
    async ({ page }) => {
      /*
       * The failure this prevents: a wrong endpoint answers 404 to
       * everything, and 404 is how these services say "not a word". An
       * unproven source would quietly start calling real words wrong. So it
       * has to answer for a word every English dictionary has before it is
       * allowed to answer for anything.
       */
      await serve(page, FIRST, { probe: false });
      await serve(page, SECOND, { known: ['quixotic'] });
      await page.goto(URL);
      await clearState(page);
      const seen = counter(page);

      expect(await look(page, 'quixotic')).toBe('yes');
      expect(seen.first, 'the unproven service was asked about a real word').toBe(0);
      expect(seen.second).toBe(1);
      expect((await health(page))['api.dictionaryapi.dev'].state).toBe('down');
    });

  test('with both down, a lookup is refused rather than waited on',
    async ({ page }) => {
      await serveBoth(page, { probe: false });
      await page.goto(URL);
      await clearState(page);
      await expect.poll(() => page.evaluate(() => window.Dictionary.ready())).toBe(false);

      const seen = counter(page);
      const started = Date.now();
      expect(await look(page, 'quixotic')).toBe('off');
      /*
       * The backoff is the point: asking again buys nothing and would cost
       * the player two deadlines of waiting for an answer already known.
       */
      expect(Date.now() - started, 'waited on a service known to be down')
        .toBeLessThan(1500);
      expect(seen.n).toBe(0);
      expect((await reason(page)).why).toBe('every source is in backoff');
    });

  test('the wait after a failure grows, and is not reset by a reload',
    async ({ page }) => {
      await serveBoth(page, { probe: false });
      await page.goto(URL);
      await clearState(page);
      await expect.poll(() => page.evaluate(() => window.Dictionary.ready())).toBe(false);

      const first = await health(page);
      // A failed control word is not a stumble, so it counts straight to the
      // threshold and the source is set aside immediately.
      expect(first['api.dictionaryapi.dev'].state).toBe('down');
      const parked = first['api.dictionaryapi.dev'].fails;
      expect(parked).toBeGreaterThanOrEqual(2);

      // Health outlives the page: a reload during an outage must not start
      // the backoff again and hand the player a fresh wait every load.
      await page.reload();
      const seen = counter(page);
      const after = await health(page);
      expect(after['api.dictionaryapi.dev'].state).toBe('down');
      expect(after['api.dictionaryapi.dev'].fails).toBe(parked);
      await page.waitForTimeout(600);
      expect(seen.probes, 'probed again while inside the backoff').toBe(0);
    });

  test('a service is trusted again once the wait has passed', async ({ page }) => {
    await serveBoth(page, { probe: false });
    await page.goto(URL);
    await clearState(page);
    await expect.poll(() => page.evaluate(() => window.Dictionary.ready())).toBe(false);

    // Wind the clock past the backoff by ageing the stored record, which is
    // what the library actually reads.
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      for (const id of Object.keys(saved.health || {})) saved.health[id].at = 1;
      localStorage.setItem(key, JSON.stringify(saved));
    }, KEY);

    await unserve(page);
    await serveBoth(page, { known: ['quixotic'] });
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.Dictionary.ready())).toBe(true);
    expect(await look(page, 'quixotic')).toBe('yes');
  });
});

test.describe('saying what went wrong', () => {
  test('a request that never answers still gets an answer', async ({ page }) => {
    /*
     * fetch has no timeout of its own, so without the deadline this promise
     * never settles — and a caller that gates its input on it is dead. Word
     * Sprint locked solid this way on a guess of "rater". 'off', because
     * nothing came back is not a verdict.
     */
    await serveBoth(page, { hang: true });
    await page.goto(URL);
    await clearState(page);
    const deadline = await page.evaluate(() => window.Dictionary.DEADLINE);
    expect(deadline).toBeGreaterThan(0);

    // Both services hang, so the probe has already marked them down; ageing
    // the record is what lets the lookup itself reach the deadline.
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      for (const id of Object.keys(saved.health || {})) saved.health[id].at = 1;
      localStorage.setItem(key, JSON.stringify(saved));
    }, KEY);
    await page.reload();

    const started = Date.now();
    expect(await look(page, 'flummox')).toBe('off');
    expect(Date.now() - started, 'answered before the deadline')
      .toBeGreaterThan(deadline - 1500);

    // Nothing was learned, so nothing was kept.
    expect(await page.evaluate(() => window.Dictionary.verdict('flummox'))).toBeNull();
  });

  test('it says why a word went unanswered', async ({ page }) => {
    /*
     * Every failure is the same 'off' to a game, deliberately — but from
     * outside that makes a rate limit, a dead host and a broken library
     * indistinguishable, which is exactly the question asked when both games
     * stop working at once.
     */
    await open(page, { status: 429 });
    expect(await look(page, 'flummox')).toBe('off');
    const said = (await reason(page)).why;
    expect(said, 'the summary drops the per-source reason').toContain('HTTP 429');
    expect(said).toContain('api.dictionaryapi.dev');
    expect(said).toContain('freedictionaryapi.com');
    expect((await health(page))['api.dictionaryapi.dev'].why).toBe('HTTP 429');

    await unserve(page);
    await serveBoth(page, { known: ['quixotic'] });
    // Both were marked down by the 429s, so age them back into contention.
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      for (const id of Object.keys(saved.health || {})) saved.health[id].at = 1;
      localStorage.setItem(key, JSON.stringify(saved));
    }, KEY);

    expect(await look(page, 'quixotic')).toBe('yes');
    const ok = await reason(page);
    expect(ok.why).toContain('answered by');
    expect(ok.word).toBe('quixotic');
    expect(ok.verdict).toBe('yes');
    expect(ok.ms).toBeGreaterThanOrEqual(0);

    // The cached answer is an answer, and says so rather than leaving the
    // last failure standing as if it were this word's.
    expect(await look(page, 'quixotic')).toBe('yes');
    expect((await reason(page)).why).toBe('already known');
  });

  test('an unreachable dictionary warns, and does not error', async ({ page }) => {
    const lines = [];
    page.on('console', msg => lines.push({ type: msg.type(), text: msg.text() }));
    await open(page, { status: 503 });
    expect(await look(page, 'flummox')).toBe('off');

    // Playwright's name for console.warn is 'warning'.
    await expect.poll(() => lines.filter(l => l.type === 'warning').length)
      .toBeGreaterThan(0);
    const said = lines.filter(l => l.type === 'warning').map(l => l.text).join('\n');
    expect(said).toContain('flummox');
    expect(said).toContain('503');

    /*
     * warn, not error: an unreachable dictionary is a degraded game, not a
     * broken page, and the shell specs count console errors. The browser
     * logs its own line for a non-2xx response and no catch suppresses it —
     * the same fact js/joke.js is built around, see CLAUDE.md — so what has
     * to hold is that the library adds nothing to it.
     */
    const ours = lines.filter(l =>
      l.type === 'error' && !/Failed to load resource/.test(l.text));
    expect(ours).toEqual([]);
  });

  test('a verdict is never announced, however many are asked for', async ({ page }) => {
    /*
     * A game that asks about every word it is given would otherwise flood
     * the console with lines saying nothing went wrong. Only our own lines
     * count here: the 404 that means 'no' is a real non-2xx response, and
     * the browser logs that itself whatever we do.
     */
    await open(page, { known: ['quixotic', 'flummox'] });
    const mine = [];
    page.on('console', msg => {
      if (msg.text().includes('Dictionary')) mine.push(msg.text());
    });
    for (const w of ['quixotic', 'flummox', 'zzzzqqq', 'quixotic']) await look(page, w);
    expect(mine).toEqual([]);
  });
});
