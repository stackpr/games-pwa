const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/somewhere-between/';

const board = page => page.evaluate(() =>
  [...document.querySelectorAll('#board li')].map(li => ({
    name: li.querySelector('.board-name').textContent,
    score: Number(li.querySelector('.board-score').textContent),
  })));

const body = page => page.locator('body');
const targetAt = page => page.evaluate(() =>
  parseFloat(document.getElementById('target').style.left));

/** Sets up a solo table with the given names and reaches the clue screen. */
async function table(page, names) {
  await page.locator('#mode-solo').click();
  await page.locator(`.count[data-count="${names.length}"]`).click();
  await page.locator('#name-mode-type').click();
  for (let i = 0; i < names.length; i++) {
    await page.locator('#name-' + i).fill(names[i]);
  }
  await page.locator('#begin').click();
  await page.locator('#start').click();
}

async function giveClue(page, text) {
  await page.locator('#clue-input').fill(text);
  await page.locator('#lock').click();
}

/** Drags the live marker to a fraction across the track. */
async function dragTo(page, fraction) {
  const box = await page.locator('#track').boundingBox();
  const x = box.x + box.width * fraction;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.up();
}

/** Answers as whoever is up, at a fraction along the scale. */
async function answer(page, fraction) {
  await dragTo(page, fraction);
  await page.locator('#lock').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('giving the clue', () => {
  test('the clue-giver alone sees the target and the bands', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await expect(body(page)).toHaveAttribute('data-phase', 'clue');
    await expect(page.locator('#target')).toBeVisible();
    await expect(page.locator('#band-4')).toBeVisible();
    await expect(page.locator('#play-who')).toHaveText('Ari');
    await expect(page.locator('#dial-hint')).toHaveText('Only you can see the target.');
  });

  test('the clue has to be typed before it can be passed on', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await expect(page.locator('#lock')).toBeDisabled();
    await page.locator('#clue-input').fill('lukewarm');
    await expect(page.locator('#lock')).toBeEnabled();
    await page.locator('#clue-input').fill('   ');
    await expect(page.locator('#lock')).toBeDisabled();
  });

  test('passing it on hides the target and shows the clue', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');

    await expect(body(page)).toHaveAttribute('data-phase', 'guess');
    await expect(page.locator('#target')).toBeHidden();
    await expect(page.locator('#band-4')).toBeHidden();
    await expect(page.locator('#clue-said')).toHaveText('lukewarm');
    await expect(page.locator('#clue-label')).toHaveText('The clue');
  });

  test('a new scale gets a new target and clears the clue', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await page.locator('#clue-input').fill('lukewarm');
    const first = await page.locator('#end-left').textContent();
    await page.locator('#new-scale').click();

    await expect(page.locator('#end-left')).not.toHaveText(first);
    await expect(page.locator('#clue-input')).toHaveValue('');
    await expect(page.locator('#lock')).toBeDisabled();
  });

  test('the target is never dealt against an end', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    for (let i = 0; i < 20; i++) {
      const at = await targetAt(page);
      expect(at).toBeGreaterThanOrEqual(18);
      expect(at).toBeLessThanOrEqual(82);
      await page.locator('#new-scale').click();
    }
  });
});

test.describe('everyone guesses in turn', () => {
  test('each responder takes a turn, the clue-giver does not', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass', 'Dee']);
    await giveClue(page, 'lukewarm');

    await expect(page.locator('#play-who')).toHaveText('Bo');
    await answer(page, 0.3);
    await expect(page.locator('#play-who')).toHaveText('Cass');
    await answer(page, 0.4);
    await expect(page.locator('#play-who')).toHaveText('Dee');
    await expect(page.locator('#lock')).toContainText('Lock in and reveal');
    await answer(page, 0.5);
    await expect(body(page)).toHaveAttribute('data-phase', 'reveal');
  });

  test('the marker resets between players, so nobody can copy',
    async ({ page }) => {
      await table(page, ['Ari', 'Bo', 'Cass', 'Dee']);
      await giveClue(page, 'lukewarm');
      await answer(page, 0.15);

      const left = await page.evaluate(() =>
        parseFloat(document.getElementById('guess').style.left));
      expect(left).toBeCloseTo(50, 0);
      // And no earlier answer is on the track yet.
      await expect(page.locator('.said')).toHaveCount(0);
    });

  test('nobody sees the target while guessing', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
    await expect(page.locator('#target')).toBeHidden();
    await expect(page.locator('#band-2')).toBeHidden();
  });

  test('arrow keys nudge the marker too', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
    await page.locator('#track').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const left = await page.evaluate(() =>
      parseFloat(document.getElementById('guess').style.left));
    expect(left).toBeCloseTo(54, 0);
  });

  test('the screen reader gets a phrase, not the figure', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
    await dragTo(page, 0.5);
    await expect(page.locator('#track')).toHaveAttribute('aria-valuetext', 'halfway');
    await dragTo(page, 0.02);
    const said = await page.locator('#track').getAttribute('aria-valuetext');
    expect(said).toMatch(/hard against/);
    expect(said).not.toMatch(/\d/);
  });
});

test.describe('the reveal', { tag: '@layout' }, () => {
  test('every marker appears, labelled, with the target', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass', 'Dee']);
    await giveClue(page, 'lukewarm');
    await answer(page, 0.2);
    await answer(page, 0.5);
    await answer(page, 0.8);

    await expect(page.locator('.said')).toHaveCount(3);
    await expect(page.locator('#target')).toBeVisible();
    await expect(page.locator('#band-4')).toBeVisible();
    const tags = await page.locator('.said-tag').evaluateAll(els =>
      els.map(e => e.textContent));
    expect(tags).toEqual(['Bo', 'Cass', 'Dee']);
  });

  test('each responder scores their own guess', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
    const at = await targetAt(page);
    await answer(page, at / 100);                 // Bo lands the bullseye
    await answer(page, at > 50 ? 0.01 : 0.99);    // Cass misses entirely

    const rows = await board(page);
    expect(rows.find(r => r.name === 'Bo').score).toBe(4);
    expect(rows.find(r => r.name === 'Cass').score).toBe(0);
  });

  test('the clue-giver takes the sum of everyone else', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass', 'Dee']);
    await giveClue(page, 'lukewarm');
    const at = await targetAt(page);
    await answer(page, at / 100);                    // 4
    await answer(page, (at + 6) / 100);              // 3
    await answer(page, at > 50 ? 0.01 : 0.99);       // 0

    const scores = Object.fromEntries(
      (await board(page)).map(r => [r.name, r.score]));
    expect(scores.Bo).toBe(4);
    expect(scores.Cass).toBe(3);
    expect(scores.Dee).toBe(0);
    // Ari gave the clue and banks 4 + 3 + 0.
    expect(scores.Ari).toBe(7);
    await expect(page.locator('#over-score')).toHaveText('+7');
  });

  test('the round tally names everyone, the clue-giver last', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
    const at = await targetAt(page);
    await answer(page, at / 100);
    await answer(page, at > 50 ? 0.01 : 0.99);

    const tally = await page.locator('#tally-list li').evaluateAll(els =>
      els.map(e => e.textContent));
    expect(tally).toEqual(['Bo +4', 'Cass +0', 'Ari +4']);
    await expect(page.locator('#tally-list li[data-giver]')).toHaveText('Ari +4');
  });

  test('the header total moves with the payout', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
    await expect(page.locator('#score-so-far')).toHaveText('0');
    const at = await targetAt(page);
    await answer(page, at / 100);
    await answer(page, at / 100);
    await expect(page.locator('#score-so-far')).toHaveText('8');
  });

  test('the target stays visible under a marker that landed on it',
    async ({ page }) => {
      await table(page, ['Ari', 'Bo', 'Cass']);
      await giveClue(page, 'lukewarm');
      const at = await targetAt(page);
      await answer(page, at / 100);
      await answer(page, at / 100);
      // A bullseye draws a `.said` over the target; the target has to win.
      const above = await page.evaluate(() =>
        getComputedStyle(document.getElementById('target')).zIndex);
      expect(above).not.toBe('auto');
    });

  test('a clue nobody gets is worth nothing to its author', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'nonsense');
    const at = await targetAt(page);
    const miss = at > 50 ? 0.01 : 0.99;
    await answer(page, miss);
    await answer(page, miss);

    await expect(page.locator('#dial-hint')).toHaveText('Nobody found it.');
    expect((await board(page)).every(r => r.score === 0)).toBe(true);
  });

  test('the scores screen carries the clue that earned them', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
    await answer(page, 0.5);
    await answer(page, 0.5);
    await page.locator('#lock').click();

    await expect(body(page)).toHaveAttribute('data-screen', 'over');
    await expect(page.locator('#over-label')).toHaveText('Ari gave "lukewarm"');
  });

  test('the next round moves the clue on', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
    await answer(page, 0.5);
    await answer(page, 0.5);
    await page.locator('#lock').click();
    await page.locator('#next').click();

    await expect(page.locator('#ready-who')).toHaveText('Bo');
    await page.locator('#start').click();
    await giveClue(page, 'second');
    // Responders answer in seat order, so with Bo giving the clue Ari is up.
    await expect(page.locator('#play-who')).toHaveText('Ari');
  });
});

test.describe('two teams', () => {
  test('the other team is the only responder', async ({ page }) => {
    await page.locator('#begin').click();
    await expect(page.locator('#ready-who')).toHaveText('Team 1');
    await page.locator('#start').click();
    await giveClue(page, 'lukewarm');
    await expect(page.locator('#play-who')).toHaveText('Team 2');

    const at = await targetAt(page);
    await answer(page, at / 100);
    // Team 2 score their guess; Team 1 score the same, as its author.
    expect(await board(page)).toEqual([
      { name: 'Team 1', score: 4 },
      { name: 'Team 2', score: 4 },
    ]);
  });
});

test.describe('presentation', { tag: '@layout' }, () => {
  test('the how-to explains the sum and the no-number rule', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toContainText('added');
    await expect(page.locator('#rules')).toContainText('no percentage on it');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('there is no category picker — the clue is typed', async ({ page }) => {
    await expect(page.locator('.cat')).toHaveCount(0);
    await expect(page.locator('#cat-grid')).toHaveCount(0);
  });

  test('nothing overflows in either orientation', async ({ page }) => {
    await table(page, ['Ari', 'Bo', 'Cass']);
    await giveClue(page, 'lukewarm');
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
      const body2 = (await res.text()).replace(/<ol class="tally-list"[\s\S]*?<\/ol>/, '');
      await route.fulfill({ response: res, body: body2 });
    });
    await page.goto(URL);
    await expect(page.locator('#tally-list')).toHaveCount(0);
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
