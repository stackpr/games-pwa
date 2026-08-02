const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/honeycomb-spelling/';
const KEY = 'games.honeycomb-spelling.v1';
const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/*';
const VOWELS = 'aeiou';

/**
 * Stands in for dictionaryapi.dev. Every word comes back 200 unless it is in
 * `reject`, which comes back 404 the way the real API answers for a word it
 * does not hold.
 *
 * The suite never calls the real thing. It is a third party, so a test that
 * depended on it would fail for reasons that have nothing to do with this
 * game, and would need a network to run at all.
 */
async function dictionary(page, opts = {}) {
  const reject = new Set(opts.reject || []);
  await page.route(API, async route => {
    if (opts.abort) return route.abort('failed');
    if (opts.status) {
      return route.fulfill({ status: opts.status, contentType: 'application/json', body: '{}' });
    }
    const word = decodeURIComponent(route.request().url().split('/').pop());
    const found = !reject.has(word);
    await route.fulfill({
      status: found ? 200 : 404,
      contentType: 'application/json',
      body: found
        ? JSON.stringify([{ word, meanings: [] }])
        : JSON.stringify({ title: 'No Definitions Found' }),
    });
  });
}

/** Seeds saved state and reloads. */
async function seed(page, { limit, scores } = {}) {
  await page.evaluate(([key, lim, sc]) => {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (lim) saved.limit = lim;
    if (sc) saved.scores = sc;
    localStorage.setItem(key, JSON.stringify(saved));
  }, [KEY, limit, scores]);
  await page.reload();
}

async function play(page, opts = {}) {
  await seed(page, opts);
  await dictionary(page, opts.dict);
  await page.locator('#play').click();
  await expect(page.locator('#start')).not.toHaveAttribute('data-open', '');
}

/**
 * The hive on the board. Letters are drawn fresh every game, so a test that
 * needs a spellable word builds one out of these rather than naming one:
 * `centre.repeat(4)` is a legal guess in every hive there is, and the fake
 * dictionary is what decides whether it counts.
 */
function hive(page) {
  return page.evaluate(() => ({
    centre: document.querySelector('.hex[data-pos="c"]').textContent,
    letters: [...document.querySelectorAll('.hex')].map(e => e.textContent),
  }));
}

async function guess(page, word) {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
}

const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the start sheet', () => {
  test('opens first, offering five clocks with three minutes selected', async ({ page }) => {
    await expect(page.locator('#start')).toHaveAttribute('data-open', '');
    await expect(page.locator('.limit')).toHaveText(['1:00', '2:00', '3:00', '5:00', '10:00']);
    await expect(page.locator('.limit[aria-pressed="true"]')).toHaveText('3:00');
    await expect(page.locator('#clock')).toHaveText('3:00');
  });

  test('an unplayed limit says so rather than showing an empty table', async ({ page }) => {
    await expect(page.locator('#board-empty')).toBeVisible();
    await expect(page.locator('#board')).toBeHidden();
    await expect(page.locator('#board-rows tr')).toHaveCount(0);
  });

  test('picking a limit sticks, and survives a reload', async ({ page }) => {
    await page.locator('.limit', { hasText: '10:00' }).click();
    await expect(page.locator('#clock')).toHaveText('10:00');
    await expect(page.locator('#board-for')).toHaveText('at 10:00');
    expect((await saved(page)).limit).toBe(600);

    await page.reload();
    await expect(page.locator('.limit[aria-pressed="true"]')).toHaveText('10:00');
    await expect(page.locator('#clock')).toHaveText('10:00');
  });

  test('says nothing about the network while there is one', async ({ page }) => {
    await expect(page.locator('#net-note')).toBeHidden();
  });

  test('warns before the clock starts when the browser is offline', async ({ page, context }) => {
    await context.setOffline(true);
    try {
      // The note follows the browser's own signal, so it can appear without a
      // reload — a phone that loses signal on the start sheet still gets told.
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await expect(page.locator('#net-note')).toBeVisible();
      await expect(page.locator('#net-note')).toContainText('online dictionary');
    } finally {
      await context.setOffline(false);
    }
  });
});

test.describe('the letters', () => {
  test('seven of them, all different, with the compulsory one in the middle', async ({ page }) => {
    await play(page);
    await expect(page.locator('.hex')).toHaveCount(7);
    const { centre, letters } = await hive(page);
    expect(new Set(letters).size).toBe(7);
    expect(letters).toContain(centre);
    await expect(page.locator('.hex[data-pos="c"]')).toHaveText(centre);
  });

  test('a fresh draw every game, holding to the rules each time', async ({ page }) => {
    await play(page);
    const seen = [];
    for (let i = 0; i < 30; i++) {
      seen.push(await hive(page));
      await page.locator('#new').click();
      await page.locator('#again').click();
    }

    for (const { centre, letters } of seen) {
      const set = letters.join('');
      expect(letters, set).toHaveLength(7);
      expect(new Set(letters).size, set).toBe(7);
      expect(letters, set).toContain(centre);
      // No s, so the answers cannot be mostly free plurals — the same rule
      // the fixed hives were built under.
      expect(set).not.toContain('s');
      // The point of the weighting: at least two vowels, never more than
      // three, so a hive is something you can actually spell from.
      const vowels = letters.filter(ch => VOWELS.includes(ch));
      expect(vowels.length, set).toBeGreaterThanOrEqual(2);
      expect(vowels.length, set).toBeLessThanOrEqual(3);
    }

    // Random, not fixed: thirty draws should not keep landing on one hive.
    const distinct = new Set(seen.map(h => h.letters.slice().sort().join('')));
    expect(distinct.size).toBeGreaterThan(20);
  });

  test('a q never arrives without its u', async ({ page }) => {
    await play(page);
    // A q turns up in well under one game in a hundred, so this samples the
    // draw directly rather than dealing hives until one shows up.
    const stats = await page.evaluate(() => {
      const bad = [];
      let withQ = 0;
      for (let i = 0; i < 20000; i++) {
        const letters = window.HoneycombHive.next().letters;
        if (letters.indexOf('q') === -1) continue;
        withQ++;
        if (letters.indexOf('u') === -1) bad.push(letters.join(''));
      }
      return { withQ, bad: bad.slice(0, 5) };
    });
    expect(stats.bad).toEqual([]);
    // If a q never came up the assertion above proved nothing.
    expect(stats.withQ).toBeGreaterThan(0);
  });

  test('the awkward letters come up rarely, and the common ones often', async ({ page }) => {
    await play(page);
    const rate = await page.evaluate(() => {
      const runs = 20000;
      const count = {};
      for (let i = 0; i < runs; i++) {
        for (const ch of window.HoneycombHive.next().letters) {
          count[ch] = (count[ch] || 0) + 1;
        }
      }
      const out = {};
      for (const ch of 'abcdefghijklmnopqrstuvwxyz') out[ch] = (count[ch] || 0) / runs;
      return out;
    });

    // s is not in the tables at all, so it cannot be drawn.
    expect(rate.s).toBe(0);
    // The four hard letters sit below their own low frequency: fewer than one
    // hive in fifty carries any one of them.
    for (const ch of ['j', 'q', 'x', 'z']) {
      expect(rate[ch], ch + ' should be rare').toBeLessThan(0.02);
    }
    // And the everyday letters are genuinely everyday, which is the point of
    // weighting the draw at all.
    for (const ch of ['e', 't', 'a', 'n', 'r']) {
      expect(rate[ch], ch + ' should be common').toBeGreaterThan(0.15);
    }
    // Every hard letter is rarer than every common one, not merely rare.
    expect(Math.max(rate.j, rate.q, rate.x, rate.z))
      .toBeLessThan(Math.min(rate.e, rate.t, rate.a, rate.n, rate.r));
  });

  test('tapping cells builds the word and Delete takes a letter back', async ({ page }) => {
    await play(page);
    const { letters } = await hive(page);
    for (const ch of letters.slice(0, 4)) {
      await page.locator('.hex', { hasText: new RegExp('^' + ch + '$') }).click();
    }
    await expect(page.locator('#typed')).toHaveText(letters.slice(0, 4).join(''));
    await page.locator('#delete').click();
    await expect(page.locator('#typed')).toHaveText(letters.slice(0, 3).join(''));
  });

  test('the middle letter is marked wherever it lands in the word', async ({ page }) => {
    await play(page);
    const { centre, letters } = await hive(page);
    const other = letters.find(ch => ch !== centre);
    await page.keyboard.type(other + centre + other + centre);
    await expect(page.locator('#typed b')).toHaveCount(2);
    await expect(page.locator('#typed b').first()).toHaveText(centre);
  });

  test('shuffle rearranges the outer letters and leaves the middle alone', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const outer = () => page.locator('.hex:not([data-pos="c"])')
      .evaluateAll(els => els.map(e => e.textContent));
    const before = await outer();
    // A shuffle can land back where it started, so try until it moves.
    let after = before;
    for (let i = 0; i < 12 && after.join('') === before.join(''); i++) {
      await page.locator('#shuffle').click();
      after = await outer();
    }
    expect(after.join('')).not.toBe(before.join(''));
    expect(after.slice().sort()).toEqual(before.slice().sort());
    await expect(page.locator('.hex[data-pos="c"]')).toHaveText(centre);
  });
});

test.describe('scoring a word', () => {
  test('four letters is one point, longer is a point a letter', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await guess(page, centre.repeat(4));
    await expect(page.locator('#score')).toHaveText('1');
    await expect(page.locator('#flash')).toHaveText('+1');

    await guess(page, centre.repeat(5));
    await expect(page.locator('#score')).toHaveText('6');
    await expect(page.locator('#flash')).toHaveText('+5');
    await expect(page.locator('#count')).toHaveText('2');
  });

  test('a pangram is worth its letters plus seven', async ({ page }) => {
    await play(page);
    const { letters } = await hive(page);
    const pangram = letters.join('');
    await guess(page, pangram);
    await expect(page.locator('#flash')).toHaveText('Pangram! +14');
    await expect(page.locator('#score')).toHaveText('14');
    await expect(page.locator('#found .word[data-pangram]')).toHaveText(pangram);
  });

  test('found words stack up newest first', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await guess(page, centre.repeat(4));
    await expect(page.locator('#count')).toHaveText('1');
    await guess(page, centre.repeat(5));
    await expect(page.locator('#found .word')).toHaveText([centre.repeat(5), centre.repeat(4)]);
  });

  test('the verdict makes way for the next word', async ({ page }) => {
    await play(page);
    const { centre, letters } = await hive(page);
    await guess(page, centre.repeat(4));
    await expect(page.locator('#flash')).toHaveText('+1');
    await page.keyboard.type(letters[0]);
    // Both share one line, so the flash has to go before the word arrives.
    await expect(page.locator('#flash')).not.toHaveAttribute('data-show', '');
    await expect(page.locator('#typed')).toHaveText(letters[0]);
  });

  test('the word clears the moment it is sent, not when the answer lands', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await guess(page, centre.repeat(3));
    await expect(page.locator('#typed')).toHaveText('');
    await guess(page, centre.repeat(4));
    await expect(page.locator('#typed')).toHaveText('');
  });
});

test.describe('the dictionary', () => {
  test('a word the dictionary does not have scores nothing', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);
    await page.unroute(API);
    await dictionary(page, { reject: [word] });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText('Not a word');
    await expect(page.locator('#flash')).toHaveAttribute('data-tone', 'bad');
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#count')).toHaveText('0');
  });

  test('the word being checked is held on screen until the answer lands', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);

    let release;
    const held = new Promise(r => { release = r; });
    await page.route(API, async route => {
      await held;
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([{ word }]),
      });
    });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText('Checking ' + word);
    await expect(page.locator('#flash')).toHaveAttribute('data-tone', 'wait');
    // Nothing is scored on the strength of the guess alone.
    await expect(page.locator('#score')).toHaveText('0');

    release();
    await expect(page.locator('#flash')).toHaveText('+1');
    await expect(page.locator('#score')).toHaveText('1');
  });

  test('the same word sent twice over only asks once', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);

    let release;
    const held = new Promise(r => { release = r; });
    let asked = 0;
    await page.route(API, async route => {
      asked++;
      await held;
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([{ word }]),
      });
    });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText('Checking ' + word);
    await guess(page, word);
    release();
    await expect(page.locator('#score')).toHaveText('1');
    expect(asked).toBe(1);
    await expect(page.locator('#found .word')).toHaveCount(1);
  });

  test('a verdict already given is not asked about twice', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);
    await page.unroute(API);
    await dictionary(page, { reject: [word] });
    let asked = 0;
    page.on('request', req => { if (req.url().includes('dictionaryapi.dev')) asked++; });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText('Not a word');

    // Clear the line, so the second verdict appearing is the second verdict
    // and not the first one still sitting there.
    await page.keyboard.press('Backspace');
    await expect(page.locator('#flash')).not.toHaveAttribute('data-show', '');

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveAttribute('data-show', '');
    await expect(page.locator('#flash')).toHaveText('Not a word');
    // Answered once, remembered for the session — see _README.md.
    expect(asked).toBe(1);
  });

  const unanswered = [
    { name: 'the request never gets through', dict: { abort: true } },
    { name: 'the dictionary is having a bad day', dict: { status: 500 } },
    { name: 'we are being asked to slow down', dict: { status: 429 } },
  ];

  for (const { name, dict } of unanswered) {
    test(`no answer is not a no — ${name}`, async ({ page }) => {
      await play(page);
      const { centre } = await hive(page);
      const word = centre.repeat(4);
      await page.unroute(API);
      await dictionary(page, dict);

      await guess(page, word);
      await expect(page.locator('#flash')).toHaveText('Could not check ' + word);
      await expect(page.locator('#flash')).toHaveAttribute('data-tone', 'bad');
      await expect(page.locator('#score')).toHaveText('0');

      // Nothing was learned, so the word is worth asking about again rather
      // than being remembered as a rejection.
      await page.unroute(API);
      await dictionary(page);
      await guess(page, word);
      await expect(page.locator('#score')).toHaveText('1');
    });
  }
});

test.describe('a word that does not count', () => {
  test('too short never leaves the page', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    let asked = 0;
    page.on('request', req => { if (req.url().includes('dictionaryapi.dev')) asked++; });

    await guess(page, centre.repeat(3));
    await expect(page.locator('#flash')).toHaveText('Too short');
    await expect(page.locator('#flash')).toHaveAttribute('data-tone', 'bad');
    await expect(page.locator('#score')).toHaveText('0');
    // The rules the page can judge on its own cost no round trip.
    expect(asked).toBe(0);
  });

  test('a word without the middle letter never leaves the page', async ({ page }) => {
    await play(page);
    const { centre, letters } = await hive(page);
    const other = letters.find(ch => ch !== centre);
    let asked = 0;
    page.on('request', req => { if (req.url().includes('dictionaryapi.dev')) asked++; });

    await guess(page, other.repeat(4));
    await expect(page.locator('#flash')).toHaveText('Missing ' + centre.toUpperCase());
    await expect(page.locator('#score')).toHaveText('0');
    expect(asked).toBe(0);
  });

  test('the same word twice only scores once', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await guess(page, centre.repeat(4));
    await expect(page.locator('#score')).toHaveText('1');
    await guess(page, centre.repeat(4));
    await expect(page.locator('#flash')).toHaveText('Already found');
    await expect(page.locator('#score')).toHaveText('1');
    await expect(page.locator('#found .word')).toHaveCount(1);
  });

  test('a letter that is not in the hive never reaches the word', async ({ page }) => {
    await play(page);
    const { letters } = await hive(page);
    const outside = 'abcdefghijklmnopqrstuvwxyz'.split('')
      .filter(ch => !letters.includes(ch)).slice(0, 3).join('');
    await page.keyboard.type(outside + letters[0]);
    await expect(page.locator('#typed')).toHaveText(letters[0]);
  });
});

test.describe('finishing', () => {
  test('Done ends the game and reports the score and the longest word', async ({ page }) => {
    await play(page);
    const { centre, letters } = await hive(page);
    const pangram = letters.join('');
    await guess(page, centre.repeat(4));
    await expect(page.locator('#count')).toHaveText('1');
    await guess(page, pangram);
    await expect(page.locator('#count')).toHaveText('2');
    await page.locator('#new').click();

    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#over-title')).toHaveText('Done');
    await expect(page.locator('#final-score')).toHaveText('15');
    await expect(page.locator('#final-count')).toHaveText('2');
    await expect(page.locator('#final-longest')).toHaveText(pangram);
  });

  test('the summary counts what was found and claims no answer key', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await guess(page, centre.repeat(4));
    await expect(page.locator('#count')).toHaveText('1');
    await page.locator('#new').click();

    // The letters are random and the dictionary is remote, so there is no
    // list of everything the hive holds — and the game must not imply one.
    await expect(page.locator('#over-sub')).toHaveText('3:00 — 1 word.');
    await expect(page.locator('#all-words')).toHaveCount(0);
  });

  test('a first result is a new best, and lands on the board', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await guess(page, centre.repeat(5));
    await expect(page.locator('#score')).toHaveText('5');
    await page.locator('#new').click();

    await expect(page.locator('#over-badge')).toHaveText('Best yet at 3:00');
    const row = page.locator('#over-board-rows tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pts')).toHaveText('5');
    await expect(row.locator('.longest')).toHaveText(centre.repeat(5));
    await expect(row).toHaveAttribute('data-fresh', '');
  });

  test('a game with no words found is not recorded', async ({ page }) => {
    await play(page);
    await page.locator('#new').click();
    await expect(page.locator('#final-score')).toHaveText('0');
    await expect(page.locator('#final-longest')).toHaveText('—');
    await expect(page.locator('#over-sub')).toHaveText('3:00 — 0 words.');
    await expect(page.locator('#over-board-rows tr')).toHaveCount(0);
    await expect(page.locator('#over-badge')).toBeHidden();

    // Nothing reaches the board, and a reload finds it still unplayed.
    await page.reload();
    await expect(page.locator('#board-empty')).toBeVisible();
    await expect(page.locator('#board-rows tr')).toHaveCount(0);
  });

  test('an answer that lands after the game ends is not scored late', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(5);

    let release;
    const held = new Promise(r => { release = r; });
    await page.route(API, async route => {
      await held;
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([{ word }]),
      });
    });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText('Checking ' + word);
    await page.locator('#new').click();
    await expect(page.locator('#over')).toHaveAttribute('data-open', '');

    // The clock did not stop for the lookup, so neither does the result.
    release();
    await expect(page.locator('#final-score')).toHaveText('0');
    await expect(page.locator('#score')).toHaveText('0');
    await page.reload();
    await expect(page.locator('#board-rows tr')).toHaveCount(0);
  });

  test('Play again deals a new hive without going back to the start sheet', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await guess(page, centre.repeat(4));
    await expect(page.locator('#count')).toHaveText('1');
    await page.locator('#new').click();
    await page.locator('#again').click();

    await expect(page.locator('#over')).not.toHaveAttribute('data-open', '');
    await expect(page.locator('#start')).not.toHaveAttribute('data-open', '');
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#found .word')).toHaveCount(0);
  });
});

test.describe('the top-score boards', () => {
  test('a score survives a reload', async ({ page }) => {
    await play(page);
    const { letters } = await hive(page);
    const pangram = letters.join('');
    await guess(page, pangram);
    await expect(page.locator('#score')).toHaveText('14');
    await page.locator('#new').click();
    await page.reload();

    const row = page.locator('#board-rows tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pts')).toHaveText('14');
    await expect(row.locator('.longest')).toHaveText(pangram);
    await expect(page.locator('#board-empty')).toBeHidden();
  });

  test('each limit keeps its own board', async ({ page }) => {
    await seed(page, {
      scores: {
        60: [{ score: 9, words: 2, longest: 'cheat', at: '2026-01-02T00:00:00.000Z' }],
        600: [{ score: 88, words: 12, longest: 'checkmate', at: '2026-01-03T00:00:00.000Z' }],
      },
    });

    await page.locator('.limit', { hasText: '1:00' }).click();
    await expect(page.locator('#board-rows .pts')).toHaveText(['9']);
    await page.locator('.limit', { hasText: '10:00' }).click();
    await expect(page.locator('#board-rows .pts')).toHaveText(['88']);
    await page.locator('.limit', { hasText: '2:00' }).click();
    await expect(page.locator('#board-rows tr')).toHaveCount(0);
    await expect(page.locator('#board-empty')).toBeVisible();
  });

  test('a new score is ranked against its own limit only', async ({ page }) => {
    await play(page, {
      limit: 180,
      scores: {
        180: [{ score: 400, words: 40, longest: 'teammate', at: '2026-01-01T00:00:00.000Z' }],
        600: [{ score: 2, words: 1, longest: 'ache', at: '2026-01-01T00:00:00.000Z' }],
      },
    });
    const { letters } = await hive(page);
    await guess(page, letters.join(''));
    await expect(page.locator('#score')).toHaveText('14');
    await page.locator('#new').click();

    await expect(page.locator('#over-board-rows .pts')).toHaveText(['400', '14']);
    await expect(page.locator('#over-badge')).toBeHidden();
    await expect(page.locator('#over-board-rows tr[data-fresh] .pts')).toHaveText('14');
    expect((await saved(page)).scores['600'].length).toBe(1);
  });

  test('only the top five are kept, highest first', async ({ page }) => {
    const at = n => '2026-01-0' + n + 'T00:00:00.000Z';
    await play(page, {
      scores: {
        180: [5, 4, 3, 2, 1].map((s, i) => ({ score: s, words: 1, longest: 'ache', at: at(i + 1) })),
      },
    });
    const { letters } = await hive(page);
    await guess(page, letters.join(''));
    await expect(page.locator('#score')).toHaveText('14');
    await page.locator('#new').click();

    await expect(page.locator('#over-board-rows .pts')).toHaveText(['14', '5', '4', '3', '2']);
    await expect(page.locator('#over-badge')).toHaveText('Best yet at 3:00');
    expect((await saved(page)).scores['180'].length).toBe(5);
  });
});

test.describe('the clock', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
  });

  test('counts down from the chosen limit', async ({ page }) => {
    await play(page, { limit: 60 });
    await expect(page.locator('#clock')).toHaveText('1:00');
    await page.clock.runFor(5000);
    await expect(page.locator('#clock')).toHaveText('0:55');
  });

  test('running out ends the game and records the score', async ({ page }) => {
    await play(page, { limit: 60 });
    const { centre } = await hive(page);
    await guess(page, centre.repeat(7));
    await expect(page.locator('#score')).toHaveText('7');
    await page.clock.runFor(61000);

    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#over-title')).toHaveText('Time!');
    await expect(page.locator('#final-score')).toHaveText('7');
    await expect(page.locator('#final-longest')).toHaveText(centre.repeat(7));
    await expect(page.locator('#over-board-rows .pts')).toHaveText(['7']);
    // The stopped clock shows the limit again, not a red 0:00.
    await expect(page.locator('#clock')).toHaveText('1:00');
    await expect(page.locator('#clock')).not.toHaveAttribute('data-low', '');
  });

  test('nothing is typed once time is up', async ({ page }) => {
    await play(page, { limit: 60 });
    await page.clock.runFor(61000);
    const { centre } = await hive(page);
    await page.keyboard.type(centre.repeat(4));
    await expect(page.locator('#typed')).toHaveText('');
  });
});

test.describe('the page itself', () => {
  test('the rules dialog opens and closes', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toHaveAttribute('data-open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).not.toHaveAttribute('data-open', '');
  });

  test('typing does nothing while the rules are open', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await page.locator('#rules-btn').click();
    await page.keyboard.type(centre.repeat(4));
    await expect(page.locator('#typed')).toHaveText('');
  });

  test('the dictionary is the only thing it reaches for', async ({ page }) => {
    const external = trackExternalRequests(page);
    const errors = trackErrors(page);
    await play(page);
    const { centre, letters } = await hive(page);
    await guess(page, letters.join(''));
    await expect(page.locator('#count')).toHaveText('1');
    await guess(page, centre.repeat(4));
    await expect(page.locator('#count')).toHaveText('2');
    await page.locator('#shuffle').click();
    await page.locator('#new').click();
    await page.locator('#again').click();

    // This game alone is allowed off the origin, and only to the one host.
    // No CDNs, no fonts, no analytics — see the site's rules in CLAUDE.md.
    expect(external.length).toBeGreaterThan(0);
    for (const url of external) {
      expect(url.startsWith('https://api.dictionaryapi.dev/api/v2/entries/en/')).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('the page still loads with no network at all', async ({ page, context }) => {
    // The shell is precached, so being offline costs you the scoring, not the
    // game — the start sheet, the boards and the hive all still come up.
    await play(page);
    await context.setOffline(true);
    try {
      await page.route(API, route => route.abort('failed'));
      const { centre } = await hive(page);
      await guess(page, centre.repeat(4));
      await expect(page.locator('#flash')).toHaveText('Could not check ' + centre.repeat(4));
      await expect(page.locator('.hex')).toHaveCount(7);
    } finally {
      await context.setOffline(false);
    }
  });
});
