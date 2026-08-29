const { test, expect } = require('@playwright/test');

/*
 * js/lib/words.js — the words the site ships, so that "is that a word?" is
 * usually answered without asking anyone. It renders nothing, so it runs at
 * one viewport. See _tests/README.md on @nodom.
 */
const URL = '/games/word-sprint/';
const has = (page, word) => page.evaluate(w => window.Words.has(w), word);

test.describe('the shipped word list', { tag: '@nodom' }, () => {
  test.beforeEach(async ({ page }) => {
    // Routed so the dictionary's load probe never reaches the real internet.
    for (const api of ['https://api.dictionaryapi.dev/**', 'https://freedictionaryapi.com/**']) {
      await page.route(api, route => route.fulfill({
        status: 200, contentType: 'application/json', body: '[{}]'
      }));
    }
    await page.goto(URL);
  });

  test('is wide enough to be worth having', async ({ page }) => {
    // Wide enough that a service is asked only about the unusual.
    expect(await page.evaluate(() => window.Words.size())).toBeGreaterThan(20000);
  });

  test('holds ordinary words of every length it claims', async ({ page }) => {
    const bounds = await page.evaluate(() => ({
      min: window.Words.MIN, max: window.Words.MAX
    }));
    expect(bounds.min).toBe(4);
    expect(bounds.max).toBeGreaterThanOrEqual(12);

    for (const word of ['juice', 'rater', 'gecko', 'anchor', 'breathe',
      'strength', 'dictionary', 'understanding']) {
      expect(await has(page, word), word + ' should be a word we ship').toBe(true);
    }
  });

  test('holds nothing that is not a word', async ({ page }) => {
    /*
     * The list this replaced was cut by frequency alone, with no dictionary
     * check at all, so it carried whatever tokenising the internet turns up:
     * brands, acronyms, first names, and runs of one letter. Every one of
     * these was in it. The fix is a case-sensitive dictionary test — the
     * lower-case form has to be an entry in its own right, which is what
     * keeps Doug and ESPN out while leaving `jack` and `march` in.
     */
    for (const junk of ['aaaa', 'espn', 'nasa', 'ipod', 'usda', 'xbox',
      'tokyo', 'obama', 'iphone', 'http', 'doug', 'judas']) {
      expect(await has(page, junk), junk + ' is not a word').toBe(false);
    }
  });

  test('common words that only look like names are kept', async ({ page }) => {
    // The cheap automatic test — "is the capitalised form also a word?" —
    // would take all of these, which is why it is not the test used.
    for (const word of ['jack', 'march', 'frank', 'robin', 'mason', 'polish']) {
      expect(await has(page, word), word + ' is an ordinary word').toBe(true);
    }
  });

  test('a miss is not a verdict, and nothing outside the range is claimed',
    async ({ page }) => {
      expect(await has(page, 'zzzzqqq')).toBe(false);
      // Below the floor and above the ceiling, whatever the word.
      expect(await has(page, 'cat')).toBe(false);
      expect(await has(page, 'a'.repeat(40))).toBe(false);
      // Rubbish in, false out, never a throw.
      for (const bad of ['', '  ', '12345', 'two words']) {
        expect(await has(page, bad)).toBe(false);
      }
    });

  test('the dictionary answers from it without asking anyone', async ({ page }) => {
    /*
     * The whole point: an ordinary word costs no request, no wait and no
     * connection — and does not depend on a service that has already gone
     * down once and taken both word games with it.
     */
    const asked = [];
    page.on('request', req => {
      if (/dictionaryapi/.test(req.url())) asked.push(req.url());
    });
    const before = asked.length;
    expect(await page.evaluate(() => window.Dictionary.look('juice'))).toBe('yes');
    const said = await page.evaluate(() => window.Dictionary.last());
    expect(said.why).toBe('on the shipped list');
    expect(asked.length, 'asked a service about a word we ship').toBe(before);
  });

  test('it still works with no network at all', async ({ page, context }) => {
    await context.setOffline(true);
    try {
      expect(await page.evaluate(() => window.Dictionary.look('juice'))).toBe('yes');
      // Offline is only a problem for words the list does not carry.
      expect(await page.evaluate(() => window.Dictionary.look('quixotical'))).toBe('off');
    } finally {
      await context.setOffline(false);
    }
  });
});
