const { test, expect } = require('@playwright/test');
const { clearState } = require('../helpers');

const URL = '/games/scorekeeper/';
// Must match GROUP_MS in scorekeeper.js; the pause needs to clear it.
const PAST_GROUP_WINDOW = 1100;

const score = (page, seat) => page.locator(`#score-${seat}`);
const history = (page, seat) => page.locator(`#hist-${seat}`);

async function tap(page, seat, times = 1) {
  for (let i = 0; i < times; i++) await page.locator(`#tap-${seat}`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('scoring', { tag: '@layout' }, () => {
  test('starts at zero with no history', async ({ page }) => {
    await expect(score(page, 0)).toHaveText('0');
    await expect(score(page, 1)).toHaveText('0');
    await expect(history(page, 0)).toHaveText('');
  });

  test('tapping adds a point, minus subtracts', async ({ page }) => {
    await tap(page, 0, 2);
    await expect(score(page, 0)).toHaveText('2');
    await page.locator('#minus-0').click();
    await expect(score(page, 0)).toHaveText('1');
  });

  test('score never drops below zero and records nothing', async ({ page }) => {
    await page.locator('#minus-0').click();
    await expect(score(page, 0)).toHaveText('0');
    await expect(history(page, 0)).toHaveText('');
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('teams are independent', async ({ page }) => {
    await tap(page, 0, 3);
    await expect(score(page, 1)).toHaveText('0');
    await expect(history(page, 1)).toHaveText('');
  });

  test('names are editable and saved', async ({ page }) => {
    await page.locator('#name-0').fill('Hawks');
    await page.reload();
    await expect(page.locator('#name-0')).toHaveValue('Hawks');
  });

  test('a long name is truncated rather than widening the seat', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('.count[data-count="8"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#name-0').fill('Bartholomew Fitzgerald');

    const m = await page.evaluate(() => {
      const input = document.getElementById('name-0');
      const seat = input.closest('.seat');
      return {
        nameWidth: input.getBoundingClientRect().width,
        seatWidth: seat.getBoundingClientRect().width,
        clipped: input.scrollWidth > input.clientWidth,
        ellipsis: getComputedStyle(input).textOverflow,
        ox: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(m.nameWidth).toBeLessThanOrEqual(m.seatWidth + 1);
    expect(m.clipped, 'the text really does overflow its box').toBe(true);
    expect(m.ellipsis).toBe('ellipsis');
    expect(m.ox, 'and the page still does not scroll sideways').toBeLessThanOrEqual(0);
  });

  test('naming is optional — an empty seat falls back to its number', async ({ page }) => {
    await expect(page.locator('#name-0')).toHaveValue('Player 1');
    await expect(page.locator('#name-1')).toHaveValue('Player 2');
    // Clearing it leaves the number showing rather than a blank bar.
    await page.locator('#name-0').fill('');
    await expect(page.locator('#name-0')).toHaveAttribute('placeholder', 'Player 1');
    await page.reload();
    await expect(page.locator('#name-0')).toHaveValue('');
    await expect(page.locator('#name-0')).toHaveAttribute('placeholder', 'Player 1');
  });
});

test.describe('the +5 button', { tag: '@layout' }, () => {
  test('adds five and records one entry', async ({ page }) => {
    await page.locator('#plus5-0').click();
    await expect(score(page, 0)).toHaveText('5');
    await expect(history(page, 0)).toHaveText('+5');
  });

  test('is indistinguishable from five taps', async ({ page }) => {
    // The whole contract: same score, same history, same undo depth.
    await page.locator('#plus5-0').click();
    await tap(page, 1, 5);
    await expect(score(page, 0)).toHaveText(await score(page, 1).innerText());
    await expect(history(page, 0)).toHaveText(await history(page, 1).innerText());
  });

  test('+5 then +1 reads as +6, not two entries', async ({ page }) => {
    await page.locator('#plus5-0').click();
    await tap(page, 0);
    await expect(score(page, 0)).toHaveText('6');
    await expect(history(page, 0)).toHaveText('+6');
  });

  test('+1 then +5 also merges', async ({ page }) => {
    await tap(page, 0);
    await page.locator('#plus5-0').click();
    await expect(score(page, 0)).toHaveText('6');
    await expect(history(page, 0)).toHaveText('+6');
  });

  test('a pause closes the group, exactly as with taps', async ({ page }) => {
    await page.locator('#plus5-0').click();
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 0);
    await expect(score(page, 0)).toHaveText('6');
    await expect(history(page, 0)).toHaveText('+5, +1');
  });

  test('undo reverts the whole group a +5 opened', async ({ page }) => {
    await page.locator('#plus5-0').click();
    await tap(page, 0);
    await page.locator('#undo').click();
    await expect(score(page, 0)).toHaveText('0');
    await expect(history(page, 0)).toHaveText('');
  });

  test('a minus closes the group rather than merging', async ({ page }) => {
    // Opposite signs never group, so +5 then -1 stays two entries.
    await page.locator('#plus5-0').click();
    await page.locator('#minus-0').click();
    await expect(score(page, 0)).toHaveText('4');
    await expect(history(page, 0)).toHaveText('+5, -1');
  });

  test('the two halves split the strip side by side', async ({ page }) => {
    const boxes = await page.evaluate(() => {
      const r = id => {
        const b = document.getElementById(id).getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, width: b.width, height: b.height };
      };
      return { minus: r('minus-0'), plus: r('plus5-0') };
    });

    expect(boxes.minus.right, '-1 sits left of +5').toBeLessThanOrEqual(boxes.plus.left + 1);
    expect(Math.abs(boxes.minus.top - boxes.plus.top), 'same row').toBeLessThan(1);
    expect(Math.abs(boxes.minus.width - boxes.plus.width), 'equal halves').toBeLessThan(3);
    // Half the width, so it needs the height back to stay thumb-sized.
    expect(boxes.minus.height, 'tall enough to hit').toBeGreaterThan(52);
  });

  test('each team has its own +5', async ({ page }) => {
    await page.locator('#plus5-1').click();
    await expect(score(page, 1)).toHaveText('5');
    await expect(score(page, 0)).toHaveText('0');
  });
});

test.describe('tap grouping', () => {
  test('a rapid burst collapses into one entry', async ({ page }) => {
    await tap(page, 0, 5);
    await expect(score(page, 0)).toHaveText('5');
    await expect(history(page, 0)).toHaveText('+5');
  });

  test('a pause longer than the window starts a new entry', async ({ page }) => {
    await tap(page, 0, 5);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 0, 6);
    await expect(history(page, 0)).toHaveText('+5, +6');
    await expect(score(page, 0)).toHaveText('11');
  });

  test('changing direction starts a new entry even within the window', async ({ page }) => {
    await tap(page, 0, 3);
    await page.locator('#minus-0').click();
    await page.locator('#minus-0').click();
    await expect(history(page, 0)).toHaveText('+3, -2');
    await expect(score(page, 0)).toHaveText('1');
  });

  test('scoring the other team closes the group', async ({ page }) => {
    await tap(page, 0, 2);
    await tap(page, 1, 1);
    await tap(page, 0, 1);
    await expect(history(page, 0)).toHaveText('+2, +1');
    await expect(history(page, 1)).toHaveText('+1');
  });

  test('slow taps never group', async ({ page }) => {
    await tap(page, 0, 1);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 0, 1);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 0, 1);
    await expect(history(page, 0)).toHaveText('+1, +1, +1');
  });
});

test.describe('undo', () => {
  test('undo reverts a whole group, not one tap', async ({ page }) => {
    await tap(page, 0, 5);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 0, 3);

    await page.locator('#undo').click();
    await expect(score(page, 0)).toHaveText('5');
    await expect(history(page, 0)).toHaveText('+5');

    await page.locator('#undo').click();
    await expect(score(page, 0)).toHaveText('0');
    await expect(history(page, 0)).toHaveText('');
  });

  test('undo of a burst still inside its window clears the burst', async ({ page }) => {
    await tap(page, 0, 4);
    await page.locator('#undo').click();
    await expect(score(page, 0)).toHaveText('0');
    await expect(history(page, 0)).toHaveText('');
  });

  test('undo only touches the most recent group', async ({ page }) => {
    await tap(page, 0, 2);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 1, 3);

    await page.locator('#undo').click();
    await expect(score(page, 0)).toHaveText('2');
    await expect(score(page, 1)).toHaveText('0');
    await expect(history(page, 1)).toHaveText('');
  });

  test('undo is disabled with nothing to undo', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
    await tap(page, 0, 1);
    await expect(page.locator('#undo')).toBeEnabled();
    await page.locator('#undo').click();
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('a tap after undo starts a fresh, undoable group', async ({ page }) => {
    await tap(page, 0, 2);
    await page.locator('#undo').click();
    await tap(page, 0, 1);
    await expect(history(page, 0)).toHaveText('+1');
    await expect(page.locator('#undo')).toBeEnabled();
    await page.locator('#undo').click();
    await expect(score(page, 0)).toHaveText('0');
  });
});

test.describe('reset', () => {
  test('reset clears both teams and is undoable', async ({ page }) => {
    await tap(page, 0, 3);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 1, 2);

    page.once('dialog', d => d.accept());
    await page.locator('#reset').click();
    await expect(score(page, 0)).toHaveText('0');
    await expect(score(page, 1)).toHaveText('0');
    await expect(history(page, 0)).toHaveText('');

    await page.locator('#undo').click();
    await expect(score(page, 0)).toHaveText('3');
    await expect(score(page, 1)).toHaveText('2');
    await expect(history(page, 0)).toHaveText('+3');
  });

  test('cancelling the confirm leaves the score alone', async ({ page }) => {
    await tap(page, 0, 3);
    page.once('dialog', d => d.dismiss());
    await page.locator('#reset').click();
    await expect(score(page, 0)).toHaveText('3');
  });
});

test.describe('persistence', () => {
  test('score and history survive a reload', async ({ page }) => {
    await tap(page, 0, 3);
    await page.waitForTimeout(PAST_GROUP_WINDOW);
    await tap(page, 0, 2);

    await page.reload();
    await expect(score(page, 0)).toHaveText('5');
    await expect(history(page, 0)).toHaveText('+3, +2');
  });

  test('a group never spans a reload', async ({ page }) => {
    // Restored history has no undo snapshot, so merging into it would make
    // the new tap impossible to undo.
    await tap(page, 0, 3);
    await page.reload();
    await tap(page, 0, 1);
    await expect(history(page, 0)).toHaveText('+3, +1');
    await expect(page.locator('#undo')).toBeEnabled();
  });

  test('state lives under a namespaced key', async ({ page }) => {
    await tap(page, 0, 1);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain('games.scorekeeper.v2');
  });

  test('corrupt saved state falls back to a clean game', async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem('games.scorekeeper.v2', '{"scores":"oops","events":42}'));
    await page.reload();
    await expect(score(page, 0)).toHaveText('0');
    await expect(history(page, 0)).toHaveText('');
  });

  test('a two-team save from the old shape is carried forward', async ({ page }) => {
    // The v1 shape was {a, b, nameA, nameB} with events keyed by team.
    await page.evaluate(() => {
      localStorage.removeItem('games.scorekeeper.v2');
      localStorage.setItem('games.scorekeeper.v1', JSON.stringify({
        a: 7, b: 3, nameA: 'Hawks', nameB: 'Owls',
        events: [{ team: 'a', delta: 7, t: 1 }, { team: 'b', delta: 3, t: 2 }],
      }));
    });
    await page.reload();

    await expect(score(page, 0)).toHaveText('7');
    await expect(score(page, 1)).toHaveText('3');
    await expect(page.locator('#name-0')).toHaveValue('Hawks');
    await expect(history(page, 0)).toHaveText('+7');
    await expect(history(page, 1)).toHaveText('+3');
    // Converted once and written under the new key.
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain('games.scorekeeper.v2');
  });
});

test.describe('more players', { tag: '@layout' }, () => {
  const setCount = async (page, n) => {
    await page.locator('#settings-btn').click();
    await page.locator(`.count[data-count="${n}"]`).click();
  };

  test('offers two to eight', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await expect(page.locator('.count')).toHaveCount(7);
    await expect(page.locator('.count[data-count="2"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('adding players adds seats, each starting at zero', async ({ page }) => {
    await tap(page, 0, 3);
    await setCount(page, 8);
    await expect(page.locator('.seat')).toHaveCount(8);
    await expect(score(page, 7)).toHaveText('0');
    // Existing scores are kept rather than wiped.
    await expect(score(page, 0)).toHaveText('3');
  });

  test('every seat scores independently', async ({ page }) => {
    await setCount(page, 6);
    await tap(page, 4, 2);
    await page.locator('#plus5-5').click();
    await expect(score(page, 4)).toHaveText('2');
    await expect(score(page, 5)).toHaveText('5');
    await expect(score(page, 0)).toHaveText('0');
  });

  test('two a row upright, four across in landscape', async ({ page }) => {
    await setCount(page, 8);

    // Polled, not read once: the relayout runs off a matchMedia change event,
    // which lands a tick after the viewport actually changes.
    const grid = () => page.evaluate(() => ({
      cols: getComputedStyle(document.getElementById('board'))
        .gridTemplateColumns.split(' ').length,
      rows: document.getElementById('board').dataset.rows,
    }));

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(grid).toEqual({ cols: 2, rows: '4' });

    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(grid).toEqual({ cols: 4, rows: '2' });
  });

  test('two players still fill the row rather than leaving a gap', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    const cols = await page.evaluate(() => getComputedStyle(document.getElementById('board'))
      .gridTemplateColumns.split(' ').length);
    expect(cols).toBe(2);
  });

  test('eight seats fit on screen in both orientations', async ({ page }) => {
    await setCount(page, 8);
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 },
      { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const m = await page.evaluate(() => ({
        ox: document.documentElement.scrollWidth - window.innerWidth,
        oy: document.documentElement.scrollHeight - window.innerHeight,
        smallest: Math.min(...[...document.querySelectorAll('.seat')]
          .map(s => s.getBoundingClientRect().height)),
      }));
      const at = `${size.width}x${size.height}`;
      expect(m.ox, `x overflow at ${at}`).toBeLessThanOrEqual(0);
      expect(m.oy, `y overflow at ${at}`).toBeLessThanOrEqual(0);
      expect(m.smallest, `seats stay usable at ${at}`).toBeGreaterThan(60);
    }
  });

  test('the number never collides with the rest of the seat', async ({ page }) => {
    // A fraction of the row height is not enough for the score: the name,
    // history and buttons do not shrink with the rows, so the number ended
    // up drawn straight over the "tap to score" hint in landscape.
    for (const [w, h, n] of [[390, 844, 2], [390, 844, 8], [844, 390, 8],
      [320, 568, 8], [844, 390, 2]]) {
      await setCount(page, n);
      await page.setViewportSize({ width: w, height: h });
      const m = await expect.poll(async () => page.evaluate(() => {
        const score = document.getElementById('score-0').getBoundingClientRect();
        const adjust = document.querySelector('.adjust').getBoundingClientRect();
        const history = document.querySelector('.history').getBoundingClientRect();
        return {
          belowHistory: score.top >= history.bottom - 1,
          aboveButtons: score.bottom <= adjust.top + 1,
          oy: document.documentElement.scrollHeight - window.innerHeight,
        };
      })).toEqual({ belowHistory: true, aboveButtons: true, oy: 0 });
    }
  });

  test('the count survives a reload', async ({ page }) => {
    await setCount(page, 5);
    await page.reload();
    await expect(page.locator('.seat')).toHaveCount(5);
  });

  test('dropping a scored player asks first', async ({ page }) => {
    await setCount(page, 4);
    await tap(page, 3, 2);
    page.once('dialog', d => d.dismiss());
    await setCount(page, 2);
    await expect(page.locator('.seat')).toHaveCount(4);

    page.once('dialog', d => d.accept());
    await setCount(page, 2);
    await expect(page.locator('.seat')).toHaveCount(2);
  });
});

test.describe('history line layout', { tag: '@layout' }, () => {
  test('stays on one line, newest right, older clipped left', async ({ page }) => {
    for (let i = 0; i < 25; i++) {
      await tap(page, 0, 1);
      await page.waitForTimeout(PAST_GROUP_WINDOW);
    }

    const geo = await page.evaluate(() => {
      const box = document.querySelector('.seat[data-seat="0"] .history');
      const span = document.getElementById('hist-0');
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
    await tap(page, 0, 1);
    const order = await page.evaluate(() => {
      const r = sel => document.querySelector(sel).getBoundingClientRect();
      return {
        nameBottom: r('#name-0').bottom,
        histTop: r('.seat[data-seat="0"] .history').top,
        histBottom: r('.seat[data-seat="0"] .history').bottom,
        scoreTop: r('#score-0').top,
      };
    });
    expect(order.histTop).toBeGreaterThanOrEqual(order.nameBottom - 1);
    expect(order.histBottom).toBeLessThanOrEqual(order.scoreTop + 1);
  });

  test('the page never scrolls sideways', async ({ page }) => {
    for (let i = 0; i < 12; i++) {
      await tap(page, 0, 1);
      await page.waitForTimeout(PAST_GROUP_WINDOW);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
