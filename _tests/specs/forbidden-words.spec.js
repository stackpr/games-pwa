const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/forbidden-words/';

const screen = page => page.locator('body');
const word = page => page.locator('#card-word');
const banned = page => page.locator('#banned li:not(.banned-head)');
const tally = page => page.locator('#round-tally');
const board = page => page.evaluate(() =>
  [...document.querySelectorAll('#board li')].map(li => ({
    name: li.querySelector('.board-name').textContent,
    score: Number(li.querySelector('.board-score').textContent),
    up: li.hasAttribute('data-up'),
  })));

/** Cuts the setup down to one category so a deck is small and predictable. */
async function oneCategory(page, name = 'Animals') {
  await page.locator('#cat-none').click();
  await page.locator(`.cat[data-cat="${name}"]`).click();
}

async function startRound(page) {
  await page.locator('#begin').click();
  await page.locator('#start').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('setup', () => {
  test('opens on setup with every category picked', async ({ page }) => {
    await expect(screen(page)).toHaveAttribute('data-screen', 'setup');
    await expect(page.locator('.cat[aria-pressed="true"]')).toHaveCount(30);
    await expect(page.locator('#begin')).toBeEnabled();
  });

  test('picking no categories disables starting', async ({ page }) => {
    await page.locator('#cat-none').click();
    await expect(page.locator('#begin')).toBeDisabled();
    await page.locator('#cat-all').click();
    await expect(page.locator('#begin')).toBeEnabled();
  });

  test('the word count follows the categories picked', async ({ page }) => {
    await oneCategory(page);
    await expect(page.locator('#cat-count')).toHaveText('· 1 picked, 50 words');
  });

  test('the player count only applies to the pairs mode', async ({ page }) => {
    await expect(page.locator('#players-field')).toBeHidden();
    await page.locator('#mode-pairs').click();
    await expect(page.locator('#players-field')).toBeVisible();
    await expect(page.locator('#mode-pairs')).toHaveAttribute('aria-pressed', 'true');
  });

  test('settings survive a reload', async ({ page }) => {
    await page.locator('#mode-pairs').click();
    await page.locator('.count[data-count="6"]').click();
    await page.locator('.count[data-seconds="90"]').click();
    await oneCategory(page, 'Space');
    await page.reload();

    await expect(page.locator('#mode-pairs')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.count[data-count="6"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.count[data-seconds="90"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cat[aria-pressed="true"]')).toHaveCount(1);
  });
});

test.describe('a round', () => {
  test('start deals a card with its banned words', async ({ page }) => {
    await oneCategory(page);
    await startRound(page);

    await expect(screen(page)).toHaveAttribute('data-screen', 'play');
    await expect(word(page)).not.toBeEmpty();
    await expect(page.locator('#card-cat')).toHaveText('Animals');
    await expect(banned(page)).toHaveCount(5);
  });

  test('the banned words are never the word itself', async ({ page }) => {
    await oneCategory(page);
    await startRound(page);
    const shown = await page.evaluate(() => ({
      word: document.getElementById('card-word').textContent.toLowerCase(),
      banned: [...document.querySelectorAll('#banned li:not(.banned-head)')]
        .map(li => li.textContent.toLowerCase()),
    }));
    expect(shown.banned).not.toContain(shown.word);
  });

  test('each button scores and deals the next card', async ({ page }) => {
    await oneCategory(page);
    await startRound(page);

    const first = await word(page).textContent();
    await page.locator('#got').click();
    await expect(tally(page)).toHaveText('1');
    await expect(word(page)).not.toHaveText(first);

    await page.locator('#skip').click();
    await expect(tally(page)).toHaveText('1');

    await page.locator('#foul').click();
    await expect(tally(page)).toHaveText('0');
  });

  test('a card does not come round again while the deck lasts', async ({ page }) => {
    await oneCategory(page);
    await startRound(page);
    const seen = [];
    for (let i = 0; i < 12; i++) {
      seen.push(await word(page).textContent());
      await page.locator('#skip').click();
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('the clock counts down and warns near the end', async ({ page }) => {
    await page.locator('.count[data-seconds="45"]').click();
    await oneCategory(page);
    await startRound(page);
    await expect(page.locator('#clock')).toHaveText('0:45');
    await expect(page.locator('#clock')).not.toHaveAttribute('data-low', /.*/);
  });
});

test.describe('scoring', () => {
  /**
   * Runs the clock out instead of waiting it out. Timer derives the time
   * left from a start timestamp, so the mocked clock has to be installed
   * before the page loads for both halves to agree.
   */
  async function timedRound(page, taps) {
    await page.clock.install();
    await page.goto(URL);
    await page.locator('.count[data-seconds="45"]').click();
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    for (const id of taps) await page.locator('#' + id).click();
    await page.clock.fastForward('00:50');
    await expect(screen(page)).toHaveAttribute('data-screen', 'over');
  }

  test('the round total lands on the team that played it', async ({ page }) => {
    await timedRound(page, ['got', 'got', 'got']);
    await expect(page.locator('#over-score')).toHaveText('+3');
    expect(await board(page)).toEqual([
      { name: 'Team 1', score: 3, up: false },
      { name: 'Team 2', score: 0, up: true },
    ]);
  });

  test('the next round is the other team', async ({ page }) => {
    await timedRound(page, ['got']);
    await page.locator('#next').click();
    await expect(page.locator('#ready-who')).toHaveText('Team 2');
    await expect(page.locator('#ready-who')).toHaveAttribute('data-seat', '2');
  });

  test('a foul can take a round negative', async ({ page }) => {
    await timedRound(page, ['foul', 'foul']);
    await expect(page.locator('#over-score')).toHaveText('-2');
    expect((await board(page))[0].score).toBe(-2);
  });

  test('pairs mode gives the point to both seats', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await page.locator('#mode-pairs').click();
    await page.locator('.count[data-count="4"]').click();
    await page.locator('.count[data-seconds="45"]').click();
    await oneCategory(page);
    await page.locator('#begin').click();
    await page.locator('#start').click();
    await page.locator('#got').click();
    await page.locator('#got').click();
    await page.clock.fastForward('00:50');

    const rows = await board(page);
    expect(rows.map(r => r.score)).toEqual([2, 2, 0, 0]);
  });

  test('pairs mode pairs everyone up over the rounds', async ({ page }) => {
    // Four players: the presenter walks a seat a round and the guesser
    // slides an extra seat each lap, so nobody is stuck with one partner.
    const pairs = await page.evaluate(() => {
      const state = Party.blank('pairs', 4);
      const out = [];
      for (let r = 0; r < 8; r++) {
        state.round = r;
        const roles = Party.roles(state);
        out.push(roles.present + '-' + roles.guess);
      }
      return out;
    });
    expect(new Set(pairs.slice(0, 4)).size).toBe(4);
    expect(pairs.slice(0, 4)).not.toEqual(pairs.slice(4, 8));
  });

  test('pairs mode never pairs a player with themselves', async ({ page }) => {
    const bad = await page.evaluate(() => {
      const out = [];
      for (let n = Party.MIN_PLAYERS; n <= Party.MAX_PLAYERS; n++) {
        const state = Party.blank('pairs', n);
        for (let r = 0; r < n * n; r++) {
          state.round = r;
          const roles = Party.roles(state);
          if (roles.present === roles.guess) out.push(n + '@' + r);
        }
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('changing the mode starts the scores over', async ({ page }) => {
    await oneCategory(page);
    await page.locator('#begin').click();
    expect((await board(page)).map(r => r.name)).toEqual(['Team 1', 'Team 2']);

    await page.locator('#setup-btn').click();
    await page.locator('#mode-pairs').click();
    await page.locator('.count[data-count="5"]').click();
    await page.locator('#begin').click();
    expect((await board(page)).length).toBe(5);
  });
});

test.describe('presentation', () => {
  test('the how-to modal names the foul rule', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toBeVisible();
    await expect(page.locator('#rules')).toContainText('Foul');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('nothing overflows sideways', async ({ page }) => {
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 },
      { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `${size.width}x${size.height}`).toBeLessThanOrEqual(0);
    }
  });

  test('the play screen fits without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await oneCategory(page);
    await startRound(page);
    const over = await page.evaluate(() =>
      document.documentElement.scrollHeight - window.innerHeight);
    expect(over).toBeLessThanOrEqual(0);
  });

  test('survives markup from the neighbouring release', async ({ page }) => {
    const errors = trackErrors(page);
    await page.route('**/games/forbidden-words/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button class="chip small" id="cat-all"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#cat-all')).toHaveCount(0);
    await expect(page.locator('.cat')).toHaveCount(30);
    await expect(page.locator('#begin')).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});
