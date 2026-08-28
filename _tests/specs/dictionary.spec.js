const { test, expect } = require('@playwright/test');
const { clearState } = require('../helpers');

// Any page that loads js/lib/dictionary.js will do; Word Sprint is the one
// that also uses the cached verdicts synchronously.
const URL = '/games/word-sprint/';
const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/**';
const KEY = 'games.dictionary.v1';

/** Stands in for the dictionary, and counts what was asked. */
async function serve(page, opts) {
  const options = opts || {};
  await page.route(API, route => {
    if (options.abort) return route.abort('failed');
    const word = decodeURIComponent(route.request().url().split('/').pop());
    if (options.status) return route.fulfill({ status: options.status, body: '{}' });
    const known = options.known || [];
    if (known.indexOf(word) >= 0) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

function counter(page) {
  const seen = { n: 0 };
  page.on('request', req => {
    if (req.url().includes('dictionaryapi.dev')) seen.n++;
  });
  return seen;
}

const look = (page, word) => page.evaluate(w => window.Dictionary.look(w), word);

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the shared dictionary', () => {
  test('answers yes, no, and off', async ({ page }) => {
    await serve(page, { known: ['quixotic'] });
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(await look(page, 'zzzzqqq')).toBe('no');

    await page.unroute(API);
    await serve(page, { status: 503 });
    // 'off' is not a no: the service failed, the word was not judged.
    expect(await look(page, 'flummox')).toBe('off');
  });

  test('a verdict is asked for once, then remembered', async ({ page }) => {
    await serve(page, { known: ['quixotic'] });
    const seen = counter(page);

    expect(await look(page, 'quixotic')).toBe('yes');
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(await look(page, 'zzzzqqq')).toBe('no');
    expect(await look(page, 'zzzzqqq')).toBe('no');
    expect(seen.n).toBe(2);
  });

  test('what it was told survives a reload', async ({ page }) => {
    await serve(page, { known: ['quixotic'] });
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(await look(page, 'zzzzqqq')).toBe('no');

    await page.reload();
    await serve(page, { known: ['quixotic'] });
    const seen = counter(page);
    // Straight out of the cache, and answerable without waiting.
    expect(await page.evaluate(() => window.Dictionary.verdict('quixotic'))).toBe('yes');
    expect(await page.evaluate(() => window.Dictionary.verdict('zzzzqqq'))).toBe('no');
    expect(await look(page, 'quixotic')).toBe('yes');
    expect(seen.n).toBe(0);
  });

  test('an unanswered question is never remembered', async ({ page }) => {
    await serve(page, { status: 503 });
    const seen = counter(page);

    expect(await look(page, 'flummox')).toBe('off');
    expect(await page.evaluate(() => window.Dictionary.verdict('flummox'))).toBeNull();
    expect(await look(page, 'flummox')).toBe('off');
    // Asked again, because nothing was learned the first time.
    expect(seen.n).toBe(2);
  });

  test('offline it asks nothing at all', async ({ page, context }) => {
    await serve(page, { known: ['quixotic'] });
    const seen = counter(page);
    await context.setOffline(true);
    try {
      // Checked before fetching, not caught after: a request the browser
      // cannot complete is logged by the browser itself. See CLAUDE.md.
      expect(await look(page, 'quixotic')).toBe('off');
      expect(seen.n).toBe(0);
    } finally {
      await context.setOffline(false);
    }
  });

  test('a request that never answers still gets an answer', async ({ page }) => {
    /*
     * fetch has no timeout of its own, so without the deadline this promise
     * never settles — and a caller that gates its input on it is dead. Word
     * Sprint locked solid this way on a guess of "rater". 'off', because
     * nothing came back is not a verdict.
     */
    await page.route(API, () => { /* never answered */ });
    const deadline = await page.evaluate(() => window.Dictionary.DEADLINE);
    expect(deadline).toBeGreaterThan(0);

    const started = Date.now();
    expect(await look(page, 'flummox')).toBe('off');
    const took = Date.now() - started;
    expect(took, 'answered before the deadline').toBeGreaterThan(deadline - 1500);
    expect(took, 'waited well past the deadline').toBeLessThan(deadline + 6000);

    // Nothing was learned, so nothing was kept.
    expect(await page.evaluate(() => window.Dictionary.verdict('flummox'))).toBeNull();
  });

  test('it says why a word went unanswered', async ({ page }) => {
    /*
     * Every failure is the same 'off' to a game, deliberately — but from
     * outside that makes a rate limit, a dead host and a broken library
     * indistinguishable, which is exactly the question asked when both
     * games stop working at once.
     */
    const reason = () => page.evaluate(() => window.Dictionary.last());

    await serve(page, { status: 429 });
    expect(await look(page, 'flummox')).toBe('off');
    expect((await reason()).why).toBe('HTTP 429');

    await page.unroute(API);
    await serve(page, { abort: true });
    expect(await look(page, 'gubbins')).toBe('off');
    expect((await reason()).why).toBe('request refused');

    await page.unroute(API);
    await serve(page, { known: ['quixotic'] });
    expect(await look(page, 'quixotic')).toBe('yes');
    const ok = await reason();
    expect(ok.why).toBe('answered');
    expect(ok.word).toBe('quixotic');
    expect(ok.verdict).toBe('yes');
    expect(ok.ms).toBeGreaterThanOrEqual(0);

    // The cached answer is an answer, and says so rather than leaving the
    // last failure standing as if it were this word's.
    expect(await look(page, 'quixotic')).toBe('yes');
    expect((await reason()).why).toBe('already known');
  });

  test('an unreachable dictionary warns once and never errors', async ({ page }) => {
    // warn, not error: an unreachable dictionary is a degraded game, not a
    // broken page, and the shell specs count console errors.
    const lines = { warn: [], error: [] };
    page.on('console', msg => {
      if (lines[msg.type()]) lines[msg.type()].push(msg.text());
    });
    await serve(page, { status: 503 });
    expect(await look(page, 'flummox')).toBe('off');

    await expect.poll(() => lines.warn.length).toBe(1);
    expect(lines.warn[0]).toContain('flummox');
    expect(lines.warn[0]).toContain('HTTP 503');
    expect(lines.error).toEqual([]);
  });

  test('a verdict is not announced, however many are asked for', async ({ page }) => {
    // A game that asks about every word it is given would otherwise flood
    // the console with lines saying nothing went wrong.
    const noisy = [];
    page.on('console', msg => noisy.push(msg.text()));
    await serve(page, { known: ['quixotic', 'flummox'] });
    for (const w of ['quixotic', 'flummox', 'zzzzqqq', 'quixotic']) await look(page, w);
    expect(noisy).toEqual([]);
  });

  test('nonsense input never reaches the network', async ({ page }) => {
    await serve(page, { known: [] });
    const seen = counter(page);
    for (const bad of ['', '  ', 'two words', 'has-a-dash', '12345']) {
      expect(await look(page, bad)).toBe('no');
    }
    expect(seen.n).toBe(0);
  });

  test('the cache is stored under the shared key', async ({ page }) => {
    await serve(page, { known: ['quixotic'] });
    await look(page, 'quixotic');
    await look(page, 'zzzzqqq');

    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.yes.split(' ')).toContain('quixotic');
    expect(saved.no.split(' ')).toContain('zzzzqqq');
  });

  test('a corrupt cache is dropped, not carried', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, 'not json'), KEY);
    await page.reload();
    await serve(page, { known: ['quixotic'] });
    expect(await page.evaluate(() => window.Dictionary.size())).toBe(0);
    expect(await look(page, 'quixotic')).toBe('yes');
  });

  test('it stops growing at its cap', async ({ page }) => {
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
