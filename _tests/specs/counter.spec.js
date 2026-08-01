const { test, expect } = require('@playwright/test');
const { clearState } = require('../helpers');

const URL = '/games/counter/';
const value = page => page.locator('#value');

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('counting', () => {
  test('starts at zero', async ({ page }) => {
    await expect(value(page)).toHaveText('0');
  });

  test('up and down change the number', async ({ page }) => {
    await page.locator('#up').click();
    await page.locator('#up').click();
    await expect(value(page)).toHaveText('2');
    await page.locator('#down').click();
    await expect(value(page)).toHaveText('1');
  });

  test('goes negative', async ({ page }) => {
    await page.locator('#down').click();
    await expect(value(page)).toHaveText('-1');
  });

  test('arrow keys work for desktop use', async ({ page }) => {
    await page.keyboard.press('ArrowUp');
    await expect(value(page)).toHaveText('1');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(value(page)).toHaveText('-1');
  });

  test('reset returns to zero', async ({ page }) => {
    await page.locator('#up').click();
    await page.locator('#reset').click();
    await expect(value(page)).toHaveText('0');
  });

  test('count survives a reload', async ({ page }) => {
    await page.locator('#up').click();
    await page.locator('#up').click();
    await page.reload();
    await expect(value(page)).toHaveText('2');
  });

  test('corrupt saved state falls back to zero', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.counter.v1', 'not json'));
    await page.reload();
    await expect(value(page)).toHaveText('0');
  });
});

test.describe('layout', () => {
  test('portrait stacks up / number / down and fills the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const boxes = await page.evaluate(() => {
      const r = id => {
        const b = document.getElementById(id).getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, height: b.height, width: b.width };
      };
      return { up: r('up'), value: r('value'), down: r('down'), vh: window.innerHeight };
    });

    expect(boxes.up.bottom).toBeLessThanOrEqual(boxes.value.top + 1);
    expect(boxes.value.bottom).toBeLessThanOrEqual(boxes.down.top + 1);

    const filled = (boxes.up.height + boxes.value.height + boxes.down.height) / boxes.vh;
    expect(filled).toBeGreaterThan(0.85);
  });

  test('landscape puts the number beside a column of buttons', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    const boxes = await page.evaluate(() => {
      const r = id => {
        const b = document.getElementById(id).getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height, width: b.width };
      };
      return { up: r('up'), value: r('value'), down: r('down'), vh: window.innerHeight };
    });

    expect(boxes.value.right).toBeLessThanOrEqual(boxes.up.left + 1);
    expect(boxes.up.bottom).toBeLessThanOrEqual(boxes.down.top + 1);
    expect(boxes.value.height / boxes.vh).toBeGreaterThan(0.7);
    // Buttons stay comfortably tappable after the reflow.
    expect(boxes.up.height).toBeGreaterThan(100);
    expect(boxes.up.width).toBeGreaterThan(200);
  });

  test('no sideways scroll in either orientation', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(overflow.x, `x overflow at ${size.width}x${size.height}`).toBeLessThanOrEqual(0);
      expect(overflow.y, `y overflow at ${size.width}x${size.height}`).toBeLessThanOrEqual(0);
    }
  });

  test('arrows are inline SVG, not raster images', async ({ page }) => {
    // Project rule: SVG everywhere except the install icons.
    await expect(page.locator('#up svg')).toHaveCount(1);
    await expect(page.locator('#down svg')).toHaveCount(1);
    await expect(page.locator('img')).toHaveCount(0);
  });
});
