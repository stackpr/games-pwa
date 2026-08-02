const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/honeycomb-spelling/';
const KEY = 'games.honeycomb-spelling.v1';

// The hive the deterministic tests run on. Chosen for what it contains:
// `ache` is the four-letter floor, `cheat` a plain five, and `checkmate`
// a pangram — 9 letters plus the 7 bonus.
const HIVE = 'eachkmt';

/**
 * Seeds saved state and reloads. Naming a hive pins the next game to it:
 * the game draws from the indexes NOT in `recent`, so leaving exactly one
 * out leaves it no choice.
 */
async function seed(page, { letters, limit, scores } = {}) {
  await page.evaluate(([key, l, lim, sc]) => {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (lim) saved.limit = lim;
    if (sc) saved.scores = sc;
    if (l) {
      const i = Hives.findIndex(h => h.letters.join('') === l);
      saved.recent = Hives.map((_, k) => k).filter(k => k !== i);
    }
    localStorage.setItem(key, JSON.stringify(saved));
  }, [KEY, letters, limit, scores]);
  await page.reload();
}

async function play(page, opts = {}) {
  await seed(page, Object.assign({ letters: HIVE }, opts));
  await page.locator('#play').click();
  await expect(page.locator('#start')).not.toHaveAttribute('data-open', '');
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
});

test.describe('the hive', () => {
  test('shows seven letters with the compulsory one in the middle', async ({ page }) => {
    await play(page);
    await expect(page.locator('.hex')).toHaveCount(7);
    await expect(page.locator('.hex[data-pos="c"]')).toHaveText('e');
    const letters = await page.locator('.hex').evaluateAll(els =>
      els.map(e => e.textContent).sort().join(''));
    expect(letters).toBe('acehkmt');
  });

  test('tapping cells builds the word and Delete takes a letter back', async ({ page }) => {
    await play(page);
    for (const ch of 'each') {
      await page.locator('.hex', { hasText: new RegExp('^' + ch + '$') }).click();
    }
    await expect(page.locator('#typed')).toHaveText('each');
    await page.locator('#delete').click();
    await expect(page.locator('#typed')).toHaveText('eac');
  });

  test('the middle letter is marked wherever it lands in the word', async ({ page }) => {
    await play(page);
    await page.keyboard.type('cheek');
    // Two e's, both picked out; nothing else is.
    await expect(page.locator('#typed b')).toHaveCount(2);
    await expect(page.locator('#typed b').first()).toHaveText('e');
  });

  test('shuffle rearranges the outer letters and leaves the middle alone', async ({ page }) => {
    await play(page);
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
    await expect(page.locator('.hex[data-pos="c"]')).toHaveText('e');
  });
});

test.describe('scoring a word', () => {
  test('four letters is one point, longer is a point a letter', async ({ page }) => {
    await play(page);
    await guess(page, 'ache');
    await expect(page.locator('#score')).toHaveText('1');
    await expect(page.locator('#flash')).toHaveText('+1');

    await guess(page, 'cheat');
    await expect(page.locator('#score')).toHaveText('6');
    await expect(page.locator('#flash')).toHaveText('+5');
    await expect(page.locator('#count')).toHaveText('2');
  });

  test('a pangram is worth its letters plus seven', async ({ page }) => {
    await play(page);
    await guess(page, 'checkmate');
    await expect(page.locator('#flash')).toHaveText('Pangram! +16');
    await expect(page.locator('#score')).toHaveText('16');
    await expect(page.locator('#found .word[data-pangram]')).toHaveText('checkmate');
  });

  test('found words stack up newest first', async ({ page }) => {
    await play(page);
    await guess(page, 'ache');
    await guess(page, 'cheat');
    await expect(page.locator('#found .word')).toHaveText(['cheat', 'ache']);
  });

  test('the verdict makes way for the next word', async ({ page }) => {
    await play(page);
    await guess(page, 'ache');
    await expect(page.locator('#flash')).toHaveAttribute('data-show', '');
    await page.keyboard.type('c');
    // Both share one line, so the flash has to go before the word arrives.
    await expect(page.locator('#flash')).not.toHaveAttribute('data-show', '');
    await expect(page.locator('#typed')).toHaveText('c');
  });

  test('the word clears whether it scored or not', async ({ page }) => {
    await play(page);
    await guess(page, 'meek');
    await expect(page.locator('#typed')).toHaveText('');
    await guess(page, 'ache');
    await expect(page.locator('#typed')).toHaveText('');
  });
});

test.describe('a word that does not count', () => {
  const cases = [
    { word: 'ace', why: 'Too short' },
    { word: 'chat', why: 'Missing E' },
    { word: 'meek', why: 'Not in the list' },
  ];

  for (const { word, why } of cases) {
    test(`${word} — ${why}`, async ({ page }) => {
      await play(page);
      await guess(page, word);
      await expect(page.locator('#flash')).toHaveText(why);
      await expect(page.locator('#flash')).toHaveAttribute('data-tone', 'bad');
      await expect(page.locator('#score')).toHaveText('0');
      await expect(page.locator('#count')).toHaveText('0');
    });
  }

  test('the same word twice only scores once', async ({ page }) => {
    await play(page);
    await guess(page, 'ache');
    await guess(page, 'ache');
    await expect(page.locator('#flash')).toHaveText('Already found');
    await expect(page.locator('#score')).toHaveText('1');
    await expect(page.locator('#found .word')).toHaveCount(1);
  });

  test('a letter that is not in the hive never reaches the word', async ({ page }) => {
    await play(page);
    await page.keyboard.type('zebra');
    // Only the hive's own letters survive: e, a.
    await expect(page.locator('#typed')).toHaveText('ea');
  });
});

test.describe('finishing', () => {
  test('Done ends the game and reports the score and the longest word', async ({ page }) => {
    await play(page);
    await guess(page, 'ache');
    await guess(page, 'checkmate');
    await page.locator('#new').click();

    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#over-title')).toHaveText('Done');
    await expect(page.locator('#final-score')).toHaveText('17');
    await expect(page.locator('#final-count')).toHaveText('2');
    await expect(page.locator('#final-longest')).toHaveText('checkmate');
    await expect(page.locator('#over-sub')).toHaveText('3:00 — 2 of 30 words.');
  });

  test('the whole hive is listed, missed words marked as missed', async ({ page }) => {
    await play(page);
    await guess(page, 'ache');
    await page.locator('#new').click();

    await expect(page.locator('#all-words .word')).toHaveCount(30);
    await expect(page.locator('#all-words .word:not([data-missed])')).toHaveText(['ache']);
    await expect(page.locator('#all-words .word[data-missed]')).toHaveCount(29);
  });

  test('a first result is a new best, and lands on the board', async ({ page }) => {
    await play(page);
    await guess(page, 'cheat');
    await page.locator('#new').click();

    await expect(page.locator('#over-badge')).toHaveText('Best yet at 3:00');
    const row = page.locator('#over-board-rows tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pts')).toHaveText('5');
    await expect(row.locator('.longest')).toHaveText('cheat');
    await expect(row).toHaveAttribute('data-fresh', '');
  });

  test('a game with no words found is not recorded', async ({ page }) => {
    await play(page);
    await page.locator('#new').click();
    await expect(page.locator('#final-score')).toHaveText('0');
    await expect(page.locator('#final-longest')).toHaveText('—');
    await expect(page.locator('#over-board-rows tr')).toHaveCount(0);
    await expect(page.locator('#over-badge')).toBeHidden();
    expect((await saved(page)).scores['180']).toEqual([]);
  });

  test('Play again deals a new hive without going back to the start sheet', async ({ page }) => {
    await play(page);
    await guess(page, 'ache');
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
    await guess(page, 'checkmate');
    await page.locator('#new').click();
    await page.reload();

    const row = page.locator('#board-rows tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pts')).toHaveText('16');
    await expect(row.locator('.longest')).toHaveText('checkmate');
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
    await seed(page, {
      letters: HIVE,
      limit: 180,
      scores: {
        180: [{ score: 400, words: 40, longest: 'teammate', at: '2026-01-01T00:00:00.000Z' }],
        600: [{ score: 2, words: 1, longest: 'ache', at: '2026-01-01T00:00:00.000Z' }],
      },
    });
    await page.locator('#play').click();
    await guess(page, 'checkmate');
    await page.locator('#new').click();

    await expect(page.locator('#over-board-rows .pts')).toHaveText(['400', '16']);
    await expect(page.locator('#over-badge')).toBeHidden();
    await expect(page.locator('#over-board-rows tr[data-fresh] .pts')).toHaveText('16');
    expect((await saved(page)).scores['600'].length).toBe(1);
  });

  test('only the top five are kept, highest first', async ({ page }) => {
    const at = n => '2026-01-0' + n + 'T00:00:00.000Z';
    await seed(page, {
      letters: HIVE,
      scores: {
        180: [5, 4, 3, 2, 1].map((s, i) => ({ score: s, words: 1, longest: 'ache', at: at(i + 1) })),
      },
    });
    await page.locator('#play').click();
    await guess(page, 'checkmate');
    await page.locator('#new').click();

    await expect(page.locator('#over-board-rows .pts')).toHaveText(['16', '5', '4', '3', '2']);
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
    await guess(page, 'cheetah');
    await page.clock.runFor(61000);

    await expect(page.locator('#over')).toHaveAttribute('data-open', '');
    await expect(page.locator('#over-title')).toHaveText('Time!');
    await expect(page.locator('#final-score')).toHaveText('7');
    await expect(page.locator('#final-longest')).toHaveText('cheetah');
    await expect(page.locator('#over-board-rows .pts')).toHaveText(['7']);
    // The stopped clock shows the limit again, not a red 0:00.
    await expect(page.locator('#clock')).toHaveText('1:00');
    await expect(page.locator('#clock')).not.toHaveAttribute('data-low', '');
  });

  test('nothing is typed once time is up', async ({ page }) => {
    await play(page, { limit: 60 });
    await page.clock.runFor(61000);
    await page.keyboard.type('ache');
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
    await page.locator('#rules-btn').click();
    await page.keyboard.type('ache');
    await expect(page.locator('#typed')).toHaveText('');
  });

  test('every answer is spellable from its own hive', async ({ page }) => {
    const broken = await page.evaluate(() => {
      const bad = [];
      for (const hive of Hives) {
        const set = new Set(hive.letters);
        if (hive.letters.length !== 7 || set.size !== 7) bad.push(hive.letters.join(''));
        for (const word of hive.words) {
          if (word.length < 4) bad.push(word);
          if (word.indexOf(hive.centre) === -1) bad.push(word);
          if ([...word].some(c => !set.has(c))) bad.push(word);
        }
        if (!hive.pangrams.length) bad.push(hive.letters.join('') + ': no pangram');
      }
      return bad;
    });
    expect(broken).toEqual([]);
  });

  test('no s anywhere in a hive, so no free plurals', async ({ page }) => {
    const withS = await page.evaluate(() =>
      Hives.filter(h => h.letters.includes('s') || h.words.some(w => w.includes('s')))
        .map(h => h.letters.join('')));
    expect(withS).toEqual([]);
  });

  test('stays on the origin and logs nothing', async ({ page }) => {
    const external = trackExternalRequests(page);
    const errors = trackErrors(page);
    await play(page);
    await guess(page, 'checkmate');
    await page.locator('#shuffle').click();
    await page.locator('#new').click();
    await page.locator('#again').click();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
});
