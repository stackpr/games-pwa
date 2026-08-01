const { test, expect } = require('@playwright/test');
const { clearState } = require('../helpers');

const URL = '/games/forbidden-words/';

const recent = page => page.evaluate(() => Names.recent());

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the recent-names list', () => {
  test('starts empty and remembers newest first', async ({ page }) => {
    expect(await recent(page)).toEqual([]);
    await page.evaluate(() => { Names.remember('Ari'); Names.remember('Bo'); });
    expect(await recent(page)).toEqual(['Bo', 'Ari']);
  });

  test('a name already on the list is promoted, not duplicated',
    async ({ page }) => {
      await page.evaluate(() => Names.remember(['Ari', 'Bo', 'Cass']));
      expect(await recent(page)).toEqual(['Ari', 'Bo', 'Cass']);
      await page.evaluate(() => Names.remember('Cass'));
      expect(await recent(page)).toEqual(['Cass', 'Ari', 'Bo']);
    });

  test('matching is case-insensitive, and the newest spelling wins',
    async ({ page }) => {
      await page.evaluate(() => Names.remember('ari'));
      await page.evaluate(() => Names.remember('Ari'));
      expect(await recent(page)).toEqual(['Ari']);
    });

  test('blank and whitespace names are not remembered', async ({ page }) => {
    await page.evaluate(() => Names.remember(['', '   ', null, 'Ari']));
    expect(await recent(page)).toEqual(['Ari']);
  });

  test('names are trimmed and capped in length', async ({ page }) => {
    const out = await page.evaluate(() => {
      Names.remember('   Bo   ');
      Names.remember('A'.repeat(40));
      return Names.recent();
    });
    expect(out[1]).toBe('Bo');
    expect(out[0].length).toBe(16);
  });

  test('the list stops at twenty', async ({ page }) => {
    const out = await page.evaluate(() => {
      for (let i = 0; i < 30; i++) Names.remember('P' + i);
      return Names.recent();
    });
    expect(out.length).toBe(20);
    expect(out[0]).toBe('P29');
  });

  test('forget removes one name and leaves the rest', async ({ page }) => {
    await page.evaluate(() => Names.remember(['Ari', 'Bo', 'Cass']));
    await page.evaluate(() => Names.forget('bo'));
    expect(await recent(page)).toEqual(['Ari', 'Cass']);
  });

  test('a corrupt list reads as empty rather than throwing', async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem('games.party-names.v1', JSON.stringify({ recent: 'nope' })));
    expect(await recent(page)).toEqual([]);
  });
});

test.describe('picking names in setup', () => {
  test('a first run has nothing to pick, so it offers typing',
    async ({ page }) => {
      await page.locator('#mode-solo').click();
      await expect(page.locator('#name-mode-type')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.recent-empty')).toBeHidden();
      await expect(page.locator('#name-0')).toBeVisible();
    });

  test('typed names show up in the list next time', async ({ page }) => {
    await page.locator('#mode-solo').click();
    await page.locator('#name-0').fill('Ari');
    await page.locator('#name-1').fill('Bo');
    await page.locator('#name-1').blur();
    await page.reload();

    await page.locator('#name-mode-pick').click();
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('.recent')].map(b => b.textContent));
    expect(chips).toContain('Ari');
    expect(chips).toContain('Bo');
  });

  test('ticking names seats them, and the player count follows',
    async ({ page }) => {
      await page.evaluate(() =>
        Names.remember(['Dee', 'Cass', 'Bo', 'Ari']));
      await page.reload();
      await page.locator('#mode-solo').click();
      await page.locator('#name-mode-pick').click();

      for (const name of ['Ari', 'Bo', 'Cass', 'Dee']) {
        await page.locator(`.recent[data-name="${name}"]`).click();
      }
      await expect(page.locator('.count[data-count="4"]'))
        .toHaveAttribute('aria-pressed', 'true');

      await page.locator('#cat-none').click();
      await page.locator('.cat[data-cat="Animals"]').click();
      await page.locator('#begin').click();
      const seated = await page.evaluate(() =>
        [...document.querySelectorAll('#board .board-name')].map(n => n.textContent));
      expect(seated).toEqual(['Ari', 'Bo', 'Cass', 'Dee']);
    });

  test('unticking a name takes the seat away again', async ({ page }) => {
    await page.evaluate(() => Names.remember(['Ari', 'Bo', 'Cass', 'Dee']));
    await page.reload();
    await page.locator('#mode-solo').click();
    await page.locator('#name-mode-pick').click();
    for (const name of ['Ari', 'Bo', 'Cass', 'Dee']) {
      await page.locator(`.recent[data-name="${name}"]`).click();
    }
    await page.locator('.recent[data-name="Bo"]').click();
    await expect(page.locator('.recent[data-name="Bo"]'))
      .toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.count[data-count="3"]'))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('the seats never drop below the minimum table', async ({ page }) => {
    await page.evaluate(() => Names.remember(['Ari', 'Bo']));
    await page.reload();
    await page.locator('#mode-solo').click();
    await page.locator('#name-mode-pick').click();
    await page.locator('.recent[data-name="Ari"]').click();
    await expect(page.locator('.count[data-count="3"]'))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('the list is shared across the party games', async ({ page }) => {
    await page.evaluate(() => Names.remember(['Ari', 'Bo']));
    await page.goto('/games/star-words/');
    expect(await recent(page)).toEqual(['Ari', 'Bo']);
    await page.goto('/games/somewhere-between/');
    expect(await recent(page)).toEqual(['Ari', 'Bo']);
  });
});
