const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/somewhere-between/';

const board = page => page.evaluate(() =>
  [...document.querySelectorAll('#board li')].map(li => ({
    name: li.querySelector('.board-name').textContent,
    score: Number(li.querySelector('.board-score').textContent),
  })));

/** Puts the hidden target at a known spot so scoring is not a coin flip. */
async function targetAt(page, percent) {
  await page.evaluate(p => {
    const track = document.getElementById('track');
    // The target marker is the game's own record of where it put the target.
    document.getElementById('target').style.left = p + '%';
  }, percent);
}

async function play(page) {
  await page.locator('#begin').click();
  await page.locator('#start').click();
}

/** Drags the marker to a fraction across the track. */
async function dragTo(page, fraction) {
  const box = await page.locator('#track').boundingBox();
  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the scale', () => {
  test('a round deals two opposite ends and a clue word', async ({ page }) => {
    await play(page);
    await expect(page.locator('#end-left')).not.toBeEmpty();
    await expect(page.locator('#end-right')).not.toBeEmpty();
    await expect(page.locator('#clue-word')).not.toBeEmpty();
    await expect(page.locator('#clue-cat')).not.toBeEmpty();
    const ends = await page.evaluate(() => ({
      left: document.getElementById('end-left').textContent,
      right: document.getElementById('end-right').textContent,
    }));
    expect(ends.left).not.toBe(ends.right);
  });

  test('the ends take the two player colours', async ({ page }) => {
    await play(page);
    const c = await page.evaluate(() => ({
      left: getComputedStyle(document.getElementById('end-left')).color,
      right: getComputedStyle(document.getElementById('end-right')).color,
    }));
    expect(c.left).toBe('rgb(47, 111, 219)');
    expect(c.right).toBe('rgb(216, 74, 53)');
  });

  test('the marker carries no number anywhere on screen', async ({ page }) => {
    await play(page);
    const text = await page.locator('.dial').innerText();
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/\b\d{1,3}\b/);
  });

  test('the screen reader gets a phrase, not the figure', async ({ page }) => {
    await play(page);
    await dragTo(page, 0.5);
    await expect(page.locator('#track')).toHaveAttribute('aria-valuetext', 'halfway');
    await dragTo(page, 0.02);
    const said = await page.locator('#track').getAttribute('aria-valuetext');
    expect(said).toMatch(/hard against/);
    expect(said).not.toMatch(/\d/);
  });

  test('the target is never dealt against an end', async ({ page }) => {
    await play(page);
    for (let i = 0; i < 25; i++) {
      const at = await page.evaluate(() =>
        parseFloat(document.getElementById('target').style.left));
      expect(at).toBeGreaterThanOrEqual(18);
      expect(at).toBeLessThanOrEqual(82);
      await page.locator('#new-scale').click();
    }
  });

  test('the target stays hidden until the clue-giver asks', async ({ page }) => {
    await play(page);
    const before = await page.evaluate(() =>
      getComputedStyle(document.getElementById('target')).display);
    expect(before).toBe('none');

    await page.locator('#peek').click();
    const after = await page.evaluate(() =>
      getComputedStyle(document.getElementById('target')).display);
    expect(after).not.toBe('none');
  });

  test('the scoring bands stay hidden until the guess is locked in',
    async ({ page }) => {
      await play(page);
      const before = await page.evaluate(() =>
        getComputedStyle(document.getElementById('band-4')).display);
      expect(before).toBe('none');

      await page.locator('#lock').click();
      const after = await page.evaluate(() =>
        getComputedStyle(document.getElementById('band-4')).display);
      expect(after).not.toBe('none');
      // Revealed in place, against the marker the table left there.
      await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
      await expect(page.locator('#target')).toBeVisible();
    });

  test('a new scale deals a fresh pair without passing the turn', async ({ page }) => {
    await play(page);
    const first = await page.locator('#end-left').textContent();
    const who = await page.locator('#play-who').textContent();
    await page.locator('#new-scale').click();
    await expect(page.locator('#end-left')).not.toHaveText(first);
    await expect(page.locator('#play-who')).toHaveText(who);
  });
});

test.describe('guessing and scoring', () => {
  test('dragging moves the marker', async ({ page }) => {
    await play(page);
    await dragTo(page, 0.2);
    const left = await page.evaluate(() =>
      parseFloat(document.getElementById('guess').style.left));
    expect(left).toBeGreaterThan(15);
    expect(left).toBeLessThan(26);
  });

  test('arrow keys nudge it, for anyone not using a finger', async ({ page }) => {
    await play(page);
    await page.locator('#track').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const left = await page.evaluate(() =>
      parseFloat(document.getElementById('guess').style.left));
    expect(left).toBeCloseTo(54, 0);
  });

  test('a bullseye scores four', async ({ page }) => {
    await play(page);
    const at = await page.evaluate(() =>
      parseFloat(document.getElementById('target').style.left));
    await dragTo(page, at / 100);
    await page.locator('#lock').click();
    await expect(page.locator('#over-score')).toHaveText('+4');
  });

  test('a miss scores nothing and says so', async ({ page }) => {
    await play(page);
    const at = await page.evaluate(() =>
      parseFloat(document.getElementById('target').style.left));
    // As far from the target as the track allows.
    await dragTo(page, at > 50 ? 0.01 : 0.99);
    await page.locator('#lock').click();
    await expect(page.locator('#over-score')).toHaveText('+0');
    await expect(page.locator('#over-label')).toContainText('Missed it');
  });

  test('the bands narrow as the score rises', async ({ page }) => {
    await play(page);
    // Read the placement rather than the box: the bands are display:none
    // until the guess is locked, and a hidden box measures zero.
    const widths = await page.evaluate(() => ['band-4', 'band-3', 'band-2']
      .map(id => parseFloat(document.getElementById(id).style.width)));
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);

    await page.locator('#lock').click();
    const shown = await page.evaluate(() => ['band-4', 'band-3', 'band-2']
      .map(id => document.getElementById(id).getBoundingClientRect().width));
    expect(shown[0]).toBeGreaterThan(0);
    expect(shown[0]).toBeLessThan(shown[2]);
  });

  test('the round total lands on the team that guessed it', async ({ page }) => {
    await play(page);
    const at = await page.evaluate(() =>
      parseFloat(document.getElementById('target').style.left));
    await dragTo(page, at / 100);
    await page.locator('#lock').click();
    await page.locator('#lock').click();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'over');
    const rows = await board(page);
    expect(rows[0]).toEqual({ name: 'Team 1', score: 4 });
    expect(rows[1]).toEqual({ name: 'Team 2', score: 0 });
  });

  test('pairs mode scores the clue-giver and the guesser together',
    async ({ page }) => {
      await page.locator('#mode-pairs').click();
      await page.locator('.count[data-count="4"]').click();
      await page.locator('#begin').click();
      await expect(page.locator('#ready-sub'))
        .toHaveText('gives the clue to Player 2. Both of them score.');
      await page.locator('#start').click();

      const at = await page.evaluate(() =>
        parseFloat(document.getElementById('target').style.left));
      await dragTo(page, at / 100);
      await page.locator('#lock').click();
      expect((await board(page)).map(r => r.score)).toEqual([4, 4, 0, 0]);
      await expect(page.locator('#dial-hint')).toContainText('+4');
    });
});

test.describe('presentation', () => {
  test('the how-to explains why there is no number', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toContainText('no percentage on it');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('nothing overflows in either orientation', async ({ page }) => {
    await play(page);
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 },
      { width: 844, height: 390 }]) {
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
    await page.route('**/games/somewhere-between/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button class="peek"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#peek')).toHaveCount(0);
    await expect(page.locator('.cat')).toHaveCount(30);
    expect(errors).toEqual([]);
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});

test.describe('the spectrum library', () => {
  test('eighty pairs, each with two different ends', async ({ page }) => {
    const s = await page.evaluate(() => ({
      count: Vocab.SPECTRUMS.length,
      bad: Vocab.SPECTRUMS.filter(p => !p.left || !p.right || p.left === p.right),
      unique: new Set(Vocab.SPECTRUMS.map(p => p.left + '|' + p.right)).size,
    }));
    expect(s.count).toBe(80);
    expect(s.bad).toEqual([]);
    expect(s.unique).toBe(80);
  });

  test('a dealt run holds every pair once', async ({ page }) => {
    const out = await page.evaluate(() => {
      const run = Vocab.spectrums();
      return { size: run.length, unique: new Set(run.map(p => p.left)).size };
    });
    expect(out.size).toBe(80);
    expect(out.unique).toBe(80);
  });
});
