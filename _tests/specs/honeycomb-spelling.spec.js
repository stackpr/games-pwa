const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors, dictionaryAnswer } = require('../helpers');

const URL = '/games/honeycomb-spelling/';
const KEY = 'games.honeycomb-spelling.v1';
/*
 * Both dictionary services, because the library tries them in turn — a test
 * that mocked only the first would let the second reach the real internet.
 */
const APIS = [
  'https://api.dictionaryapi.dev/api/v2/entries/en/*',
  'https://freedictionaryapi.com/api/v1/entries/en/*'
];
const API = APIS[0];
// Asked for on load to prove a source works before it is trusted with a real
// word, so the mock always answers it whatever else it is told to do.
const PROBE = 'apple';
// A source must also REFUSE this one, or it is answering yes to
// anything and is not trusted with a real word.
const NONSENSE = 'zqxjvwkfp';
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
  for (const api of APIS) {
    await page.route(api, async route => {
      const url = route.request().url();
      const word = decodeURIComponent(url.split('/').pop());
      // Each service answers the way it really answers — see
      // dictionaryAnswer in helpers.js. The controls always land: a source
      // that fails one is never asked about a real word, which would make
      // most of these tests measure the wrong thing.
      const say = found => route.fulfill(dictionaryAnswer(url, found));
      if (word === PROBE) return say(true);
      if (word === NONSENSE) return say(false);
      if (opts.abort) return route.abort('failed');
      if (opts.status) {
        return route.fulfill({ status: opts.status, contentType: 'application/json', body: '{}' });
      }
      return say(!reject.has(word));
    });
  }
}

async function unserve(page) {
  for (const api of APIS) await page.unroute(api);
}

/**
 * Routes BOTH services with one handler, and answers the control word for
 * free. Two mistakes this exists to prevent: mocking only the first service
 * leaves the second reaching the real internet, and a handler that fails the
 * control word disqualifies the source before the behaviour under test gets
 * to run. Neither is what any of these tests mean.
 */
async function routeBoth(page, handler) {
  for (const api of APIS) {
    await page.route(api, route => {
      const url = route.request().url();
      const word = decodeURIComponent(url.split('/').pop());
      if (word === PROBE) return route.fulfill(dictionaryAnswer(url, true));
      if (word === NONSENSE) return route.fulfill(dictionaryAnswer(url, false));
      return handler(route, word);
    });
  }
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
    centre: document.querySelector('.hex[data-pos="c"]').dataset.letter,
    letters: [...document.querySelectorAll('.hex')].map(e => e.dataset.letter),
  }));
}

/**
 * What the game says a word is worth. Letter values mean a guess built from
 * whatever letters were dealt has no score known ahead of time, so the wiring
 * tests ask; `the scoring` below pins the table itself against real words.
 */
function points(page, word) {
  return page.evaluate(w => window.HoneycombHive.score(w), word);
}

async function guess(page, word) {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
}

const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

test.beforeEach(async ({ page }) => {
  /*
   * Routed before the page loads. The library probes the services on load to
   * learn whether checking works at all, and an unrouted probe would reach
   * the real internet — two deadlines of waiting, and both sources marked
   * down before a single test ran. play() layers its own mock on top, which
   * wins because Playwright matches the most recently added route first.
   */
  await dictionary(page);
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
      await expect(page.locator('#net-note')).toContainText('checked online');
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
    await expect(page.locator('.hex[data-pos="c"]')).toHaveAttribute('data-letter', centre);
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
      await page.locator('.hex[data-letter="' + ch + '"]').click();
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
      .evaluateAll(els => els.map(e => e.dataset.letter));
    const before = await outer();
    // A shuffle can land back where it started, so try until it moves.
    let after = before;
    for (let i = 0; i < 12 && after.join('') === before.join(''); i++) {
      await page.locator('#shuffle').click();
      after = await outer();
    }
    expect(after.join('')).not.toBe(before.join(''));
    expect(after.slice().sort()).toEqual(before.slice().sort());
    await expect(page.locator('.hex[data-pos="c"]')).toHaveAttribute('data-letter', centre);
  });
});

test.describe('scoring a word', () => {
  test('a word scores its letters plus its length', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const four = await points(page, centre.repeat(4));
    const five = await points(page, centre.repeat(5));

    await guess(page, centre.repeat(4));
    await expect(page.locator('#score')).toHaveText(String(four));
    await expect(page.locator('#flash')).toHaveText('+' + four);

    await guess(page, centre.repeat(5));
    await expect(page.locator('#score')).toHaveText(String(four + five));
    await expect(page.locator('#flash')).toHaveText('+' + five);
    await expect(page.locator('#count')).toHaveText('2');
    // One more of the same letter: another letter value, and the length
    // bonus arriving at all — the floor pays none.
    expect(five - four).toBe(await points(page, centre) + 1);
    expect(four).toBe(await points(page, centre) * 4);
  });

  test('a pangram is worth its letters, its length and ten', async ({ page }) => {
    await play(page);
    const { letters } = await hive(page);
    const pangram = letters.join('');
    const worth = await points(page, pangram);
    await guess(page, pangram);
    await expect(page.locator('#flash')).toHaveText('Pangram! +' + worth);
    await expect(page.locator('#score')).toHaveText(String(worth));
    await expect(page.locator('#found .word[data-pangram]')).toHaveText(pangram);

    // Seven letters, so 9 for the length and 10 for the pangram on top of
    // whatever the letters themselves are worth.
    const bare = await page.evaluate(l => {
      const v = { a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5,
        l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4,
        x: 8, y: 4, z: 10 };
      return l.reduce((sum, ch) => sum + v[ch], 0);
    }, letters);
    expect(worth).toBe(bare + 9 + 10);
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
    await expect(page.locator('#flash')).toHaveText('+' + await points(page, centre.repeat(4)));
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

test.describe('the scoring', () => {
  // Real words with the arithmetic written out, so a change to the table or
  // the curve has to be deliberate. Letters + (length - 3)^2 + 10 a pangram.
  const cases = [
    { word: 'ache', sum: 9, len: 0, pangram: 0 },      // a1 c3 h4 e1
    { word: 'cheat', sum: 10, len: 1, pangram: 0 },    // c3 h4 e1 a1 t1
    { word: 'cheetah', sum: 15, len: 9, pangram: 0 },  // c3 h4 e1 e1 t1 a1 h4
    { word: 'checkmate', sum: 22, len: 25, pangram: 10 },
    { word: 'quiz', sum: 22, len: 0, pangram: 0 },     // q10 u1 i1 z10
    { word: 'jinx', sum: 18, len: 0, pangram: 0 },     // j8 i1 n1 x8
    { word: 'entire', sum: 6, len: 4, pangram: 0 },    // all ones
  ];

  for (const { word, sum, len, pangram } of cases) {
    test(`${word} is worth ${sum + len + pangram}`, async ({ page }) => {
      expect(await points(page, word)).toBe(sum + len + pangram);
    });
  }

  test('awkward letters beat easy ones at the same length', async ({ page }) => {
    // Same four letters of length, wildly different to spell with.
    expect(await points(page, 'quiz')).toBeGreaterThan(await points(page, 'entire'));
  });

  test('length overtakes letter values once a word gets long', async ({ page }) => {
    // The whole point of squaring: four awkward letters lose to nine easy
    // ones, which is not true of the letter values on their own.
    expect(await points(page, 'entertain')).toBeGreaterThan(await points(page, 'quiz'));
  });

  test('the length bonus is the square of the reach past four', async ({ page }) => {
    // Same letter throughout, so only the curve moves.
    const run = [];
    for (let n = 4; n <= 9; n++) run.push(await points(page, 'e'.repeat(n)));
    // 'e' is worth 1, so each score is n + (n - 4)^2 — nothing at the floor.
    expect(run).toEqual([4, 6, 10, 16, 24, 34]);
  });

  test('the floor pays no length bonus at all', async ({ page }) => {
    // A four-letter word is scored purely on how awkward its letters are.
    expect(await points(page, 'ache')).toBe(9);
    expect(await points(page, 'quiz')).toBe(22);
  });

  test('the pangram bonus is exactly ten', async ({ page }) => {
    // Seven letters either way, so the length bonus cancels. One uses all
    // seven distinct; the other repeats a b instead of reaching for the w.
    const pangram = await points(page, 'bathesw');
    const notQuite = await points(page, 'bathesb');
    // w is worth 4 and b is worth 3, so the letters differ by one on top.
    expect(pangram - notQuite).toBe(10 + 1);
  });
});

test.describe('the tiles', () => {
  test('every tile shows its own letter value', async ({ page }) => {
    await play(page);
    const shown = await page.locator('.hex').evaluateAll(els => els.map(e => ({
      letter: e.dataset.letter,
      value: e.querySelector('.hex-value').textContent,
      label: e.getAttribute('aria-label'),
    })));

    expect(shown).toHaveLength(7);
    for (const { letter, value, label } of shown) {
      // The value on the tile is the value the scorer uses — a tile that lied
      // would be worse than one that said nothing.
      expect(Number(value), letter).toBe(await points(page, letter));
      expect(label, letter).toContain('worth ' + value);
    }
  });

  test('the middle tile says it is the middle one', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const label = await page.locator('.hex[data-pos="c"]').getAttribute('aria-label');
    const value = await points(page, centre);
    expect(label).toBe(centre + ', worth ' + value + ', the middle letter');
  });

  test('a tap that drifts onto the next hex still types the one it landed on',
    async ({ page }) => {
      await play(page);
      const from = page.locator('.hex[data-pos="nw"]');
      const to = page.locator('.hex[data-pos="ne"]');
      const a = await from.boundingBox();
      const b = await to.boundingBox();

      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.up();

      // A click needs press and release on the same element, so a finger that
      // slides between two touching hexagons used to type nothing at all.
      // Taking the letter on pointerdown is what fixes it — see _README.md.
      await expect(page.locator('#typed')).toHaveText(await from.getAttribute('data-letter'));
    });

  test('a tap lands on the letter even when it hits the value', async ({ page }) => {
    await play(page);
    const hex = page.locator('.hex[data-pos="n"]');
    await hex.locator('.hex-value').click();
    await expect(page.locator('#typed')).toHaveText(await hex.getAttribute('data-letter'));
  });

  test('the value never leaks into the word being typed', async ({ page }) => {
    await play(page);
    const { letters } = await hive(page);
    await page.locator('.hex[data-letter="' + letters[0] + '"]').click();
    // Tapping reads data-letter, not the tile's text, which now holds a digit.
    await expect(page.locator('#typed')).toHaveText(letters[0]);
  });
});

test.describe('the dictionary', () => {
  test('a word the dictionary does not have scores nothing', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);
    await unserve(page);
    await dictionary(page, { reject: [word] });

    await guess(page, word);
    // The verdict names the word: an answer can arrive long after the guess.
    await expect(page.locator('#flash')).toHaveText('Not a word: ' + word);
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
    await routeBoth(page, async route => {
      await held;
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([{ word }]),
      });
    });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText(word);
    await expect(page.locator('#flash')).toHaveAttribute('data-tone', 'wait');
    // Nothing is scored on the strength of the guess alone.
    await expect(page.locator('#score')).toHaveText('0');

    release();
    await expect(page.locator('#flash')).toHaveText('+' + await points(page, word));
    await expect(page.locator('#score')).toHaveText(String(await points(page, word)));
  });

  test('the same word sent twice over only asks once', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);

    let release;
    const held = new Promise(r => { release = r; });
    let asked = 0;
    await routeBoth(page, async route => {
      asked++;
      await held;
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([{ word }]),
      });
    });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText(word);
    await guess(page, word);
    release();
    await expect(page.locator('#score')).toHaveText(String(await points(page, word)));
    expect(asked).toBe(1);
    await expect(page.locator('#found .word')).toHaveCount(1);
  });

  test('a verdict already given is not asked about twice', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);
    await unserve(page);
    await dictionary(page, { reject: [word] });
    let asked = 0;
    page.on('request', req => { if (req.url().includes('dictionaryapi.dev')) asked++; });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText('Not a word: ' + word);

    // Clear the line, so the second verdict appearing is the second verdict
    // and not the first one still sitting there.
    await page.keyboard.press('Backspace');
    await expect(page.locator('#flash')).not.toHaveAttribute('data-show', '');

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveAttribute('data-show', '');
    await expect(page.locator('#flash')).toHaveText('Not a word: ' + word);
    // Answered once, remembered for the session — see _README.md.
    expect(asked).toBe(1);
  });

  const unanswered = [
    { name: 'the request never gets through', dict: { abort: true } },
    { name: 'the dictionary is having a bad day', dict: { status: 500 } },
    { name: 'we are being asked to slow down', dict: { status: 429 } },
  ];

  for (const { name, dict } of unanswered) {
    test(`no answer is queued rather than counted as a no — ${name}`, async ({ page }) => {
      await play(page);
      const { centre } = await hive(page);
      const word = centre.repeat(4);
      await unserve(page);
      await dictionary(page, dict);

      await guess(page, word);
      await expect(page.locator('#flash')).toHaveText(word);
      await expect(page.locator('#score')).toHaveText('0');
      // Visibly waiting rather than silently dropped.
      await expect(page.locator('#found .word[data-waiting]')).toHaveText(word);

      // Nothing was learned, so the word is asked about again rather than
      // being remembered as a rejection.
      await unserve(page);
      await dictionary(page);
      await expect(page.locator('#score')).toHaveText(String(await points(page, word)));
      await expect(page.locator('#found .word[data-waiting]')).toHaveCount(0);
    });
  }
});

test.describe('the retry queue', () => {
  test('a word that went unanswered is asked again, and scores when it lands',
    async ({ page }) => {
      await play(page);
      const { centre } = await hive(page);
      const word = centre.repeat(4);

      /*
       * The whole first lookup has to fail, both services, or there is no
       * unanswered word to retry: a 503 from one service is now answered by
       * the other inside the same lookup, and the word simply scores. That
       * fallback is the point of having two, but it is not what this test is
       * about.
       */
      let asked = 0;
      await routeBoth(page, async route => {
        asked++;
        if (asked <= 2) return route.fulfill({ status: 503, body: '{}' });
        await route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify([{ word }]),
        });
      });

      await guess(page, word);
      await expect(page.locator('#found .word[data-waiting]')).toHaveCount(1);
      await expect(page.locator('#score')).toHaveText(String(await points(page, word)));
      await expect(page.locator('#found .word[data-waiting]')).toHaveCount(0);
      await expect(page.locator('#found .word:not([data-waiting])')).toHaveText(word);
      // Two services asked and failed, then the retry landed.
      expect(asked).toBe(3);
    });

  test('the queue shows which try a word is on', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);
    await unserve(page);
    await dictionary(page, { status: 503 });

    let asked = 0;
    page.on('request', req => { if (req.url().includes('dictionaryapi.dev')) asked++; });

    await guess(page, word);
    const chip = page.locator('#found .word[data-waiting]');
    await expect(chip).toHaveText(word);
    await expect.poll(() => asked).toBe(1);

    // The waits double: a second to the 2nd try, two more to the 3rd, four
    // to the 4th. Nothing moves early. The chip says only that the word is
    // still out — how many times it has been asked is the network's
    // business, not the player's. See _README.md.
    await page.clock.runFor(900);
    await expect.poll(() => asked).toBe(1);
    await page.clock.runFor(200);
    await expect.poll(() => asked).toBe(2);

    /*
     * And there it stops. The queue keeps its own cadence — the chip is
     * still up through both later waits — but js/lib/dictionary.js has by
     * now seen the service fail twice running and set it aside, so the
     * third and fourth tries cost no request at all. Asking a service known
     * to be down is exactly what the backoff exists to prevent; how often a
     * word is asked about is the queue's business, whether it reaches the
     * wire is the library's.
     */
    await page.clock.runFor(2100);
    await page.clock.runFor(4100);
    expect(asked, 'kept asking a service already set aside').toBe(2);
    await expect(chip).toHaveText(word);
  });

  test('five unanswered tries is as far as it goes', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);
    let asked = 0;
    page.on('request', req => { if (req.url().includes('dictionaryapi.dev')) asked++; });
    await unserve(page);
    await dictionary(page, { status: 503 });

    await guess(page, word);
    // 1s + 2s + 4s + 8s covers every retry there is.
    await page.clock.runFor(16000);

    /*
     * It is named rather than dropped in silence. With the dictionary
     * unreachable every word ends here, and one that just stops being
     * listed reads as the game rejecting it — which is the opposite of what
     * happened: it was never judged, and it cost nothing.
     */
    await expect(page.locator('#flash')).toHaveText('Could not check ' + word);
    await expect(page.locator('#found .word[data-waiting]')).toHaveCount(0);
    await expect(page.locator('#score')).toHaveText('0');
    /*
     * Five tries by the queue, but not five requests: the library sets a
     * service aside once it has failed twice running, so the later tries
     * are answered without asking anyone. What matters is that the word is
     * out of tries and cost nothing, not how many packets it took.
     */
    expect(asked).toBeGreaterThan(0);
    expect(asked).toBeLessThanOrEqual(5);
  });

  test('a word already queued is not queued twice', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(4);
    await unserve(page);
    await dictionary(page, { status: 503 });

    await guess(page, word);
    // The chip covers a word in flight too, so wait for the try number: that
    // is what says it has failed once and is sitting in the queue.
    await expect(page.locator('#found .word[data-waiting]')).toHaveText(word);

    // Typing it again while it waits changes nothing but the message.
    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText(word);
    await expect(page.locator('#found .word[data-waiting]')).toHaveCount(1);
    await expect(page.locator('#found .word[data-waiting]')).toHaveText(word);
  });

  test('a new game starts with an empty queue', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await unserve(page);
    await dictionary(page, { status: 503 });
    await guess(page, centre.repeat(4));
    await expect(page.locator('#found .word[data-waiting]'))
      .toHaveText(centre.repeat(4));

    await page.locator('#new').click();
    await page.locator('#again').click();
    await expect(page.locator('#found .word[data-waiting]')).toHaveCount(0);
    await expect(page.locator('#found .found-empty')).toBeVisible();
  });
});

test.describe('our own vocabulary', () => {
  test('holds plain single words and drops the rest', async ({ page }) => {
    const known = w => page.evaluate(x => window.HoneycombHive.knows(x), w);
    expect(await known('piano')).toBe(true);
    expect(await known('zzzz')).toBe(false);
    // Vocab carries "Ping-pong" and "Wind-up toy"; neither can be typed on a
    // hive, and neither may leak in as a bare half of itself.
    expect(await known('ping-pong')).toBe(false);
    expect(await known('wind-up toy')).toBe(false);
  });

  test('a word we already know never reaches the network', async ({ page }) => {
    await play(page);
    // The letters are random, so deal until one of them can spell something
    // the shipped vocabulary holds.
    let word = null;
    for (let i = 0; i < 60 && !word; i++) {
      word = await page.evaluate(() => {
        const centre = document.querySelector('.hex[data-pos="c"]').dataset.letter;
        const set = new Set([...document.querySelectorAll('.hex')].map(e => e.dataset.letter));
        const pool = window.Vocab ? Vocab.pool() : [];
        for (const entry of pool) {
          const w = String(entry.word || '').toLowerCase();
          if (!/^[a-z]{4,}$/.test(w) || w.indexOf(centre) === -1) continue;
          if ([...w].every(c => set.has(c))) return w;
        }
        return null;
      });
      if (!word) {
        await page.locator('#new').click();
        await page.locator('#again').click();
      }
    }
    expect(word, 'a hive that can spell a vocabulary word').not.toBeNull();

    // Every request is refused, so anything that scores did so locally.
    await unserve(page);
    await dictionary(page, { abort: true });
    let asked = 0;
    page.on('request', req => { if (req.url().includes('dictionaryapi.dev')) asked++; });

    await guess(page, word);
    await expect(page.locator('#score')).toHaveText(String(await points(page, word)));
    expect(asked).toBe(0);
  });
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
    const worth = await points(page, centre.repeat(4));
    await guess(page, centre.repeat(4));
    await expect(page.locator('#score')).toHaveText(String(worth));
    await guess(page, centre.repeat(4));
    await expect(page.locator('#flash')).toHaveText('Already found');
    await expect(page.locator('#score')).toHaveText(String(worth));
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
    const total = await points(page, centre.repeat(4)) + await points(page, pangram);
    await guess(page, centre.repeat(4));
    await expect(page.locator('#count')).toHaveText('1');
    await guess(page, pangram);
    await expect(page.locator('#count')).toHaveText('2');
    await page.locator('#new').click();

    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#over-title')).toHaveText('Done');
    await expect(page.locator('#final-score')).toHaveText(String(total));
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
    const worth = await points(page, centre.repeat(5));
    await guess(page, centre.repeat(5));
    await expect(page.locator('#score')).toHaveText(String(worth));
    await page.locator('#new').click();

    await expect(page.locator('#over-badge')).toHaveText('Best yet at 3:00');
    const row = page.locator('#over-board-rows tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pts')).toHaveText(String(worth));
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

  test('the result waits for a word still out, and counts it', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(5);

    let release;
    const held = new Promise(r => { release = r; });
    await routeBoth(page, async route => {
      await held;
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([{ word }]),
      });
    });

    await guess(page, word);
    await expect(page.locator('#flash')).toHaveText(word);
    await page.locator('#new').click();

    // The word was sent in time, so the finish screen holds rather than
    // throwing the answer away — see _README.md.
    await expect(page.locator('#flash')).toHaveText(word);
    await expect(page.locator('#over')).not.toHaveAttribute('data-open', '');

    release();
    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#final-score')).toHaveText(String(await points(page, word)));
    await expect(page.locator('#final-count')).toHaveText('1');
  });

  test('the finish screen waits for the retry queue too', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
    await play(page);
    const { centre } = await hive(page);
    const word = centre.repeat(5);

    // Both services fail the first lookup, so the word is genuinely queued
    // rather than answered by the fallback — see the note above.
    let asked = 0;
    await routeBoth(page, async route => {
      asked++;
      if (asked <= 2) return route.fulfill({ status: 503, body: '{}' });
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([{ word }]),
      });
    });

    await guess(page, word);
    await expect(page.locator('#found .word[data-waiting]')).toHaveText(word);
    await page.locator('#new').click();
    await expect(page.locator('#over')).not.toHaveAttribute('data-open', '');

    // Once the clock has stopped the queue stops being polite: the retry is
    // pulled forward to a short gap rather than its full second.
    await page.clock.runFor(500);
    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#final-score')).toHaveText(String(await points(page, word)));
  });

  test('Skip gives up on the queue and shows the result', async ({ page }) => {
    await play(page);
    const { centre } = await hive(page);
    await unserve(page);
    await dictionary(page, { abort: true });
    await guess(page, centre.repeat(4));
    await expect(page.locator('#found .word[data-waiting]'))
      .toHaveText(centre.repeat(4));

    await page.locator('#new').click();
    await expect(page.locator('#new')).toHaveText('Skip');
    await expect(page.locator('#over')).not.toHaveAttribute('data-open', '');

    await page.locator('#new').click();
    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#final-score')).toHaveText('0');
    await expect(page.locator('#new')).toHaveText('New');
  });

  test('a dictionary that never answers cannot strand the game', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
    await play(page);
    const { centre } = await hive(page);
    await unserve(page);
    // Never resolves at all — no status, no failure, just silence.
    await routeBoth(page, () => { /* never answered */ });

    await guess(page, centre.repeat(4));
    await page.locator('#new').click();
    await expect(page.locator('#over')).not.toHaveAttribute('data-open', '');

    // The wait is capped, so the result arrives whatever the dictionary does.
    await page.clock.runFor(12500);
    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
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
    const worth = await points(page, pangram);
    await guess(page, pangram);
    await expect(page.locator('#score')).toHaveText(String(worth));
    await page.locator('#new').click();
    await page.reload();

    const row = page.locator('#board-rows tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pts')).toHaveText(String(worth));
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
    const worth = await points(page, letters.join(''));
    await guess(page, letters.join(''));
    await expect(page.locator('#score')).toHaveText(String(worth));
    await page.locator('#new').click();

    // 400 is out of reach of one word, so the seeded best keeps the top slot.
    expect(worth).toBeLessThan(400);
    await expect(page.locator('#over-board-rows .pts')).toHaveText(['400', String(worth)]);
    await expect(page.locator('#over-badge')).toBeHidden();
    await expect(page.locator('#over-board-rows tr[data-fresh] .pts')).toHaveText(String(worth));
    expect((await saved(page)).scores['600'].length).toBe(1);
  });

  test('only the top ten are kept, highest first', async ({ page }) => {
    const at = n => '2026-01-' + String(n).padStart(2, '0') + 'T00:00:00.000Z';
    const seeded = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    await play(page, {
      scores: {
        180: seeded.map((s, i) => ({ score: s, words: 1, longest: 'ache', at: at(i + 1) })),
      },
    });
    const { letters } = await hive(page);
    const worth = await points(page, letters.join(''));
    await guess(page, letters.join(''));
    await expect(page.locator('#score')).toHaveText(String(worth));
    await page.locator('#new').click();

    // A pangram clears 10 in any hive, so the new score takes the top slot
    // and the last seeded one falls off the bottom.
    expect(worth).toBeGreaterThan(10);
    await expect(page.locator('#over-board-rows .pts'))
      .toHaveText([String(worth), '10', '9', '8', '7', '6', '5', '4', '3', '2']);
    await expect(page.locator('#over-badge')).toHaveText('Best yet at 3:00');
    expect((await saved(page)).scores['180'].length).toBe(10);
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
    const worth = await points(page, centre.repeat(7));
    await guess(page, centre.repeat(7));
    await expect(page.locator('#score')).toHaveText(String(worth));
    await page.clock.runFor(61000);

    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#over-title')).toHaveText('Time!');
    await expect(page.locator('#final-score')).toHaveText(String(worth));
    await expect(page.locator('#final-longest')).toHaveText(centre.repeat(7));
    await expect(page.locator('#over-board-rows .pts')).toHaveText([String(worth)]);
    // The stopped clock shows the limit again, not a red 0:00.
    await expect(page.locator('#clock')).toHaveText('1:00');
    await expect(page.locator('#clock')).not.toHaveAttribute('data-low', '');
  });

  test('the letters on the line go out when the clock does', async ({ page }) => {
    await play(page, { limit: 60 });
    const { centre } = await hive(page);
    const word = centre.repeat(4);
    const worth = await points(page, word);
    // Typed but never entered — Enter is optional on the last word.
    await page.keyboard.type(word);
    await expect(page.locator('#typed')).toHaveText(word);
    await page.clock.runFor(61000);

    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#final-score')).toHaveText(String(worth));
    await expect(page.locator('#final-count')).toHaveText('1');
  });

  test('Done does not send the letters on the line', async ({ page }) => {
    await play(page, { limit: 60 });
    const { centre } = await hive(page);
    await page.keyboard.type(centre.repeat(4));
    await page.locator('#new').click();

    // Ending the game early is deliberate; a half-typed word is not a guess.
    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#final-score')).toHaveText('0');
  });

  test('nothing is typed once time is up', async ({ page }) => {
    await play(page, { limit: 60 });
    await page.clock.runFor(61000);
    const { centre } = await hive(page);
    await page.keyboard.type(centre.repeat(4));
    await expect(page.locator('#typed')).toHaveText('');
  });
});

test.describe('fresh letters', () => {
  test('New deals a different hive and restarts the clock', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
    await play(page, { limit: 60 });
    const before = await hive(page);
    await guess(page, before.centre.repeat(4));
    await expect(page.locator('#score')).not.toHaveText('0');
    await page.clock.runFor(20000);
    await expect(page.locator('#clock')).toHaveText('0:40');

    // Not every redeal produces a different hive, so this asks until one
    // does rather than asserting on a single draw.
    let after = before;
    for (let i = 0; i < 20 && after.letters.join('') === before.letters.join(''); i++) {
      await page.locator('#fresh').click();
      after = await hive(page);
    }
    expect(after.letters.join('')).not.toBe(before.letters.join(''));
    await expect(page.locator('#clock')).toHaveText('1:00');
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#count')).toHaveText('0');
    await expect(page.locator('#over')).not.toHaveAttribute('data-open', '');

    // The old clock went with the old hive: this is a whole minute, not the
    // forty seconds that were left.
    await page.clock.runFor(45000);
    await expect(page.locator('#over')).not.toHaveAttribute('data-open', '');
    await page.clock.runFor(16000);
    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
  });

  test('New only offers itself while a game is on', async ({ page }) => {
    await expect(page.locator('#fresh')).toBeHidden();
    await play(page);
    await expect(page.locator('#fresh')).toBeVisible();
    await page.locator('#new').click();
    await expect(page.locator('#fresh')).toBeHidden();
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

    /*
     * This game alone is allowed off the origin, and only to the dictionary
     * services — two of them, so one being down is not the same as the
     * dictionary being down. No CDNs, no fonts, no analytics; see the site's
     * rules in CLAUDE.md.
     */
    const HOSTS = [
      'https://api.dictionaryapi.dev/api/v2/entries/en/',
      'https://freedictionaryapi.com/api/v1/entries/en/'
    ];
    expect(external.length).toBeGreaterThan(0);
    for (const url of external) {
      expect(HOSTS.some(host => url.startsWith(host)), url).toBe(true);
    }
    /*
     * The probe asks each service to refuse a nonsense control, and a
     * refusal is a 404 the browser logs itself — one per service, and no
     * catch suppresses it. What must hold is that the game adds nothing to
     * it. See CLAUDE.md.
     */
    const ours = errors.filter(line => !/Failed to load resource/.test(line));
    expect(ours, 'the game logged an error of its own').toEqual([]);
  });

  test('the page still loads with no network at all', async ({ page, context }) => {
    // The shell is precached, so being offline costs you the scoring, not the
    // game — the start sheet, the boards and the hive all still come up.
    await play(page);
    await context.setOffline(true);
    try {
      await routeBoth(page, route => route.abort('failed'));
      const { centre } = await hive(page);
      await guess(page, centre.repeat(4));
      await expect(page.locator('#flash')).toHaveText(centre.repeat(4));
      await expect(page.locator('.hex')).toHaveCount(7);
    } finally {
      await context.setOffline(false);
    }
  });
});
