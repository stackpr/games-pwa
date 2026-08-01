const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/what-am-i/';
const board = page => page.evaluate(() =>
  [...document.querySelectorAll('#board li')].map(li => ({
    name: li.querySelector('.board-name').textContent,
    score: Number(li.querySelector('.board-score').textContent),
  })));

async function oneCategory(page, name = 'Animals') {
  await page.locator('#cat-none').click();
  await page.locator(`.cat[data-cat="${name}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the disclosed category', () => {
  test('the card shows the category and the word at once', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();

    await expect(page.locator('#card-cat')).toHaveText('Animals');
    await expect(page.locator('#card-word')).not.toBeEmpty();
    // No reveal step: the phone already faces the room.
    await expect(page.locator('#reveal')).toHaveCount(0);
  });

  test('the category is set as a headline, not as fine print', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    const type = await page.evaluate(() => {
      const s = getComputedStyle(document.getElementById('card-cat'));
      const root = getComputedStyle(document.documentElement);
      return {
        size: parseFloat(s.fontSize),
        transform: s.textTransform,
        color: s.color,
        p1: root.getPropertyValue('--player-1').trim(),
      };
    });
    expect(type.size).toBeGreaterThan(14);
    expect(type.transform).toBe('uppercase');
    expect(type.color).toBe('rgb(47, 111, 219)');
    expect(type.p1).toBe('#2f6fdb');
  });

  test('the word is the biggest thing on the card', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    const sizes = await page.evaluate(() => ({
      word: parseFloat(getComputedStyle(document.getElementById('card-word')).fontSize),
      cat: parseFloat(getComputedStyle(document.getElementById('card-cat')).fontSize),
    }));
    expect(sizes.word).toBeGreaterThan(sizes.cat);
  });

  test('every card names its own category', async ({ page }) => {
    await page.locator('#cat-none').click();
    await page.locator('.cat[data-cat="Animals"]').click();
    await page.locator('.cat[data-cat="Space"]').click();
    await page.locator('#begin').click();
    await page.locator('#start').click();
    for (let i = 0; i < 6; i++) {
      const shown = await page.locator('#card-cat').textContent();
      expect(['Animals', 'Space']).toContain(shown);
      await page.locator('#skip').click();
    }
  });
});

test.describe('rounds and scoring', () => {
  test('pass scores nothing, got it scores one', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    await page.locator('#skip').click();
    await expect(page.locator('#round-tally')).toHaveText('0');
    await page.locator('#got').click();
    await expect(page.locator('#round-tally')).toHaveText('1');
  });

  test('the round total lands on the team that guessed it', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await page.locator('.count[data-seconds="45"]').click();
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    await page.locator('#got').click();
    await page.clock.fastForward('00:50');

    await expect(page.locator('body')).toHaveAttribute('data-screen', 'over');
    expect(await board(page)).toEqual([
      { name: 'Team 1', score: 1 },
      { name: 'Team 2', score: 0 },
    ]);
  });

  test('pairs mode names the guesser and the clue-giver', async ({ page }) => {
    await page.locator('#mode-pairs').click();
    await page.locator('.count[data-count="5"]').click();
    await oneCategory(page);
    await page.locator('#begin').click();
    await expect(page.locator('#ready-sub'))
      .toHaveText('guesses, Player 2 gives the clues. Both of them score.');
    expect((await board(page)).length).toBe(5);
  });
});

test.describe('presentation', () => {
  test('the how-to modal says the category is disclosed', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toContainText('category is disclosed');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('nothing overflows in either orientation', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
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
    await page.route('**/games/what-am-i/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<span class="tally" id="round-tally">0<\/span>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#round-tally')).toHaveCount(0);
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
