const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/dice/';

/** See ten-thousand.spec.js — faces are drawn before any physics randomness. */
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
  await expect(page.locator('#roll')).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await clearState(page);
});

test.describe('choosing how many', () => {
  test('offers one to six dice, starting at two', async ({ page }) => {
    await expect(page.locator('.count')).toHaveCount(6);
    await expect(page.locator('.count[data-count="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.die')).toHaveCount(2);
  });

  test('picking a count rebuilds the tray', async ({ page }) => {
    await page.locator('.count[data-count="5"]').click();
    await expect(page.locator('.die')).toHaveCount(5);
    await expect(page.locator('.count[data-count="5"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.count[data-count="2"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a single die is bigger than one of six', async ({ page }) => {
    // Die size is derived from the count, so one die fills more of the tray.
    await page.locator('.count[data-count="1"]').click();
    const solo = await page.locator('.die').first().evaluate(e => e.getBoundingClientRect().width);
    await page.locator('.count[data-count="6"]').click();
    const crowd = await page.locator('.die').first().evaluate(e => e.getBoundingClientRect().width);
    expect(solo).toBeGreaterThan(crowd);
  });

  test('every count fits inside the tray', async ({ page }) => {
    for (let n = 1; n <= 6; n++) {
      await page.locator(`.count[data-count="${n}"]`).click();
      await roll(page);
      const fits = await page.evaluate(() => {
        const tray = document.getElementById('tray').getBoundingClientRect();
        const dice = [...document.querySelectorAll('.die')].map(d => d.getBoundingClientRect());
        return {
          count: dice.length,
          left: dice[0].left - tray.left,
          right: dice[dice.length - 1].right - tray.left,
          width: tray.width,
          tops: new Set(dice.map(d => Math.round(d.top))).size,
        };
      });
      expect(fits.count, `${n} dice`).toBe(n);
      expect(fits.left, `${n} dice start inside`).toBeGreaterThanOrEqual(-0.5);
      expect(fits.right, `${n} dice end inside`).toBeLessThanOrEqual(fits.width + 0.5);
      expect(fits.tops, `${n} dice on one row`).toBe(1);
    }
  });
});

test.describe('rolling', () => {
  test('the Roll button rolls', async ({ page }) => {
    await forceFaces(page, [3, 6]);
    await roll(page);
    const faces = await page.locator('.die').evaluateAll(els => els.map(e => e.dataset.face));
    expect(faces).toEqual(['3', '6']);
  });

  test('tapping the tray rolls too', async ({ page }) => {
    await forceFaces(page, [1, 1, 5, 2]);
    await page.locator('.count[data-count="2"]').click();
    await page.locator('#tray').click();
    await expect(page.locator('#roll')).toBeEnabled();
    const faces = await page.locator('.die').evaluateAll(els => els.map(e => e.dataset.face));
    expect(faces).toHaveLength(2);
  });

  test('dice land in a row at the bottom of the tray', async ({ page }) => {
    await roll(page);
    const box = await page.evaluate(() => {
      const tray = document.getElementById('tray').getBoundingClientRect();
      const dice = [...document.querySelectorAll('.die')].map(d => d.getBoundingClientRect());
      return {
        tops: dice.map(d => Math.round(d.top - tray.top)),
        bottom: dice[0].bottom - tray.top,
        trayH: tray.height,
      };
    });
    expect(new Set(box.tops).size).toBe(1);
    expect(box.bottom).toBeGreaterThan(box.trayH * 0.8);
  });

  test('rolling again changes the faces shown', async ({ page }) => {
    await forceFaces(page, [1, 1, 6, 6]);
    await roll(page);
    expect(await page.locator('.die').evaluateAll(e => e.map(d => d.dataset.face)))
      .toEqual(['1', '1']);
    await roll(page);
    expect(await page.locator('.die').evaluateAll(e => e.map(d => d.dataset.face)))
      .toEqual(['6', '6']);
  });

  test('the result is announced for screen readers', async ({ page }) => {
    await forceFaces(page, [4, 2]);
    await roll(page);
    await expect(page.locator('#result')).toHaveText('Rolled 4, 2');
  });
});

test.describe('no game rules', () => {
  test('dice are not selectable', async ({ page }) => {
    // This is a roller, not a game: there is nothing to keep or lock.
    await roll(page);
    await expect(page.locator('.die')).toHaveCount(2);
    await expect(page.locator('button.die')).toHaveCount(0);
    const die = page.locator('.die').first();
    await die.click();
    await expect(die).not.toHaveAttribute('data-state', /.*/);
  });

  test('there is no score anywhere on the page', async ({ page }) => {
    await roll(page);
    await expect(page.locator('.seat, .scoreboard, #status-text')).toHaveCount(0);
  });
});

test.describe('persistence', () => {
  test('the count and the last roll survive a reload', async ({ page }) => {
    await forceFaces(page, [2, 4, 6]);
    await page.locator('.count[data-count="3"]').click();
    await roll(page);

    await page.reload();
    await expect(page.locator('.die')).toHaveCount(3);
    await expect(page.locator('.count[data-count="3"]')).toHaveAttribute('aria-pressed', 'true');
    const faces = await page.locator('.die').evaluateAll(els => els.map(e => e.dataset.face));
    expect(faces).toEqual(['2', '4', '6']);
  });

  test('changing the count clears the previous roll', async ({ page }) => {
    await roll(page);
    await page.locator('.count[data-count="4"]').click();
    await page.reload();
    await expect(page.locator('.die')).toHaveCount(4);
    await expect(page.locator('#result')).toHaveText('');
  });

  test('corrupt saved state falls back to two dice', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.dice.v1', 'not json'));
    await page.reload();
    await expect(page.locator('.die')).toHaveCount(2);
  });

  test('a saved roll shorter than the count is dropped', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem(
      'games.dice.v1', JSON.stringify({ count: 4, faces: [3, 3] })));
    await page.reload();
    await expect(page.locator('.die')).toHaveCount(4);
    await expect(page.locator('#result')).toHaveText('');
  });
});

test.describe('presentation', () => {
  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('pips render and are not collapsed', async ({ page }) => {
    await roll(page);
    const pip = await page.evaluate(() => {
      const p = document.querySelector('.die .pip:nth-child(5)').getBoundingClientRect();
      const d = document.querySelector('.die').getBoundingClientRect();
      return { pipW: p.width, dieW: d.width };
    });
    expect(pip.pipW).toBeGreaterThan(3);
    expect(pip.pipW).toBeLessThan(pip.dieW / 2);
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
  test('dice tumble before settling into the row', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: null });
    await page.reload();
    await page.locator('.count[data-count="5"]').click();
    await page.locator('#roll').click();

    await page.waitForTimeout(350);
    const flying = await page.evaluate(() => {
      const pos = [...document.querySelectorAll('.die')].map(d => ({
        x: parseFloat(d.style.left), y: parseFloat(d.style.top),
      }));
      const size = parseFloat(getComputedStyle(document.getElementById('tray'))
        .getPropertyValue('--die-size'));
      return {
        tops: pos.map(p => Math.round(p.y)),
        inside: pos.every(p => p.x >= -0.5 && p.x <= 100 - size + 0.5
          && p.y >= -0.5 && p.y <= 100 - size + 0.5),
      };
    });
    expect(flying.inside, 'dice stay within the tray bounds').toBe(true);
    expect(new Set(flying.tops).size, 'not lined up yet').toBeGreaterThan(1);

    await expect(page.locator('#roll')).toBeEnabled({ timeout: 8000 });
    const tops = await page.locator('.die').evaluateAll(els =>
      els.map(e => Math.round(parseFloat(e.style.top))));
    expect(new Set(tops).size, 'settled onto one row').toBe(1);
  });

  test('Roll is disabled while the dice are in the air', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: null });
    await page.reload();
    await page.locator('#roll').click();
    await expect(page.locator('#roll')).toBeDisabled();
    await expect(page.locator('#roll')).toBeEnabled({ timeout: 8000 });
  });
});
