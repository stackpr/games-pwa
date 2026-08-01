const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/blackjack/';

const bank = page => page.locator('#balance');
const seats = page => page.locator('.seat');
const myCards = page => page.locator('.seat[data-me] .card');
const status = page => page.locator('#status');

/**
 * Stacks the shoe so a hand is a fixed script rather than a coin flip.
 *
 * The patch goes on a property setter rather than after load, because
 * blackjack.js builds its shoe synchronously the moment deck.js finishes —
 * there is no gap afterwards to reach into.
 */
async function stack(page, codes) {
  await page.addInitScript(order => {
    let real = null;
    Object.defineProperty(window, 'Deck', {
      configurable: true,
      get() { return real; },
      set(lib) {
        real = lib;
        const realShoe = lib.shoe;
        const queue = order.slice();
        lib.shoe = function (decks) {
          const shoe = realShoe(decks);
          shoe.draw = () => lib.parse(queue.shift()) || realShoe(1).draw();
          shoe.needsShuffle = () => false;
          shoe.shuffle = () => {};
          return shoe;
        };
      },
    });
  }, codes);
}

/** Seeds the table and reloads onto it. */
async function table(page, bank = 500, bet = 10, others = 0) {
  await page.evaluate(([b, t, o]) => localStorage.setItem('games.blackjack.v1',
    JSON.stringify({ decks: 6, others: o, bank: b, bet: t })), [bank, bet, others]);
  await page.reload();
}

async function setOthers(page, n) {
  await page.locator('#settings-btn').click();
  await page.locator(`#others-row .count[data-others="${n}"]`).click();
  await page.locator('#settings .modal-close').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the table', () => {
  test('opens on betting with a $500 bankroll', async ({ page }) => {
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'betting');
    await expect(bank(page)).toHaveText('$500');
    await expect(page.locator('#bet-value')).toHaveText('$10');
    await expect(page.locator('#deal')).toBeVisible();
    await expect(page.locator('#hit')).toBeHidden();
  });

  test('we always sit in the middle', async ({ page }) => {
    for (const [others, seat] of [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2]]) {
      await setOthers(page, others);
      await page.locator('#deal').click();
      await expect(seats(page)).toHaveCount(others + 1);
      await expect(page.locator('.seat[data-me]')).toHaveAttribute('data-seat', String(seat));
      await table(page);
    }
  });

  test('the deck count is a setting and it sticks', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#decks-row .count[data-decks="8"]').click();
    await page.reload();
    await page.locator('#settings-btn').click();
    await expect(page.locator('#decks-row .count[data-decks="8"]'))
      .toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('betting', () => {
  test('the steppers move the bet by one, five and twenty-five', async ({ page }) => {
    await page.locator('#bet-plus-25').click();
    await expect(page.locator('#bet-value')).toHaveText('$35');
    await page.locator('#bet-minus-5').click();
    await expect(page.locator('#bet-value')).toHaveText('$30');
    await page.locator('#bet-minus-1').click();
    await expect(page.locator('#bet-value')).toHaveText('$29');
  });

  test('the bet can never exceed the bankroll', async ({ page }) => {
    // Every step disables itself rather than clamping, so walking up until
    // nothing is enabled has to land exactly on the bankroll.
    for (const id of ['#bet-plus-25', '#bet-plus-5', '#bet-plus-1']) {
      while (await page.locator(id).isEnabled()) await page.locator(id).click();
    }
    await expect(page.locator('#bet-value')).toHaveText('$500');
  });

  test('the bet cannot go below a dollar', async ({ page }) => {
    for (const id of ['#bet-minus-25', '#bet-minus-5', '#bet-minus-1']) {
      while (await page.locator(id).isEnabled()) await page.locator(id).click();
    }
    await expect(page.locator('#bet-value')).toHaveText('$1');
  });

  test('the stake leaves the bankroll when the hand is dealt', async ({ page }) => {
    // Stacked, because a natural blackjack settles the hand on the deal and
    // the bankroll would already have moved on — about one deal in twenty.
    await stack(page, ['TS', '9D', '8H', '7C']);
    await table(page);
    await page.locator('#deal').click();
    await expect(bank(page)).toHaveText('$490');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'player');
  });
});

test.describe('playing a hand', () => {
  test('a blackjack pays three to two', async ({ page }) => {
    // Us: A,K. Dealer: 9,7. Dealt one card round at a time, we are the only
    // seat, and the dealer's hole card comes last.
    await stack(page, ['AS', '9D', 'KH', '7C']);
    await table(page);
    await page.locator('#deal').click();

    await expect(page.locator('body')).toHaveAttribute('data-phase', 'over');
    await expect(status(page)).toContainText('Blackjack!');
    // 500 - 10 stake + 10 back + 15 winnings.
    await expect(bank(page)).toHaveText('$515');
  });

  test('a dealer blackjack ends it before any decision', async ({ page }) => {
    await stack(page, ['9S', 'AD', '7H', 'KC']);
    await table(page);
    await page.locator('#deal').click();

    await expect(status(page)).toContainText('Dealer has blackjack');
    await expect(bank(page)).toHaveText('$490');
    await expect(page.locator('#hit')).toBeHidden();
  });

  test('hitting past 21 busts and pays nothing', async ({ page }) => {
    // Us 10,6 then 10. Dealer 9,7.
    await stack(page, ['TS', '9D', '6H', '7C', 'TD']);
    await table(page);
    await page.locator('#deal').click();
    await page.locator('#hit').click();

    await expect(page.locator('body')).toHaveAttribute('data-phase', 'over');
    await expect(bank(page)).toHaveText('$490');
    await expect(page.locator('.seat[data-me] .seat-out')).toHaveAttribute('data-r', 'lose');
  });

  test('standing beats a dealer who busts', async ({ page }) => {
    // Us 10,8 = 18. Dealer 9,7 = 16, draws a ten and busts.
    await stack(page, ['TS', '9D', '8H', '7C', 'TD']);
    await table(page);
    await page.locator('#deal').click();
    await page.locator('#stand').click();

    await expect(bank(page)).toHaveText('$510');
    await expect(page.locator('.seat[data-me] .seat-out')).toHaveAttribute('data-r', 'win');
  });

  test('an equal total is a push and returns the stake', async ({ page }) => {
    // Us 10,8 = 18. Dealer 9,9 = 18.
    await stack(page, ['TS', '9D', '8H', '9C']);
    await table(page);
    await page.locator('#deal').click();
    await page.locator('#stand').click();

    await expect(bank(page)).toHaveText('$500');
    await expect(page.locator('.seat[data-me] .seat-out')).toHaveAttribute('data-r', 'push');
  });

  test('doubling stakes again and takes exactly one card', async ({ page }) => {
    // Us 6,5 = 11, double into a ten. Dealer 9,7 = 16, draws a 2 to 18.
    await stack(page, ['6S', '9D', '5H', '7C', 'TD', '2C']);
    await table(page);
    await page.locator('#deal').click();
    await page.locator('#double').click();

    await expect(myCards(page)).toHaveCount(3);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'over');
    // 500 - 10 - 10 stake, then 40 back on a 21 against 18.
    await expect(bank(page)).toHaveText('$520');
  });

  test('splitting makes two hands, each carrying the bet', async ({ page }) => {
    // Us 8,8. Dealer 9,7. Split draws a 2 and a 3, then the dealer plays.
    await stack(page, ['8S', '9D', '8H', '7C', '2D', '3C', 'KD']);
    await table(page);
    await page.locator('#deal').click();
    await expect(page.locator('#split')).toBeEnabled();
    await page.locator('#split').click();

    await expect(page.locator('.seat[data-me] .hand')).toHaveCount(2);
    await expect(page.locator('.seat[data-me] .seat-bet').first()).toHaveText('$10');
    // 500 - 10 - 10 for the second hand.
    await expect(bank(page)).toHaveText('$480');
  });

  test('split is only offered on a pair', async ({ page }) => {
    await stack(page, ['8S', '9D', '5H', '7C']);
    await table(page);
    await page.locator('#deal').click();
    await expect(page.locator('#split')).toBeDisabled();
  });

  test('the hole card stays down until the dealer plays', async ({ page }) => {
    await stack(page, ['TS', '9D', '8H', '7C', '2D']);
    await table(page);
    await page.locator('#deal').click();
    await expect(page.locator('#dealer-hand .card[data-down]')).toHaveCount(1);
    await expect(page.locator('#dealer-label')).toHaveText('Dealer shows');

    await page.locator('#stand').click();
    await expect(page.locator('#dealer-hand .card[data-down]')).toHaveCount(0);
  });
});

test.describe('persistence', () => {
  test('the bankroll carries over a reload; the hand does not', async ({ page }) => {
    await page.locator('#deal').click();
    await expect(bank(page)).toHaveText('$490');
    await page.reload();
    await expect(bank(page)).toHaveText('$490');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'betting');
    await expect(page.locator('.card')).toHaveCount(0);
  });

  test('the bankroll can be reset from settings', async ({ page }) => {
    await page.locator('#deal').click();
    await page.locator('#settings-btn').click();
    await page.locator('#rebuy').click();
    await expect(bank(page)).toHaveText('$500');
  });

  test('corrupt saved state falls back to a fresh table', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.blackjack.v1', 'not json'));
    await page.reload();
    await expect(bank(page)).toHaveText('$500');
  });
});

test.describe('presentation', () => {
  test('the rules modal states the 3:2 payout and the soft-17 rule',
    async ({ page }) => {
      await page.locator('#rules-btn').click();
      await expect(page.locator('#rules')).toContainText('3 to 2');
      await expect(page.locator('#rules')).toContainText('stands on all 17s');
      await page.keyboard.press('Escape');
      await expect(page.locator('#rules')).toBeHidden();
    });

  test('cards are drawn, not fetched', async ({ page }) => {
    await page.locator('#deal').click();
    const drawn = await page.evaluate(() => {
      const c = document.querySelector('.card');
      const s = getComputedStyle(c);
      return { w: parseFloat(s.width), h: parseFloat(s.height), bg: s.backgroundColor };
    });
    expect(drawn.w).toBeGreaterThan(20);
    expect(drawn.h).toBeGreaterThan(drawn.w);
    expect(drawn.bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('a full table does not overflow', async ({ page }) => {
    await setOthers(page, 4);
    await page.locator('#deal').click();
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      const over = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight,
      }));
      const at = `${size.width}x${size.height}`;
      expect(over.x, `x at ${at}`).toBeLessThanOrEqual(0);
      expect(over.y, `y at ${at}`).toBeLessThanOrEqual(0);
    }
  });

  test('survives markup from the neighbouring release', async ({ page }) => {
    const errors = trackErrors(page);
    await page.route('**/games/blackjack/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button class="act" id="split"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#split')).toHaveCount(0);
    await page.locator('#deal').click();
    await expect(myCards(page)).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});
