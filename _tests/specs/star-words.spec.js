const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/star-words/';
const card = page => page.locator('#card');
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

test.describe('the covered card', { tag: '@layout' }, () => {
  test('a dealt card is covered until the drawer asks', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();

    await expect(card(page)).toHaveAttribute('data-hidden', '');
    await expect(page.locator('#reveal')).toBeVisible();
    // Covered means covered: the word must not be readable behind it.
    const shown = await page.evaluate(() =>
      getComputedStyle(document.getElementById('card-word')).visibility);
    expect(shown).toBe('hidden');
  });

  test('revealing shows the word and its category', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    await page.locator('#reveal').click();

    await expect(card(page)).not.toHaveAttribute('data-hidden', /.*/);
    await expect(page.locator('#card-word')).not.toBeEmpty();
    await expect(page.locator('#card-cat')).toHaveText('Animals');
  });

  test('only the first card of a round is covered', async ({ page }) => {
    // Tapping through must not put a cover between every word: the drawer
    // already has the screen, and the clock is running.
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    await page.locator('#reveal').click();
    await page.locator('#got').click();
    await expect(card(page)).not.toHaveAttribute('data-hidden', /.*/);
    await page.locator('#got').click();
    await expect(card(page)).not.toHaveAttribute('data-hidden', /.*/);
  });

  test('the next round covers again', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await page.locator('.count[data-seconds="60"]').click();
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    await page.locator('#reveal').click();
    await page.clock.fastForward('01:05');
    await page.locator('#next').click();
    await page.locator('#start').click();
    await expect(card(page)).toHaveAttribute('data-hidden', '');
  });

  test('there is no foul button — only got it and skip', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    await expect(page.locator('.act')).toHaveCount(2);
    await expect(page.locator('#foul')).toHaveCount(0);
  });
});

test.describe('rounds and scoring', () => {
  test('rounds run longer than the talking games', async ({ page }) => {
    const offered = await page.evaluate(() =>
      [...document.querySelectorAll('#secs-row .count')].map(b => Number(b.dataset.seconds)));
    expect(offered).toEqual([60, 90, 120, 180]);
  });

  test('the round total lands on the team that drew it', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await page.locator('.count[data-seconds="60"]').click();
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    await page.locator('#reveal').click();
    await page.locator('#got').click();
    await page.locator('#got').click();
    await page.clock.fastForward('01:05');

    await expect(page.locator('body')).toHaveAttribute('data-screen', 'over');
    await expect(page.locator('#over-score')).toHaveText('+2');
    expect(await board(page)).toEqual([
      { name: 'Team 1', score: 2 },
      { name: 'Team 2', score: 0 },
    ]);
  });

  test('solo mode scores the named guesser and the drawer', async ({ page }) => {
    await page.locator('#mode-solo').click();
    await page.locator('.count[data-count="4"]').click();
    await page.locator('#name-mode-type').click();
    for (const [i, name] of ['Ari', 'Bo', 'Cass', 'Dee'].entries()) {
      await page.locator('#name-' + i).fill(name);
    }
    await oneCategory(page);
    await page.locator('#begin').click();
    await expect(page.locator('#ready-sub'))
      .toHaveText('draws. Whoever gets it scores, and so do they.');

    await page.locator('#start').click();
    await page.locator('#reveal').click();
    const who = await page.evaluate(() =>
      [...document.querySelectorAll('.who-btn')].map(b => b.textContent));
    expect(who).toEqual(['Bo', 'Cass', 'Dee']);

    await page.locator('.who-btn[data-seat="3"]').click();
    expect((await board(page)).map(r => r.score)).toEqual([1, 0, 0, 1]);
    // And the next word is already up, with no cover in between.
    await expect(card(page)).not.toHaveAttribute('data-hidden', /.*/);
  });
});

test.describe('presentation', { tag: '@layout' }, () => {
  test('the how-to modal bans letters and names the trademark', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toContainText('No letters');
    await expect(page.locator('#rules')).toContainText('trademark');
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
    await page.route('**/games/star-words/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button class="reveal"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#reveal')).toHaveCount(0);
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
