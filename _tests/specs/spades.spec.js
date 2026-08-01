const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/spades/';

const step = (page, kind, seat, dir) =>
  page.locator(`.step[data-kind="${kind}"][data-seat="${seat}"][data-dir="${dir}"]`);
const bidValue = (page, seat) => page.locator(`.value[data-kind="bid"][data-seat="${seat}"]`);
const total = (page, team) => page.locator(`#total-${team}`);
const cell = (page, team, what) => page.locator(`#rows .${what}[data-team="${team}"]`);

/** Nudges a stepper `n` times; negative goes down. */
async function nudge(page, kind, seat, n) {
  const dir = n > 0 ? 'up' : 'down';
  for (let i = 0; i < Math.abs(n); i++) await step(page, kind, seat, dir).click();
}

/** Bids default to 3, so this walks each seat to the value asked for. */
async function setBids(page, bids) {
  for (let seat = 0; seat < 4; seat++) {
    // The ladder is Blind, Nil, 1..13 — so index, not value, is the distance.
    const ladder = ['blind', 'nil'].concat(
      Array.from({ length: 13 }, (_, i) => i + 1));
    const want = ladder.indexOf(bids[seat]);
    const from = ladder.indexOf(3);
    await nudge(page, 'bid', seat, want - from);
  }
}

/**
 * Enters what each seat took. A team with no nil has one stepper, on the
 * lower of its two seats, so the partner's tricks are added there.
 */
async function setTricks(page, tricks) {
  const owners = await page.evaluate(() =>
    [...document.querySelectorAll('.took-cell')].map(c => Number(c.dataset.seat)));
  for (const seat of owners) {
    const partner = seat < 2 ? seat + 2 : seat - 2;
    const n = owners.includes(partner) ? tricks[seat] : tricks[seat] + tricks[partner];
    await nudge(page, 'tricks', seat, n);
  }
}

/** A whole hand: bid, lock, enter what was taken, score. */
async function playRound(page, bids, tricks) {
  await setBids(page, bids);
  await page.locator('#commit').click();
  await setTricks(page, tricks);
  await page.locator('#commit').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the sheet', () => {
  test('starts empty with both teams on zero', async ({ page }) => {
    await expect(page.locator('#rows tr')).toHaveCount(0);
    await expect(total(page, 1)).toHaveText('0');
    await expect(total(page, 2)).toHaveText('0');
    await expect(page.locator('#empty')).toBeVisible();
  });

  test('a scored round becomes a row showing both teams', async ({ page }) => {
    await playRound(page, [4, 2, 3, 4], [4, 2, 3, 4]);

    await expect(page.locator('#rows tr')).toHaveCount(1);
    // Partners sit across: team 1 is seats 1 and 3.
    await expect(cell(page, 1, 'bids')).toHaveText('4 / 3');
    await expect(cell(page, 2, 'bids')).toHaveText('2 / 4');
    await expect(page.locator('#empty')).toBeHidden();
  });

  test('totals accumulate across rounds', async ({ page }) => {
    for (let r = 0; r < 2; r++) {
      await playRound(page, [4, 2, 3, 4], [4, 2, 3, 4]);
    }
    await expect(page.locator('#rows tr')).toHaveCount(2);
    await expect(total(page, 1)).toHaveText('140');   // 70 twice
    await expect(total(page, 2)).toHaveText('120');   // 60 twice
  });

  test('undo removes the last round only', async ({ page }) => {
    await playRound(page, [4, 2, 3, 4], [4, 2, 3, 4]);
    await playRound(page, [1, 1, 1, 1], [1, 1, 1, 1]);

    await expect(page.locator('#rows tr')).toHaveCount(2);
    await page.locator('#undo').click();
    await expect(page.locator('#rows tr')).toHaveCount(1);
    await expect(total(page, 1)).toHaveText('70');
  });
});

test.describe('bidding', () => {
  test('steps down through nil to blind nil, and stops there', async ({ page }) => {
    await expect(bidValue(page, 0)).toHaveText('3');
    await nudge(page, 'bid', 0, -2);
    await expect(bidValue(page, 0)).toHaveText('1');
    await nudge(page, 'bid', 0, -1);
    await expect(bidValue(page, 0)).toHaveText('Nil');
    await nudge(page, 'bid', 0, -1);
    await expect(bidValue(page, 0)).toHaveText('Blind');
    // Blind nil is the floor.
    await expect(step(page, 'bid', 0, 'down')).toBeDisabled();
  });

  test('stops at thirteen going up', async ({ page }) => {
    await nudge(page, 'bid', 0, 10);
    await expect(bidValue(page, 0)).toHaveText('13');
    await expect(step(page, 'bid', 0, 'up')).toBeDisabled();
  });

  test('tricks run zero to thirteen, once the bids are locked', async ({ page }) => {
    await page.locator('#commit').click();
    await expect(step(page, 'tricks', 0, 'down')).toBeDisabled();
    await nudge(page, 'tricks', 0, 13);
    await expect(step(page, 'tricks', 0, 'up')).toBeDisabled();
  });
});

test.describe('the two phases', () => {
  test('tricks are hidden until the bids are locked', async ({ page }) => {
    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'bidding');
    await expect(page.locator('.took-cell').first()).toBeHidden();
    await expect(page.locator('#commit')).toHaveText('Lock bids');

    await page.locator('#commit').click();
    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'playing');
    await expect(page.locator('.took-cell').first()).toBeVisible();
    await expect(page.locator('#commit')).toHaveText('Score round');
  });

  test('locking the bids freezes them', async ({ page }) => {
    await setBids(page, [5, 3, 3, 3]);
    await page.locator('#commit').click();
    await expect(step(page, 'bid', 0, 'up')).toBeDisabled();
    await expect(step(page, 'bid', 0, 'down')).toBeDisabled();
    await expect(bidValue(page, 0)).toHaveText('5');
  });

  test('Edit bids reopens them without losing them', async ({ page }) => {
    await setBids(page, [5, 3, 3, 3]);
    await page.locator('#commit').click();
    await page.locator('#edit-bids').click();

    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'bidding');
    await expect(bidValue(page, 0)).toHaveText('5');
    await expect(step(page, 'bid', 0, 'up')).toBeEnabled();
    await expect(page.locator('.took-cell').first()).toBeHidden();
  });

  test('Edit bids is offered only while playing', async ({ page }) => {
    await expect(page.locator('#edit-bids')).toBeHidden();
    await page.locator('#commit').click();
    await expect(page.locator('#edit-bids')).toBeVisible();
  });

  test('scoring returns to bidding for the next round', async ({ page }) => {
    await playRound(page, [4, 2, 3, 4], [4, 2, 3, 4]);
    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'bidding');
    await expect(page.locator('#commit')).toHaveText('Lock bids');
    // A fresh hand, not the last one left on screen.
    await expect(bidValue(page, 0)).toHaveText('3');
    await expect(page.locator('.value[data-kind="tricks"][data-seat="0"]')).toHaveText('0');
  });
});

test.describe('entering the tricks taken', () => {
  const owners = page => page.evaluate(() =>
    [...document.querySelectorAll('.took-cell')].map(c => ({
      seat: Number(c.dataset.seat),
      name: c.querySelector('.took-name').textContent,
    })));

  test('no nil means one combined number per team', async ({ page }) => {
    await setBids(page, [4, 2, 3, 4]);
    await page.locator('#commit').click();
    expect(await owners(page)).toEqual([
      { seat: 0, name: 'Team 1' },
      { seat: 1, name: 'Team 2' },
    ]);
  });

  test('a nil splits that team, and only that team', async ({ page }) => {
    await setBids(page, [4, 'nil', 3, 4]);
    await page.locator('#commit').click();
    expect(await owners(page)).toEqual([
      { seat: 0, name: 'Team 1' },
      { seat: 1, name: 'P2 · Nil' },
      { seat: 3, name: 'P4' },
    ]);
  });

  test('blind nil splits it too', async ({ page }) => {
    await setBids(page, [3, 3, 'blind', 3]);
    await page.locator('#commit').click();
    expect(await owners(page)).toEqual([
      { seat: 0, name: 'P1' },
      { seat: 2, name: 'P3 · Blind' },
      { seat: 1, name: 'Team 2' },
    ]);
  });

  test('a combined count scores the same as the split one', async ({ page }) => {
    // Team 1 bid 7 between them and took 8: 70 for the contract, 1 over.
    await setBids(page, [4, 2, 3, 4]);
    await page.locator('#commit').click();
    await nudge(page, 'tricks', 0, 8);
    await page.locator('#commit').click();
    await expect(total(page, 1)).toHaveText('71');
  });

  test('editing the bids into a nil reshapes the row and keeps the count',
    async ({ page }) => {
      await setBids(page, [4, 2, 3, 4]);
      await page.locator('#commit').click();
      await nudge(page, 'tricks', 1, 6);

      await page.locator('#edit-bids').click();
      await nudge(page, 'bid', 1, -2);          // team 2's seat 1 goes nil
      await page.locator('#commit').click();

      expect((await owners(page)).map(o => o.seat)).toEqual([0, 1, 3]);
      // The six already entered stay on the seat that held them.
      await expect(page.locator('.value[data-kind="tricks"][data-seat="1"]'))
        .toHaveText('6');
    });

  test('dropping a nil folds the partners back into one count', async ({ page }) => {
    await setBids(page, [4, 'nil', 3, 4]);
    await page.locator('#commit').click();
    await nudge(page, 'tricks', 1, 2);
    await nudge(page, 'tricks', 3, 4);

    await page.locator('#edit-bids').click();
    await nudge(page, 'bid', 1, 3);             // back to an ordinary bid
    await page.locator('#commit').click();

    expect((await owners(page)).map(o => o.seat)).toEqual([0, 1]);
    await expect(page.locator('.value[data-kind="tricks"][data-seat="1"]'))
      .toHaveText('6');
  });
});

test.describe('scoring', () => {
  const cases = [
    {
      name: 'making the contract is ten a trick',
      bids: [4, 2, 3, 4], tricks: [4, 2, 3, 4], t1: '70', t2: '60',
    },
    {
      name: 'overtricks are worth one each',
      bids: [4, 2, 3, 4], tricks: [5, 2, 4, 4], t1: '72', t2: '60',
    },
    {
      name: 'being set costs ten a bid trick',
      bids: [5, 2, 3, 4], tricks: [2, 3, 2, 5], t1: '-80', t2: '62',
    },
    {
      name: 'a made nil is worth a hundred on top',
      bids: ['nil', 2, 5, 4], tricks: [0, 2, 6, 4], t1: '151', t2: '60',
    },
    {
      name: 'a failed nil costs a hundred but its tricks still count',
      bids: ['nil', 2, 5, 4], tricks: [1, 2, 5, 4], t1: '-49', t2: '60',
    },
    {
      name: 'blind nil doubles it',
      bids: ['blind', 2, 4, 4], tricks: [0, 2, 4, 4], t1: '240', t2: '60',
    },
  ];

  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await playRound(page, c.bids, c.tricks);
      await expect(total(page, 1)).toHaveText(c.t1);
      await expect(total(page, 2)).toHaveText(c.t2);
    });
  }

  test('a negative round is marked as a loss', async ({ page }) => {
    await playRound(page, [5, 2, 3, 4], [2, 3, 2, 5]);
    await expect(cell(page, 1, 'pts')).toHaveAttribute('data-sign', 'down');
    await expect(cell(page, 2, 'pts')).not.toHaveAttribute('data-sign', 'down');
  });
});

test.describe('the deal', () => {
  test('P1 deals first and it rotates a seat each round', async ({ page }) => {
    const dealer = () => page.evaluate(() =>
      [...document.querySelectorAll('.seat-name')]
        .findIndex(s => s.querySelector('.deal').textContent.trim() !== ''));

    expect(await dealer()).toBe(0);
    for (const expected of [1, 2, 3, 0]) {
      await playRound(page, [3, 3, 3, 3], [3, 3, 3, 3]);
      expect(await dealer()).toBe(expected);
    }
  });
});

test.describe('persistence', () => {
  test('rounds survive a reload', async ({ page }) => {
    await playRound(page, [4, 2, 3, 4], [4, 2, 3, 4]);
    await page.reload();
    await expect(page.locator('#rows tr')).toHaveCount(1);
    await expect(total(page, 1)).toHaveText('70');
  });

  test('scored rounds and the hand in progress are both stored', async ({ page }) => {
    await playRound(page, [4, 2, 3, 4], [4, 2, 3, 4]);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('games.spades.v1')));
    // Neither team bid nil, so each pair's tricks are stored on the seat
    // that owned the stepper. scoreTeam sums them either way.
    expect(saved.rounds).toEqual([{ bids: [4, 2, 3, 4], tricks: [7, 6, 0, 0] }]);
    expect(saved.draft).toEqual({ phase: 'bidding', bids: [3, 3, 3, 3], tricks: [0, 0, 0, 0] });
  });

  test('locked bids survive a reload mid-hand', async ({ page }) => {
    // The hand is played away from the phone, so losing the bids to a screen
    // lock would be the whole point of the app failing.
    await setBids(page, [5, 'nil', 2, 4]);
    await page.locator('#commit').click();
    await nudge(page, 'tricks', 0, 3);

    await page.reload();
    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'playing');
    await expect(bidValue(page, 0)).toHaveText('5');
    await expect(bidValue(page, 1)).toHaveText('Nil');
    await expect(page.locator('.value[data-kind="tricks"][data-seat="0"]')).toHaveText('3');
  });

  test('corrupt saved state falls back to an empty sheet', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.spades.v1', 'not json'));
    await page.reload();
    await expect(page.locator('#rows tr')).toHaveCount(0);
    await expect(total(page, 1)).toHaveText('0');
  });
});

test.describe('presentation', { tag: '@layout' }, () => {
  test('the scoring modal explains the rules', async ({ page }) => {
    await expect(page.locator('#rules')).toBeHidden();
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toBeVisible();
    await expect(page.locator('#rules')).toContainText('Nil');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('nothing overflows sideways', async ({ page }) => {
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `${size.width}x${size.height}`).toBeLessThanOrEqual(0);
    }
  });
});
