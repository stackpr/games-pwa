const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/ten-thousand/';

const body = page => page.locator('body');
const status = page => page.locator('#status-text');
const die = (page, i) => page.locator(`.die[data-index="${i}"]`);
const seatScore = (page, i) => page.locator(`.seat[data-seat="${i}"] .seat-score`);

/**
 * Forces the faces of the next roll(s). ten-thousand.js draws every face before it
 * touches Math.random for the physics, so stubbing the head of the sequence
 * is enough — and under reduced motion there is no physics at all, so the
 * queue maps one-to-one onto successive rolls.
 */
async function forceFaces(page, faces) {
  await page.addInitScript(list => {
    const real = Math.random;
    const queue = list.slice();
    Math.random = () => (queue.length ? (queue.shift() - 1) / 6 + 0.01 : real());
  }, faces);
  await page.reload();
}

async function roll(page) {
  await page.locator('#roll').click();
  await expect(body(page)).toHaveAttribute('data-phase', /picking|bust|over/);
}

test.beforeEach(async ({ page }) => {
  // Reduced motion skips the bounce, so the logic specs are deterministic
  // and fast. The animation has its own describe block below.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await clearState(page);
});

test.describe('setup', () => {
  test('starts with two players, nobody scoring, P1 to roll', async ({ page }) => {
    await expect(page.locator('.seat')).toHaveCount(2);
    await expect(seatScore(page, 0)).toHaveText('0');
    await expect(seatScore(page, 1)).toHaveText('0');
    await expect(status(page)).toHaveText('P1 to roll');
    await expect(body(page)).toHaveAttribute('data-phase', 'idle');
  });

  test('the active seat is marked', async ({ page }) => {
    await expect(page.locator('.seat[data-active]')).toHaveCount(1);
    await expect(page.locator('.seat[data-seat="0"]')).toHaveAttribute('data-active', '');
  });

  test('only Roll! is offered before the first roll', async ({ page }) => {
    await expect(page.locator('#roll')).toBeVisible();
    await expect(page.locator('#stop')).toBeHidden();
    await expect(page.locator('#next')).toBeHidden();
  });

  test('no dice are on the table until the first roll', async ({ page }) => {
    await expect(page.locator('.die[data-state="idle"]')).toHaveCount(6);
    await expect(die(page, 0)).toBeHidden();
  });
});

test.describe('rolling', () => {
  test('six dice land in a single row along the bottom', async ({ page }) => {
    await roll(page);
    const box = await page.evaluate(() => {
      const tray = document.getElementById('tray').getBoundingClientRect();
      const dice = [...document.querySelectorAll('.die')].map(d => d.getBoundingClientRect());
      return {
        tops: dice.map(d => Math.round(d.top - tray.top)),
        lefts: dice.map(d => Math.round(d.left - tray.left)),
        firstLeft: dice[0].left - tray.left,
        lastRight: dice[5].right - tray.left,
        trayW: tray.width,
        trayH: tray.height,
        dieH: dice[0].height,
      };
    });

    // One row: every die shares a top edge.
    expect(new Set(box.tops).size, 'all dice on one row').toBe(1);
    // Left to right, in order, no overlap and inside the tray.
    for (let i = 1; i < 6; i++) expect(box.lefts[i]).toBeGreaterThan(box.lefts[i - 1]);
    expect(box.firstLeft).toBeGreaterThanOrEqual(0);
    expect(box.lastRight).toBeLessThanOrEqual(box.trayW);
    // Sitting at the bottom rather than floating mid-tray.
    expect(box.tops[0] + box.dieH).toBeGreaterThan(box.trayH * 0.8);
  });

  test('every die shows a face between 1 and 6', async ({ page }) => {
    await roll(page);
    const faces = await page.locator('.die').evaluateAll(els =>
      els.map(e => Number(e.dataset.face)));
    expect(faces).toHaveLength(6);
    for (const f of faces) expect(f).toBeGreaterThanOrEqual(1);
    for (const f of faces) expect(f).toBeLessThanOrEqual(6);
  });

  test('pips render and are not collapsed', async ({ page }) => {
    // Percentage padding on the die silently flattens the pips to zero;
    // see _README.md. Assert real geometry rather than the stylesheet.
    await roll(page);
    const pip = await page.evaluate(() => {
      const p = document.querySelector('.die .pip:nth-child(5)').getBoundingClientRect();
      const d = document.querySelector('.die').getBoundingClientRect();
      return { pipW: p.width, dieW: d.width };
    });
    expect(pip.pipW).toBeGreaterThan(3);
    expect(pip.pipW).toBeLessThan(pip.dieW / 2);
  });
});

test.describe('keeping dice', () => {
  test('tapping keeps a die and tapping again releases it', async ({ page }) => {
    await forceFaces(page, [1, 2, 3, 4, 6, 2]);
    await roll(page);

    await die(page, 0).click();
    await expect(die(page, 0)).toHaveAttribute('data-state', 'kept');
    await expect(die(page, 0)).toHaveAttribute('aria-pressed', 'true');

    await die(page, 0).click();
    await expect(die(page, 0)).toHaveAttribute('data-state', 'active');
    await expect(die(page, 0)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the running total follows the selection', async ({ page }) => {
    await forceFaces(page, [1, 5, 3, 4, 6, 2]);
    await roll(page);
    await expect(status(page)).toHaveText('P1: 0');
    await die(page, 0).click();                      // a 1 is 100
    await expect(status(page)).toHaveText('P1: 100');
    await die(page, 1).click();                      // a 5 is 50
    await expect(status(page)).toHaveText('P1: 150');
  });

  test('Roll! and Stop! stay disabled until the selection scores', async ({ page }) => {
    await forceFaces(page, [1, 2, 3, 4, 6, 2]);
    await roll(page);
    await expect(page.locator('#roll')).toBeDisabled();
    await expect(page.locator('#stop')).toBeDisabled();

    await die(page, 1).click();                      // a lone 2 scores nothing
    await expect(page.locator('#roll')).toBeDisabled();

    await die(page, 1).click();
    await die(page, 0).click();                      // the 1 does
    await expect(page.locator('#roll')).toBeEnabled();
    await expect(page.locator('#stop')).toBeEnabled();
  });

  test('a non-scoring die spoils an otherwise valid selection', async ({ page }) => {
    // Every kept die must earn its place, so 1 + 3 is illegal even though
    // the 1 scores on its own.
    await forceFaces(page, [1, 3, 3, 4, 6, 2]);
    await roll(page);
    await die(page, 0).click();
    await expect(page.locator('#roll')).toBeEnabled();
    await die(page, 1).click();
    await expect(page.locator('#roll')).toBeDisabled();
  });
});

test.describe('scoring', () => {
  const cases = [
    { name: 'three 1s are 1000', faces: [1, 1, 1, 2, 3, 4], keep: [0, 1, 2], total: 1000 },
    { name: 'three 4s are 400', faces: [4, 4, 4, 2, 3, 6], keep: [0, 1, 2], total: 400 },
    { name: 'a 1-6 straight is 1500', faces: [1, 2, 3, 4, 5, 6], keep: [0, 1, 2, 3, 4, 5], total: 1500 },
    { name: 'three pairs are 1500', faces: [2, 2, 3, 3, 4, 4], keep: [0, 1, 2, 3, 4, 5], total: 1500 },
    { name: 'four of a kind doubles the triple', faces: [3, 3, 3, 3, 2, 4], keep: [0, 1, 2, 3], total: 600 },
    { name: 'a single 1 and a single 5 are 150', faces: [1, 5, 2, 3, 4, 6], keep: [0, 1], total: 150 },
  ];

  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await forceFaces(page, c.faces);
      await roll(page);
      for (const i of c.keep) await die(page, i).click();
      await expect(status(page)).toHaveText(`P1: ${c.total}`);
      await expect(page.locator('#stop')).toBeEnabled();
    });
  }
});

test.describe('busting', () => {
  const DEAD = [2, 3, 4, 6, 2, 3];   // no 1, no 5, no set, no straight

  test('a roll that cannot score busts', async ({ page }) => {
    await forceFaces(page, DEAD);
    await roll(page);
    await expect(body(page)).toHaveAttribute('data-phase', 'bust');
    await expect(status(page)).toHaveText('Bust!');
  });

  test('busting replaces Roll!/Stop! with Next Player!', async ({ page }) => {
    await forceFaces(page, DEAD);
    await roll(page);
    await expect(page.locator('#roll')).toBeHidden();
    await expect(page.locator('#stop')).toBeHidden();
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#next')).toHaveText('Next Player!');
  });

  test('a bust loses the turn score and passes the dice', async ({ page }) => {
    // 1,1,1 banked, then a dead second roll takes the 1000 away.
    await forceFaces(page, [1, 1, 1, 2, 3, 4, 2, 3, 4]);
    await roll(page);
    for (const i of [0, 1, 2]) await die(page, i).click();
    await page.locator('#roll').click();
    await expect(body(page)).toHaveAttribute('data-phase', 'bust');

    await page.locator('#next').click();
    await expect(seatScore(page, 0)).toHaveText('0');
    await expect(status(page)).toHaveText('P2 to roll');
    await expect(page.locator('.seat[data-seat="1"]')).toHaveAttribute('data-active', '');
  });

  test('dice cannot be kept once bust', async ({ page }) => {
    await forceFaces(page, DEAD);
    await roll(page);
    await expect(die(page, 0)).toBeDisabled();
  });
});

test.describe('banking and turns', () => {
  test('Stop! banks the turn and passes to the next player', async ({ page }) => {
    await forceFaces(page, [1, 1, 1, 2, 3, 4]);
    await roll(page);
    for (const i of [0, 1, 2]) await die(page, i).click();
    await page.locator('#stop').click();

    await expect(seatScore(page, 0)).toHaveText('1000');
    await expect(status(page)).toHaveText('P2 to roll');
    await expect(body(page)).toHaveAttribute('data-phase', 'idle');
  });

  test('kept dice are set aside and the rest re-roll', async ({ page }) => {
    await forceFaces(page, [1, 2, 3, 4, 6, 2, 5, 2, 3, 4, 6]);
    await roll(page);
    await die(page, 0).click();
    await page.locator('#roll').click();
    await expect(body(page)).toHaveAttribute('data-phase', /picking|bust/);

    await expect(die(page, 0)).toHaveAttribute('data-state', 'set');
    await expect(die(page, 0)).toBeDisabled();
    await expect(page.locator('.die[data-state="active"]')).toHaveCount(5);
  });

  test('scoring all six dice brings all six back', async ({ page }) => {
    // Hot dice: six 1s is 4000, then the whole set rolls again.
    await forceFaces(page, [1, 1, 1, 1, 1, 1, 5, 2, 3, 4, 6, 2]);
    await roll(page);
    for (let i = 0; i < 6; i++) await die(page, i).click();
    await expect(status(page)).toHaveText('P1: 4000');

    await page.locator('#roll').click();
    await expect(body(page)).toHaveAttribute('data-phase', /picking|bust/);
    await expect(page.locator('.die[data-state="set"]')).toHaveCount(0);
    await expect(page.locator('.die[data-state="active"]')).toHaveCount(6);
    // The 4000 carries into the new roll.
    await expect(status(page)).toHaveText('P1: 4000');
  });
});

test.describe('settings', () => {
  test('the panel is closed until the button is tapped', async ({ page }) => {
    await expect(page.locator('#settings')).toBeHidden();
    await page.locator('#settings-btn').click();
    await expect(page.locator('#settings')).toBeVisible();
  });

  test('choosing a count rebuilds the scoreboard', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('.count[data-count="4"]').click();
    await expect(page.locator('.seat')).toHaveCount(4);
    await expect(page.locator('#settings')).toBeHidden();
  });

  test('changing the count starts a fresh game', async ({ page }) => {
    await forceFaces(page, [1, 1, 1, 2, 3, 4]);
    await roll(page);
    for (const i of [0, 1, 2]) await die(page, i).click();
    await page.locator('#stop').click();
    await expect(seatScore(page, 0)).toHaveText('1000');

    await page.locator('#settings-btn').click();
    await page.locator('.count[data-count="3"]').click();
    await expect(seatScore(page, 0)).toHaveText('0');
    await expect(status(page)).toHaveText('P1 to roll');
  });

  test('offers 2 to 12 players', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await expect(page.locator('.count')).toHaveCount(11);
    await expect(page.locator('.count[data-count="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.count[data-count="12"]')).toHaveCount(1);
  });

  test('twelve players each get a seat', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('.count[data-count="12"]').click();
    await expect(page.locator('.seat')).toHaveCount(12);
    await expect(page.locator('.seat[data-seat="11"] .seat-score')).toHaveText('0');
  });

  test('seats go three across up to six, four across beyond', async ({ page }) => {
    const columns = () => page.evaluate(() =>
      getComputedStyle(document.getElementById('seats')).gridTemplateColumns.split(' ').length);

    for (const [count, cols] of [[2, 2], [3, 3], [6, 3], [7, 4], [12, 4]]) {
      await page.locator('#settings-btn').click();
      await page.locator(`.count[data-count="${count}"]`).click();
      await expect(page.locator('.seat')).toHaveCount(count);
      expect(await columns(), `${count} players`).toBe(cols);
    }
  });

  test('the tray survives a third row of seats', async ({ page }) => {
    // --seat-rows feeds --chrome; without it a third row pushes the tray
    // off screen instead of shrinking it. See _README.md.
    for (const count of [2, 7, 12]) {
      await page.locator('#settings-btn').click();
      await page.locator(`.count[data-count="${count}"]`).click();
      const m = await page.evaluate(() => {
        const t = document.getElementById('tray').getBoundingClientRect();
        return {
          ratio: t.width / t.height,
          oy: document.documentElement.scrollHeight - window.innerHeight,
          rows: getComputedStyle(document.documentElement).getPropertyValue('--seat-rows').trim(),
        };
      });
      expect(m.ratio, `tray square with ${count}`).toBeCloseTo(1, 1);
      expect(m.oy, `no overflow with ${count}`).toBeLessThanOrEqual(0);
      expect(m.rows, `--seat-rows tracks ${count} players`)
        .toBe(String(Math.ceil(count / (count >= 7 ? 4 : 3))));
    }
  });
});

test.describe('persistence', () => {
  test('scores and the current player survive a reload', async ({ page }) => {
    await forceFaces(page, [1, 1, 1, 2, 3, 4]);
    await roll(page);
    for (const i of [0, 1, 2]) await die(page, i).click();
    await page.locator('#stop').click();

    await page.reload();
    await expect(seatScore(page, 0)).toHaveText('1000');
    await expect(status(page)).toHaveText('P2 to roll');
  });

  test('a selection in progress survives a reload', async ({ page }) => {
    await forceFaces(page, [1, 1, 1, 2, 3, 4]);
    await roll(page);
    await die(page, 0).click();
    await page.reload();
    await expect(die(page, 0)).toHaveAttribute('data-state', 'kept');
    await expect(status(page)).toHaveText('P1: 100');
  });

  test('the player count survives a reload', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('.count[data-count="5"]').click();
    await page.reload();
    await expect(page.locator('.seat')).toHaveCount(5);
  });

  test('corrupt saved state falls back to a new two-player game', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.ten-thousand.v1', 'not json'));
    await page.reload();
    await expect(page.locator('.seat')).toHaveCount(2);
    await expect(status(page)).toHaveText('P1 to roll');
  });
});

test.describe('presentation', () => {
  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('the tray stays square and on screen', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const m = await page.evaluate(() => {
        const t = document.getElementById('tray').getBoundingClientRect();
        return {
          ratio: t.width / t.height,
          ox: document.documentElement.scrollWidth - window.innerWidth,
          oy: document.documentElement.scrollHeight - window.innerHeight,
        };
      });
      const at = `${size.width}x${size.height}`;
      expect(m.ratio, `tray square at ${at}`).toBeCloseTo(1, 1);
      expect(m.ox, `x overflow at ${at}`).toBeLessThanOrEqual(0);
      expect(m.oy, `y overflow at ${at}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('the roll animation', () => {
  test('dice tumble inside the tray before settling into the row', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: null });
    await page.reload();
    await page.locator('#roll').click();

    // Mid-flight: dice are visible, spread out, and not yet on one row.
    await page.waitForTimeout(350);
    // Read the simulation's own tray-unit coordinates, not getBoundingClientRect:
    // a rotated die's axis-aligned box sticks out past the tray even when the
    // die itself is inside, which makes a bounds check on it meaningless.
    const flying = await page.evaluate(() => {
      const pos = [...document.querySelectorAll('.die')].map(d => ({
        x: parseFloat(d.style.left), y: parseFloat(d.style.top),
      }));
      return {
        phase: document.body.dataset.phase,
        tops: pos.map(p => Math.round(p.y)),
        inside: pos.every(p => p.x >= -0.5 && p.x <= 86.5 && p.y >= -0.5 && p.y <= 86.5),
      };
    });
    expect(flying.phase).toBe('rolling');
    expect(flying.inside, 'dice stay within the tray bounds').toBe(true);
    expect(new Set(flying.tops).size, 'not lined up yet').toBeGreaterThan(1);

    await expect(body(page)).toHaveAttribute('data-phase', /picking|bust/, { timeout: 8000 });
    const settled = await page.evaluate(() => ({
      tops: [...document.querySelectorAll('.die')].map(d => Math.round(parseFloat(d.style.top))),
      rotations: [...document.querySelectorAll('.die')].map(d => d.style.transform),
    }));
    expect(new Set(settled.tops).size, 'settled onto one row').toBe(1);
    // Landed upright: any rotation left is a whole number of turns.
    for (const t of settled.rotations) {
      const deg = Number((t.match(/rotate\((-?[\d.]+)deg\)/) || [0, 0])[1]);
      expect(Math.abs(deg % 360)).toBeLessThan(0.5);
    }
  });

  test('reduced motion skips straight to the settled row', async ({ page }) => {
    await page.locator('#roll').click();
    await expect(body(page)).toHaveAttribute('data-phase', /picking|bust/, { timeout: 2000 });
  });
});
