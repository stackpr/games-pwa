const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/rummy/';
const KEY = 'games.rummy.v1';

const contract = page => page.locator('#contract-what');
const roundNo = page => page.locator('#contract-no');
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

/** Totals row, left to right, without the empty round-number cell. */
const totals = page => page.evaluate(() =>
  [...document.querySelectorAll('tfoot td')].slice(1).map(t => t.textContent));

/** Types a number into one seat's hand through the pad. */
async function setHand(page, seat, value) {
  await page.locator(`.hand-left[data-seat="${seat}"]`).click();
  await page.locator('#pad button[aria-label="Clear"]').click();
  for (const ch of String(value)) {
    await page.locator(`#pad button:text-is("${ch}")`).click();
  }
  await page.locator('#picker [data-close]').click();
  await expect(page.locator('#picker')).not.toHaveAttribute('data-open', '');
}

/** Scores one round from a list of hands, one per seat. */
async function scoreRound(page, hands) {
  for (let i = 0; i < hands.length; i++) await setHand(page, i, hands[i]);
  await page.locator('#score').click();
}

async function openSettings(page) {
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings')).toHaveAttribute('data-open', /.*/);
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
  await page.reload();
});

test.describe('the sheet', () => {
  test('opens on the first pattern with nothing scored', async ({ page }) => {
    await expect(roundNo(page)).toHaveText('Round 1 of 7');
    await expect(contract(page)).toHaveText('2 sets of 3');
    await expect(page.locator('#empty-note')).toBeVisible();
    // Nothing can be scored until every hand has a number in it.
    await expect(page.locator('#score')).toBeDisabled();
  });

  test('a round needs every hand before it can be scored', async ({ page }) => {
    await setHand(page, 0, 0);
    await expect(page.locator('#score')).toBeDisabled();
    await setHand(page, 1, 20);
    await expect(page.locator('#score')).toBeDisabled();
    await setHand(page, 2, 30);
    await expect(page.locator('#score')).toBeEnabled();
  });

  test('scoring a round moves to the next pattern', async ({ page }) => {
    await scoreRound(page, [0, 25, 40]);
    await expect(roundNo(page)).toHaveText('Round 2 of 7');
    await expect(contract(page)).toHaveText('1 set of 3 + 1 run of 4');
    expect(await totals(page)).toEqual(['0', '25', '40']);
  });

  test('the whole sequence reads in order', async ({ page }) => {
    const want = [
      '2 sets of 3',
      '1 set of 3 + 1 run of 4',
      '2 runs of 4',
      '3 sets of 3',
      '2 sets of 3 + 1 run of 4',
      '1 set of 3 + 2 runs of 4',
      '3 runs of 4'
    ];
    for (let r = 0; r < want.length; r++) {
      await expect(contract(page)).toHaveText(want[r]);
      await scoreRound(page, [0, 10, 10]);
    }
    // Seven deals is the whole game.
    await expect(roundNo(page)).toHaveText('Final');
  });

  test('undo puts the last round back', async ({ page }) => {
    await scoreRound(page, [0, 25, 40]);
    await scoreRound(page, [10, 0, 5]);
    expect(await totals(page)).toEqual(['10', '25', '45']);
    await page.locator('#undo').click();
    expect(await totals(page)).toEqual(['0', '25', '40']);
    await expect(roundNo(page)).toHaveText('Round 2 of 7');
  });
});

test.describe('who went out', () => {
  test('is whoever is holding nothing', async ({ page }) => {
    await scoreRound(page, [30, 0, 15]);
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll('tbody td')].map(t => t.className));
    // Column 2 is seat 1 — the round-number cell is first.
    expect(marked[2]).toContain('went-out');
    expect(marked[1]).not.toContain('went-out');
  });

  test('a round can end with nobody out', async ({ page }) => {
    /*
     * The stock and the discard pile can both run out, and then there is
     * no winner and everybody counts their hand. It falls out of reading
     * "who went out" off the empty hand rather than asking separately —
     * no zero, nobody out. See _README.md.
     */
    await scoreRound(page, [12, 8, 20]);
    expect(await totals(page)).toEqual(['12', '8', '20']);
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll('tbody td.went-out')].length);
    expect(marked).toBe(0);
  });
});

test.describe('the three ways of scoring', () => {
  /*
   * The sheet stores the hands and never the scores, so these are three
   * readings of one set of facts: switching re-scores the game that has
   * already been played instead of invalidating it. That is the property
   * worth pinning, so each case scores the same round and then switches.
   */
  test('cards against you, winner takes, and winner takes while losers lose',
    async ({ page }) => {
      await scoreRound(page, [0, 25, 40]);
      expect(await totals(page)).toEqual(['0', '25', '40']);

      await openSettings(page);
      await page.locator('[data-scoring="reward"]').click();
      await page.locator('#settings [data-close]').click();
      // The one who went out collects 25 + 40; the others score nothing.
      expect(await totals(page)).toEqual(['65', '0', '0']);

      await openSettings(page);
      await page.locator('[data-scoring="swing"]').click();
      await page.locator('#settings [data-close]').click();
      expect(await totals(page)).toEqual(['65', '-25', '-40']);
    });

  test('the leader is marked, and which end leads follows the scoring',
    async ({ page }) => {
      await scoreRound(page, [0, 25, 40]);
      const leading = () => page.evaluate(() =>
        [...document.querySelectorAll('tfoot td')]
          .map((t, i) => (t.hasAttribute('data-lead') ? i : -1))
          .filter(i => i >= 0));
      // Low wins on penalties, so seat 1 (cell 1) is ahead on 0.
      expect(await leading()).toEqual([1]);

      await openSettings(page);
      await page.locator('[data-scoring="reward"]').click();
      await page.locator('#settings [data-close]').click();
      // High wins now, and the same seat is ahead on 65 — but because it
      // is the biggest, not the smallest.
      expect(await leading()).toEqual([1]);
      expect((await totals(page))[0]).toBe('65');
    });
});

test.describe('configuring the patterns', () => {
  test('they can be turned off entirely', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-patterns="off"]').click();
    await page.locator('#settings [data-close]').click();
    await expect(contract(page)).toHaveText('Anything you like');
    // No pattern means no sequence to move through, so the setting for
    // how seats advance has nothing to say.
    await openSettings(page);
    await expect(page.locator('#advance-field')).toBeHidden();
  });

  test('a long sequence can be played short', async ({ page }) => {
    /*
     * The ask this exists for: the fifteen-pattern game played as five is
     * the same game, shorter. The sequence is trimmed from the front, so
     * the patterns that are played are the ones that were always first.
     */
    await openSettings(page);
    await page.locator('[data-patterns="fifteen"]').click();
    await page.locator('[data-rounds="5"]').click();
    await page.locator('#settings [data-close]').click();

    await expect(roundNo(page)).toHaveText('Round 1 of 5');
    for (let r = 0; r < 5; r++) await scoreRound(page, [0, 10, 10]);
    await expect(roundNo(page)).toHaveText('Final');
  });

  test('every sequence is offered, and each starts where it should',
    async ({ page }) => {
      const want = {
        seven: '2 sets of 3',
        eight: '2 sets of 3',
        ten: '2 sets of 3',
        fifteen: '2 sets of 3'
      };
      for (const [key, first] of Object.entries(want)) {
        await openSettings(page);
        await page.locator(`[data-patterns="${key}"]`).click();
        await page.locator('#settings [data-close]').click();
        await expect(contract(page)).toHaveText(first);
      }
    });

  test('a pair is named as a pair, not as a set of two', async ({ page }) => {
    // The long sequence ends one hand on a pair, and "1 set of 2" is not
    // what anybody at the table calls that.
    await openSettings(page);
    await page.locator('[data-patterns="fifteen"]').click();
    await page.locator('#settings [data-close]').click();
    await page.locator('#rules-btn').click();
    const items = await page.locator('#rules-list li').allTextContents();
    expect(items[13]).toBe('1 set of 5 + 1 run of 5 + 1 pair');
    expect(items.join(' ')).not.toContain('set of 2');
  });

  test('the rules sheet lists only the patterns being played', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-patterns="ten"]').click();
    await page.locator('[data-rounds="4"]').click();
    await page.locator('#settings [data-close]').click();
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules-list li')).toHaveCount(4);
  });
});

test.describe('moving on to the next pattern', () => {
  test('together, everyone meets the same pattern whoever made it',
    async ({ page }) => {
      await scoreRound(page, [0, 25, 40]);
      const names = await page.locator('.hand-name').allTextContents();
      // No pattern is named per seat, because there is only one in play.
      expect(names.join('')).not.toContain('sets of');
      await expect(contract(page)).toHaveText('1 set of 3 + 1 run of 4');
    });

  test('earned, a player who misses meets the same pattern again',
    async ({ page }) => {
      /*
       * Seat 0 goes out, so it made the pattern. Seat 1 is ticked as
       * having made it too. Seat 2 is not, so next deal seats 0 and 1 are
       * on the second pattern and seat 2 is still on the first.
       */
      await openSettings(page);
      await page.locator('[data-advance="earned"]').click();
      await page.locator('#settings [data-close]').click();

      await setHand(page, 0, 0);
      await setHand(page, 1, 25);
      await setHand(page, 2, 40);
      await page.locator('.hand-made').nth(1).click();
      await page.locator('#score').click();

      const names = await page.locator('.hand-name').allTextContents();
      expect(names[0]).toContain('1 set of 3 + 1 run of 4');
      expect(names[1]).toContain('1 set of 3 + 1 run of 4');
      expect(names[2]).toContain('2 sets of 3');
      // The banner cannot name one pattern when the table is split.
      await expect(contract(page)).toContainText('Patterns 1–2');
    });

  test('earned, the game runs until somebody finishes the last pattern',
    async ({ page }) => {
      await openSettings(page);
      await page.locator('[data-patterns="seven"]').click();
      await page.locator('[data-rounds="3"]').click();
      await page.locator('[data-advance="earned"]').click();
      await page.locator('#settings [data-close]').click();

      // Seat 0 goes out every deal, so it clears three patterns in three
      // deals while nobody else moves at all.
      for (let r = 0; r < 3; r++) {
        await expect(roundNo(page)).toHaveText('Round ' + (r + 1));
        await scoreRound(page, [0, 10, 10]);
      }
      await expect(roundNo(page)).toHaveText('Final');
    });

  test('going out counts as making the pattern without a second tap',
    async ({ page }) => {
      await openSettings(page);
      await page.locator('[data-advance="earned"]').click();
      await page.locator('#settings [data-close]').click();
      await setHand(page, 0, 0);
      // Setting a hand to zero is saying that player went out, which is
      // saying they made it. Asking again would be asking twice.
      await expect(page.locator('.hand-made').first()).toHaveAttribute(
        'aria-pressed', 'true');
    });
});

test.describe('players', () => {
  test('two to eight, and the sheet reshapes without losing rounds',
    async ({ page }) => {
      await scoreRound(page, [0, 25, 40]);
      await openSettings(page);
      await page.locator('[data-count="5"]').click();
      await page.locator('#settings [data-close]').click();

      await expect(page.locator('.hand')).toHaveCount(5);
      // The round already played keeps its three scores and the two new
      // seats join on nothing.
      expect(await totals(page)).toEqual(['0', '25', '40', '0', '0']);
    });

  test('a named player shows their name, an unnamed one shows a number',
    async ({ page }) => {
      await openSettings(page);
      await page.locator('#name-0').fill('Ari');
      await page.locator('#settings [data-close]').click();
      const names = await page.locator('.hand-name').allTextContents();
      expect(names[0]).toBe('Ari');
      expect(names[1]).toBe('Player 2');
    });
});

test.describe('new game', () => {
  test('asks twice before clearing', async ({ page }) => {
    await scoreRound(page, [0, 25, 40]);
    const btn = page.locator('#new-btn');
    await btn.click();
    await expect(btn).toHaveText('Clear all?');
    // Still there after the first tap.
    expect(await totals(page)).toEqual(['0', '25', '40']);
    await btn.click();
    await expect(page.locator('#empty-note')).toBeVisible();
    await expect(btn).toHaveText('New game');
  });

  test('keeps the players and the rules', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-patterns="ten"]').click();
    await page.locator('[data-count="4"]').click();
    await page.locator('#settings [data-close]').click();
    await scoreRound(page, [0, 5, 5, 5]);

    await page.locator('#new-btn').click();
    await page.locator('#new-btn').click();
    await expect(page.locator('.hand')).toHaveCount(4);
    await expect(roundNo(page)).toHaveText('Round 1 of 10');
  });
});

test.describe('the shell contract', () => {
  test('state survives a reload under its own key', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-patterns="ten"]').click();
    await page.locator('[data-scoring="reward"]').click();
    await page.locator('#settings [data-close]').click();
    await scoreRound(page, [0, 25, 40]);

    const before = await saved(page);
    expect(before.patterns).toBe('ten');
    expect(before.scoring).toBe('reward');
    expect(before.rounds_played).toHaveLength(1);

    await page.reload();
    await expect(roundNo(page)).toHaveText('Round 2 of 10');
    expect(await totals(page)).toEqual(['65', '0', '0']);
  });

  test('rubbish in storage falls back rather than throwing', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(k => localStorage.setItem(k,
      '{"players":"nope","rounds_played":[{"left":[1,2]},42],"patterns":"zzz"}'), KEY);
    await page.reload();
    await expect(roundNo(page)).toHaveText('Round 1 of 7');
    await expect(page.locator('.hand')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('nothing leaves the origin', async ({ page }) => {
    const external = trackExternalRequests(page);
    await scoreRound(page, [0, 25, 40]);
    await page.locator('#rules-btn').click();
    await page.keyboard.press('Escape');
    await openSettings(page);
    expect(external).toEqual([]);
  });
});

// Not tagged @nodom: the tag is per FILE in this suite and the rest of
// this one drives the page. See _tests/README.md.
test.describe('names', () => {
  test('no trademarked game name is anywhere in the game', async () => {
    /*
     * The mechanic this game borrows — a different required pattern each
     * deal — is traditional and public domain, but the version most people
     * have heard of is a 1982 commercial product and its name is somebody's
     * mark. Rules are free to reimplement; names are not. See Naming a game
     * in CLAUDE.md.
     *
     * The names are assembled from char codes rather than written out,
     * because a guard that spells the thing it forbids has put it in the
     * repository itself.
     */
    const brand = String.fromCharCode(80, 104, 97, 115, 101);
    const banned = [
      new RegExp(brand + '\\s*-?\\s*10\\b', 'i'),
      new RegExp('\\b' + String.fromCharCode(70, 105, 118, 101) +
        '\\s+' + String.fromCharCode(67, 114, 111, 119, 110, 115) + '\\b', 'i')
    ];
    const root = path.join(__dirname, '..', '..');
    const files = [
      'games/rummy/index.html',
      'games/rummy/rummy.js',
      'games/rummy/_README.md',
      'js/games.js',
      'sw.js',
      'README.md',
      '_tests/specs/rummy.spec.js'
    ];
    const found = [];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      for (const pattern of banned) {
        // Reported by position, so a failure does not print the name either.
        const hit = text.search(pattern);
        if (hit >= 0) found.push(rel + ' at character ' + hit);
      }
    }
    expect(found).toEqual([]);
  });
});
