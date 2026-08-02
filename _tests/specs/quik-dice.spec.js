const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/quik-dice/';
const KEY = 'games.quik-dice.v1';

const cell = (page, color, n) =>
  page.locator(`.row[data-color="${color}"] .cell[data-number="${n}"]`);
const lock = (page, color) => page.locator(`.row[data-color="${color}"] .cell.lock`);
const row = (page, color) => page.locator(`.row[data-color="${color}"]`);
const die = (page, i) => page.locator(`.die[data-index="${i}"]`);
const rowScore = (page, color) => page.locator(`.tot[data-color="${color}"] b`);
const penalties = page => page.locator('.tot.pen b');
const total = page => page.locator('.tot.sum b');
const targets = page => page.locator('.cell[data-target]');

/** A row of 11 booleans with the first `n` positions crossed off. */
const marked = n => Array.from({ length: 11 }, (_, i) => i < n);

/** Seeds saved state and reloads onto it. load() tolerates a partial object. */
async function seed(page, patch) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
    [KEY, patch]);
  await page.reload();
}

/**
 * Rolls with the faces forced. Faces are drawn before any of the roll
 * animation's randomness and in ascending die order, so seeding the head of
 * Math.random is enough — see the game's _README.md. Locked dice are not
 * rolled, so pass only as many faces as there are dice still in play.
 */
async function roll(page, faces) {
  await page.evaluate(list => { window.__faces = list.slice(); }, faces);
  await page.locator('#roll').click();
  await expect(page.locator('#done')).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const real = Math.random;
    window.__faces = [];
    Math.random = () => (window.__faces.length
      ? (window.__faces.shift() - 1) / 6 + 0.01
      : real());
  });
  await page.goto(URL);
  await clearState(page);
});

test.describe('the sheet', () => {
  test('four rows of eleven numbers, each with a padlock', async ({ page }) => {
    await expect(page.locator('.row')).toHaveCount(4);
    await expect(page.locator('.row[data-color="red"] .cell')).toHaveCount(12);
    await expect(page.locator('.cell.lock')).toHaveCount(4);
  });

  test('red and yellow run up, green and blue run down', async ({ page }) => {
    const numbers = async color => page
      .locator(`.row[data-color="${color}"] .cell[data-number]`)
      .evaluateAll(els => els.map(e => e.textContent));
    const up = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    expect(await numbers('red')).toEqual(up);
    expect(await numbers('yellow')).toEqual(up);
    expect(await numbers('green')).toEqual(up.slice().reverse());
    expect(await numbers('blue')).toEqual(up.slice().reverse());
  });

  test('six dice: two white, then one per row colour', async ({ page }) => {
    await expect(page.locator('.die')).toHaveCount(6);
    const fills = await page.locator('.die').evaluateAll(els =>
      els.map(e => getComputedStyle(e).backgroundColor));
    expect(fills[0]).toBe(fills[1]);
    expect(new Set(fills.slice(2)).size, 'four distinct colours').toBe(4);
    expect(new Set(fills).size, 'no colour die matches the white pair').toBe(5);
  });

  test('the score starts at zero and is always on screen', async ({ page }) => {
    await expect(total(page)).toHaveText('0');
    await expect(rowScore(page, 'red')).toHaveText('0');
    await expect(penalties(page)).toHaveText('0');
  });
});

test.describe("someone else's turn", () => {
  test('every legal number is tappable', async ({ page }) => {
    // The phone cannot know the active player's white sum, so it offers all
    // of them — see _README.md.
    await expect(targets(page)).toHaveCount(40);
    await expect(page.locator('#roll')).toBeEnabled();
    await expect(page.locator('#done')).toBeDisabled();
  });

  test('crossing a number puts everything left of it out of reach', async ({ page }) => {
    await cell(page, 'red', 7).click();
    await expect(cell(page, 'red', 7)).toHaveAttribute('data-marked', '');
    await expect(cell(page, 'red', 6)).toBeDisabled();
    await expect(cell(page, 'red', 2)).toBeDisabled();
    await expect(cell(page, 'red', 8)).toBeEnabled();
    await expect(rowScore(page, 'red')).toHaveText('1');
    await expect(total(page)).toHaveText('1');
  });

  test('other rows are untouched by a cross in one of them', async ({ page }) => {
    await cell(page, 'red', 7).click();
    await expect(cell(page, 'blue', 7)).toBeEnabled();
    await expect(targets(page)).toHaveCount(34);   // 40 less red 2-7
  });
});

test.describe('your turn', () => {
  test('Roll narrows the sheet to the white sum and the colour pairs',
    async ({ page }) => {
      await roll(page, [3, 4, 1, 1, 1, 1]);
      // White 7 in any row; 3+1 and 4+1 in each colour's own row.
      await expect(targets(page)).toHaveCount(12);
      await expect(cell(page, 'red', 7)).toBeEnabled();
      await expect(cell(page, 'red', 4)).toBeEnabled();
      await expect(cell(page, 'red', 5)).toBeEnabled();
      await expect(cell(page, 'red', 6)).toBeDisabled();
      await expect(cell(page, 'blue', 8)).toBeDisabled();
      await expect(page.locator('#status')).toHaveText(/White 7/);
      await expect(page.locator('#roll')).toBeDisabled();
    });

  test('taking the white sum leaves one colour pair', async ({ page }) => {
    await roll(page, [3, 4, 1, 1, 1, 1]);
    await cell(page, 'red', 7).click();
    // Red's own 4 and 5 are now behind the 7, so only the other three rows
    // still offer a pair.
    await expect(targets(page)).toHaveCount(6);
    await expect(cell(page, 'red', 4)).toBeDisabled();
    await expect(cell(page, 'yellow', 4)).toBeEnabled();
    await expect(page.locator('#status')).toHaveText(/colour pair left/);
  });

  test('taking a colour pair first gives up the white sum', async ({ page }) => {
    await roll(page, [3, 4, 1, 1, 1, 1]);
    await cell(page, 'yellow', 4).click();
    await expect(targets(page)).toHaveCount(0);
    await expect(cell(page, 'red', 7)).toBeDisabled();
    await expect(page.locator('#status')).toHaveText(/tap Done/);
  });

  test('a number that is both is read as the white sum', async ({ page }) => {
    // White 3+4=7, and red's pair 3+4 is also 7. Taking it as the white
    // keeps a colour pair in hand, so that is the only sane reading.
    await roll(page, [3, 4, 4, 1, 1, 1]);
    await cell(page, 'red', 7).click();
    await expect(page.locator('#status')).toHaveText(/colour pair left/);
    await expect(targets(page)).not.toHaveCount(0);
  });

  test('Done hands play on and reopens the sheet', async ({ page }) => {
    await roll(page, [3, 4, 1, 1, 1, 1]);
    await cell(page, 'red', 7).click();
    await page.locator('#done').click();
    await expect(page.locator('#roll')).toBeEnabled();
    await expect(page.locator('#done')).toBeDisabled();
    await expect(targets(page)).toHaveCount(34);
  });

  test('Done with nothing crossed costs five', async ({ page }) => {
    await roll(page, [3, 4, 1, 1, 1, 1]);
    await expect(page.locator('#done')).toHaveText('Done −5');
    await page.locator('#done').click();
    await expect(penalties(page)).toHaveText('−5');
    await expect(total(page)).toHaveText('-5');
  });

  test('the button stops warning once something is crossed', async ({ page }) => {
    await roll(page, [3, 4, 1, 1, 1, 1]);
    await cell(page, 'red', 7).click();
    await expect(page.locator('#done')).toHaveText('Done');
  });
});

test.describe('locking a row', () => {
  test('the last number needs five crosses first', async ({ page }) => {
    await seed(page, { rows: [marked(4)] });
    await roll(page, [6, 6, 1, 1, 1, 1]);
    await expect(cell(page, 'red', 12)).toBeDisabled();
  });

  test('taking it closes the row and earns the padlock', async ({ page }) => {
    await seed(page, { rows: [marked(5)] });
    await roll(page, [6, 6, 1, 1, 1, 1]);
    await cell(page, 'red', 12).click();
    await expect(row(page, 'red')).toHaveAttribute('data-closed', '');
    await expect(lock(page, 'red')).toHaveAttribute('data-marked', '');
    // Six crosses plus the padlock is seven, and seven scores 28.
    await expect(rowScore(page, 'red')).toHaveText('28');
  });

  test('a closed row greys out its die and stops rolling it', async ({ page }) => {
    await seed(page, { rows: [marked(5)] });
    await roll(page, [6, 6, 3, 1, 1, 1]);
    await cell(page, 'red', 12).click();
    await page.locator('#done').click();
    await expect(die(page, 2)).toHaveAttribute('data-locked', '');
    const faded = await die(page, 2).evaluate(e => getComputedStyle(e).opacity);
    expect(Number(faded)).toBeLessThan(0.5);

    // Five dice in play now, so five faces are drawn — the red one keeps
    // the face it had.
    await roll(page, [2, 2, 5, 5, 5]);
    const faces = await page.locator('.die').evaluateAll(els => els.map(e => e.dataset.face));
    expect(faces).toEqual(['2', '2', '3', '5', '5', '5']);
  });

  test("a padlock you did not earn closes the row without scoring", async ({ page }) => {
    await seed(page, { rows: [marked(3)] });
    await lock(page, 'red').click();
    await expect(row(page, 'red')).toHaveAttribute('data-closed', '');
    await expect(die(page, 2)).toHaveAttribute('data-locked', '');
    await expect(rowScore(page, 'red')).toHaveText('6');    // 3 crosses, no padlock
    await expect(cell(page, 'red', 8)).toBeDisabled();
  });

  test('tapping that padlock again reopens the row', async ({ page }) => {
    await lock(page, 'blue').click();
    await lock(page, 'blue').click();
    await expect(row(page, 'blue')).not.toHaveAttribute('data-closed', '');
    await expect(die(page, 5)).not.toHaveAttribute('data-locked', '');
  });

  test('an earned padlock is not toggleable', async ({ page }) => {
    await seed(page, { rows: [marked(5)] });
    await roll(page, [6, 6, 1, 1, 1, 1]);
    await cell(page, 'red', 12).click();
    await expect(lock(page, 'red')).toBeDisabled();
  });
});

test.describe('ending the game', () => {
  test('the second locked row ends it', async ({ page }) => {
    await lock(page, 'red').click();
    await lock(page, 'yellow').click();
    await expect(page.locator('#status')).toHaveText(/Two rows locked/);
    await expect(page.locator('#roll')).toBeDisabled();
    await expect(page.locator('#done')).toHaveText('New game');
  });

  test('a fourth penalty ends it', async ({ page }) => {
    for (let i = 0; i < 4; i++) {
      await roll(page, [1, 1, 1, 1, 1, 1]);
      await page.locator('#done').click();
    }
    await expect(page.locator('#status')).toHaveText(/Four penalties/);
    await expect(total(page)).toHaveText('-20');
    await expect(targets(page)).toHaveCount(0);
  });

  test('the roll in hand is always played out', async ({ page }) => {
    // Two rows already closed, but the turn under way is not cut short.
    await seed(page, { closed: [true, true, false, false], phase: 'idle' });
    await expect(page.locator('#roll')).toBeEnabled();
    await roll(page, [3, 4, 1, 1]);
    await expect(targets(page)).not.toHaveCount(0);
    await cell(page, 'green', 7).click();
    await page.locator('#done').click();
    await expect(page.locator('#status')).toHaveText(/Two rows locked/);
  });

  test('New game clears the sheet', async ({ page }) => {
    await lock(page, 'red').click();
    await lock(page, 'yellow').click();
    await page.locator('#done').click();
    await expect(targets(page)).toHaveCount(40);
    await expect(total(page)).toHaveText('0');
    await expect(page.locator('#roll')).toBeEnabled();
  });
});

test.describe('scoring', () => {
  test('a row scores the triangular number of its crosses', async ({ page }) => {
    await seed(page, { rows: [marked(3), marked(5), marked(1), []] });
    await expect(rowScore(page, 'red')).toHaveText('6');
    await expect(rowScore(page, 'yellow')).toHaveText('15');
    await expect(rowScore(page, 'green')).toHaveText('1');
    await expect(rowScore(page, 'blue')).toHaveText('0');
    await expect(total(page)).toHaveText('22');
  });

  test('penalties come off the total', async ({ page }) => {
    await seed(page, { rows: [marked(4)], penalties: 2 });
    await expect(rowScore(page, 'red')).toHaveText('10');
    await expect(penalties(page)).toHaveText('−10');
    await expect(total(page)).toHaveText('0');
  });
});

test.describe('undo', () => {
  test('takes back a cross', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
    await cell(page, 'red', 7).click();
    await page.locator('#undo').click();
    await expect(cell(page, 'red', 7)).not.toHaveAttribute('data-marked', '');
    await expect(total(page)).toHaveText('0');
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('takes back a roll', async ({ page }) => {
    await roll(page, [3, 4, 1, 1, 1, 1]);
    await page.locator('#undo').click();
    await expect(page.locator('#roll')).toBeEnabled();
    await expect(targets(page)).toHaveCount(40);
  });

  test('takes back a padlock, earned or not', async ({ page }) => {
    await seed(page, { rows: [marked(5)] });
    await roll(page, [6, 6, 1, 1, 1, 1]);
    await cell(page, 'red', 12).click();
    await page.locator('#undo').click();
    await expect(row(page, 'red')).not.toHaveAttribute('data-closed', '');
    await expect(rowScore(page, 'red')).toHaveText('15');
  });
});

test.describe('persistence', () => {
  test('the sheet survives a reload', async ({ page }) => {
    await cell(page, 'red', 7).click();
    await cell(page, 'blue', 9).click();
    await page.reload();
    await expect(cell(page, 'red', 7)).toHaveAttribute('data-marked', '');
    await expect(cell(page, 'blue', 9)).toHaveAttribute('data-marked', '');
    await expect(total(page)).toHaveText('2');
  });

  test('a turn in progress survives a reload', async ({ page }) => {
    await roll(page, [3, 4, 1, 1, 1, 1]);
    await cell(page, 'red', 7).click();
    await page.reload();
    await expect(page.locator('#roll')).toBeDisabled();
    await expect(page.locator('#done')).toBeEnabled();
    await expect(targets(page)).toHaveCount(6);
  });

  test('corrupt saved state falls back to a clean sheet', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, 'not json'), KEY);
    await page.reload();
    await expect(targets(page)).toHaveCount(40);
    await expect(total(page)).toHaveText('0');
  });

  test('a padlock saved without the number that earned it is dropped',
    async ({ page }) => {
      await seed(page, { rows: [marked(3)], closed: [true, false, false, false],
        earned: [true, false, false, false] });
      await expect(rowScore(page, 'red')).toHaveText('6');
    });
});

test.describe('dragging along a scale', () => {
  /** How far a cell sticks out past the row's visible area, either side. */
  const outside = (page, color, n) => page.evaluate(([c, num]) => {
    const strip = document.querySelector(`.row[data-color="${c}"]`);
    const box = strip.getBoundingClientRect();
    const cellBox = strip.querySelector(`.cell[data-number="${num}"]`)
      .getBoundingClientRect();
    const pinned = strip.querySelector('.cell.lock').getBoundingClientRect().width;
    return Math.max(box.left - cellBox.left, cellBox.right - (box.right - pinned));
  }, [color, n]);

  const scrollLeft = (page, color) =>
    page.locator(`.row[data-color="${color}"]`).evaluate(e => e.scrollLeft);

  test('a row is wider than the phone, so it scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const m = await page.locator('.row[data-color="red"]').evaluate(e => ({
      scroll: e.scrollWidth, client: e.clientWidth,
      overflow: getComputedStyle(e).overflowX,
    }));
    expect(m.scroll).toBeGreaterThan(m.client);
    expect(m.overflow).toBe('auto');
  });

  test('each colour scrolls on its own', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.row[data-color="red"]').evaluate(e => { e.scrollLeft = 150; });
    expect(await scrollLeft(page, 'red')).toBeGreaterThan(100);
    expect(await scrollLeft(page, 'yellow')).toBe(0);
    expect(await scrollLeft(page, 'blue')).toBe(0);
  });

  test('dragging sideways moves the row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.locator('.row[data-color="green"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(250, 0);
    await expect.poll(() => scrollLeft(page, 'green')).toBeGreaterThan(50);
    expect(await scrollLeft(page, 'red'), 'other rows stay put').toBe(0);
  });

  test('a cell scrolled into view is still tappable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.row[data-color="red"]').evaluate(e => { e.scrollLeft = 9999; });
    await cell(page, 'red', 11).click();
    await expect(cell(page, 'red', 11)).toHaveAttribute('data-marked', '');
  });

  test('the padlock stays pinned to the right edge', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const at of [0, 200, 9999]) {
      await page.locator('.row[data-color="red"]')
        .evaluate((e, x) => { e.scrollLeft = x; }, at);
      const gap = await page.evaluate(() => {
        const strip = document.querySelector('.row[data-color="red"]');
        return strip.getBoundingClientRect().right
          - strip.querySelector('.cell.lock').getBoundingClientRect().right;
      });
      expect(Math.abs(gap), `padlock pinned at scrollLeft ${at}`).toBeLessThan(1.5);
    }
  });

  test('a roll brings each row target into view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await scrollLeft(page, 'blue')).toBe(0);
    // White 1+2 = 3, which in blue (12 down to 2) is the second from the end.
    await roll(page, [1, 2, 1, 1, 1, 1]);
    expect(await scrollLeft(page, 'blue')).toBeGreaterThan(0);
    expect(await outside(page, 'blue', 3)).toBeLessThanOrEqual(1);
  });

  test('a roll shows the far target as well as the near one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Green runs 12 down to 2, so its white 7 sits mid-row and its colour
    // pairs — 3+1 and 4+1 — are away at the far end. Stopping at the first
    // target would leave those two off screen.
    await roll(page, [3, 4, 1, 1, 1, 1]);
    expect(await outside(page, 'green', 7)).toBeLessThanOrEqual(1);
    expect(await outside(page, 'green', 5)).toBeLessThanOrEqual(1);
    expect(await outside(page, 'green', 4)).toBeLessThanOrEqual(1);
  });

  test('a row already showing its target is left alone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // White 3+4 = 7 sits at the left end of red, where the row already is.
    await roll(page, [3, 4, 1, 1, 1, 1]);
    expect(await scrollLeft(page, 'red')).toBe(0);
  });

  test('a well-crossed row opens on its live end', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, { rows: [marked(8)] });
    expect(await scrollLeft(page, 'red')).toBeGreaterThan(0);
    expect(await outside(page, 'red', 10)).toBeLessThanOrEqual(1);
    expect(await scrollLeft(page, 'yellow'), 'an untouched row does not move').toBe(0);
  });

  test('cells are big enough to tap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await cell(page, 'red', 4).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(38);
    expect(box.height).toBeGreaterThanOrEqual(38);
  });

  test('a wide window shows the whole scale without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const m = await page.locator('.row[data-color="red"]').evaluate(e => ({
      scroll: e.scrollWidth, client: e.clientWidth,
    }));
    expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
  });
});

test.describe('presentation', () => {
  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('nothing overflows the screen at any size', async ({ page }) => {
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 },
      { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const controls = document.querySelector('.controls').getBoundingClientRect();
        return {
          ox: doc.scrollWidth - window.innerWidth,
          oy: doc.scrollHeight - window.innerHeight,
          controlsBottom: controls.bottom - window.innerHeight,
        };
      });
      const at = `${size.width}x${size.height}`;
      expect(m.ox, `x overflow at ${at}`).toBeLessThanOrEqual(0);
      expect(m.oy, `y overflow at ${at}`).toBeLessThanOrEqual(0);
      expect(m.controlsBottom, `controls on screen at ${at}`).toBeLessThanOrEqual(1);
    }
  });

  test('the tray stays square', async ({ page }) => {
    const ratio = await page.locator('#tray').evaluate(e => {
      const b = e.getBoundingClientRect();
      return b.width / b.height;
    });
    expect(ratio).toBeCloseTo(1, 1);
  });
});
