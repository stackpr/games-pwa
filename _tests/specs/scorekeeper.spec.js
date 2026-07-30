const { test, expect } = require('@playwright/test');
const { clearState } = require('../helpers');

const URL = '/games/scorekeeper/';
// Must match GROUP_MS in scorekeeper.js; the pause needs to clear it.
const PAST_GROUP_WINDOW = 1100;

const score = (page, team) => page.locator(`#score-${team}`);
const history = (page, team) => page.locator(`#hist-${team}`);

async function tap(page, team, times = 1) {
  for (let i = 0; i < times; i++) await page.locator(`#tap-${team}`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('scoring', () => {
  test('starts at zero with no history', async ({ page }) => {
    await expect(score(page, 'a')).toHaveText('0');
    await expect(score(page, 'b')).toHaveText('0');
    await expect(history(page, 'a')).toHaveText('');
  });

  test('tapping adds a point, minus subtracts', async ({ page }) => {
    await tap(page, 'a', 2);
    await expect(score(page, 'a')).toHaveText('2');
    await page.locator('#minus-a').click();
    await expect(score(page, 'a')).toHaveText('1');
  });

  test('score never drops below zero and records nothing', async ({ page }) => {
    await page.locator('#minus-a').click();
    await expect(score(page, 'a')).toHaveText('0');
    await expect(history(page, 'a')).toHaveText('');
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('teams are independent', async ({ page }) => {
    await tap(page, 'a', 3);
    await expect(score(page, 'b')).toHaveText('0');
    await expect(history(page, 'b')).toHaveText('');
  });

  test('team names are editable and saved', async ({ page }) => {
    await page.locator('#name-a').fill('Hawks');
    await page.reload();
    await expect(page.locator('#name-a')).toHaveValue('Hawks');
  });
});

test.describe('tap grouping', () => {
  test('a rapid burst collapses into one entry', async ({ page }) => {
    await tap(page, 'a', 5);
    await expect(score(page, 'a')).toHaveText('5');
    await expect(history(page, 'a')).toHaveText('+5');
  });

  test('a pause longer than the window starts a new entry', async ({ page }) => {
    await tap(page, 'a', 5);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 'a', 6);
    await expect(history(page, 'a')).toHaveText('+5, +6');
    await expect(score(page, 'a')).toHaveText('11');
  });

  test('changing direction starts a new entry even within the window', async ({ page }) => {
    await tap(page, 'a', 3);
    await page.locator('#minus-a').click();
    await page.locator('#minus-a').click();
    await expect(history(page, 'a')).toHaveText('+3, -2');
    await expect(score(page, 'a')).toHaveText('1');
  });

  test('scoring the other team closes the group', async ({ page }) => {
    await tap(page, 'a', 2);
    await tap(page, 'b', 1);
    await tap(page, 'a', 1);
    await expect(history(page, 'a')).toHaveText('+2, +1');
    await expect(history(page, 'b')).toHaveText('+1');
  });

  test('slow taps never group', async ({ page }) => {
    await tap(page, 'a', 1);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 'a', 1);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 'a', 1);
    await expect(history(page, 'a')).toHaveText('+1, +1, +1');
  });
});

test.describe('undo', () => {
  test('undo reverts a whole group, not one tap', async ({ page }) => {
    await tap(page, 'a', 5);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 'a', 3);

    await page.locator('#undo').click();
    await expect(score(page, 'a')).toHaveText('5');
    await expect(history(page, 'a')).toHaveText('+5');

    await page.locator('#undo').click();
    await expect(score(page, 'a')).toHaveText('0');
    await expect(history(page, 'a')).toHaveText('');
  });

  test('undo of a burst still inside its window clears the burst', async ({ page }) => {
    await tap(page, 'a', 4);
    await page.locator('#undo').click();
    await expect(score(page, 'a')).toHaveText('0');
    await expect(history(page, 'a')).toHaveText('');
  });

  test('undo only touches the most recent group', async ({ page }) => {
    await tap(page, 'a', 2);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 'b', 3);

    await page.locator('#undo').click();
    await expect(score(page, 'a')).toHaveText('2');
    await expect(score(page, 'b')).toHaveText('0');
    await expect(history(page, 'b')).toHaveText('');
  });

  test('undo is disabled with nothing to undo', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
    await tap(page, 'a', 1);
    await expect(page.locator('#undo')).toBeEnabled();
    await page.locator('#undo').click();
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('a tap after undo starts a fresh, undoable group', async ({ page }) => {
    await tap(page, 'a', 2);
    await page.locator('#undo').click();
    await tap(page, 'a', 1);
    await expect(history(page, 'a')).toHaveText('+1');
    await expect(page.locator('#undo')).toBeEnabled();
    await page.locator('#undo').click();
    await expect(score(page, 'a')).toHaveText('0');
  });
});

test.describe('reset', () => {
  test('reset clears both teams and is undoable', async ({ page }) => {
    await tap(page, 'a', 3);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 'b', 2);

    page.once('dialog', d => d.accept());
    await page.locator('#reset').click();
    await expect(score(page, 'a')).toHaveText('0');
    await expect(score(page, 'b')).toHaveText('0');
    await expect(history(page, 'a')).toHaveText('');

    await page.locator('#undo').click();
    await expect(score(page, 'a')).toHaveText('3');
    await expect(score(page, 'b')).toHaveText('2');
    await expect(history(page, 'a')).toHaveText('+3');
  });

  test('cancelling the confirm leaves the score alone', async ({ page }) => {
    await tap(page, 'a', 3);
    page.once('dialog', d => d.dismiss());
    await page.locator('#reset').click();
    await expect(score(page, 'a')).toHaveText('3');
  });
});

test.describe('persistence', () => {
  test('score and history survive a reload', async ({ page }) => {
    await tap(page, 'a', 3);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 'a', 2);

    await page.reload();
    await expect(score(page, 'a')).toHaveText('5');
    await expect(history(page, 'a')).toHaveText('+3, +2');
  });

  test('a group never spans a reload', async ({ page }) => {
    // Restored history has no undo snapshot, so merging into it would make
    // the new tap impossible to undo.
    await tap(page, 'a', 3);
    await page.reload();
    await tap(page, 'a', 1);
    await expect(history(page, 'a')).toHaveText('+3, +1');
    await expect(page.locator('#undo')).toBeEnabled();
  });

  test('state lives under a namespaced key', async ({ page }) => {
    await tap(page, 'a', 1);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain('games.scorekeeper.v1');
  });

  test('corrupt saved state falls back to a clean game', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.scorekeeper.v1', '{"a":"oops","events":42}'));
    await page.reload();
    await expect(score(page, 'a')).toHaveText('0');
    await expect(history(page, 'a')).toHaveText('');
  });
});

test.describe('history line layout', () => {
  test('stays on one line, newest right, older clipped left', async ({ page }) => {
    for (let i = 0; i < 25; i++) {
      await tap(page, 'a', 1);
      await page.waitForTimeout(PAST_GROUP_WINDOW);
    }

    const geo = await page.evaluate(() => {
      const box = document.querySelector('.team-a .history');
      const span = document.getElementById('hist-a');
      const b = box.getBoundingClientRect();
      const s = span.getBoundingClientRect();
      const style = getComputedStyle(box);
      return {
        lines: Math.round(s.height / parseFloat(getComputedStyle(span).lineHeight)),
        overflows: s.width > b.width,
        flushRight: Math.abs(s.right - (b.right - parseFloat(style.paddingRight))) <= 1,
        clippedLeft: s.left < b.left,
        hidden: style.overflow === 'hidden',
      };
    });

    expect(geo.lines).toBe(1);
    expect(geo.overflows).toBe(true);
    expect(geo.flushRight).toBe(true);
    expect(geo.clippedLeft).toBe(true);
    expect(geo.hidden).toBe(true);
  });

  test('history sits between the team name and the score', async ({ page }) => {
    await tap(page, 'a', 1);
    const order = await page.evaluate(() => {
      const r = sel => document.querySelector(sel).getBoundingClientRect();
      return {
        nameBottom: r('#name-a').bottom,
        histTop: r('.team-a .history').top,
        histBottom: r('.team-a .history').bottom,
        scoreTop: r('#score-a').top,
      };
    });
    expect(order.histTop).toBeGreaterThanOrEqual(order.nameBottom - 1);
    expect(order.histBottom).toBeLessThanOrEqual(order.scoreTop + 1);
  });

  test('the page never scrolls sideways', async ({ page }) => {
    for (let i = 0; i < 12; i++) {
      await tap(page, 'a', 1);
      await page.waitForTimeout(PAST_GROUP_WINDOW);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
