const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/fishbowl/';
const KEY = 'games.fishbowl.v1';

const screen = page => page.locator('body').getAttribute('data-screen');
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const board = (page, id) => page.evaluate(sel =>
  [...document.querySelectorAll(sel + ' li')].map(li => ({
    name: li.querySelector('.board-name').textContent,
    score: Number(li.querySelector('.board-score').textContent),
  })), '#' + id);

/** Types one player's answers, and their name, and moves on. */
async function player(page, answers, opts = {}) {
  const inputs = page.locator('.slip-input');
  if (opts.name) await page.locator('#who-name').fill(opts.name);
  for (let i = 0; i < answers.length; i++) await inputs.nth(i).fill(answers[i]);
  await page.locator(opts.button || '#next-player').click();
}

/**
 * Straight to a turn in progress: one player's slips, two teams, and the
 * clock started. Most tests want the play screen and nothing before it.
 */
async function toPlay(page, answers = ['Otter', 'Puffin', 'Badger']) {
  await page.locator('#begin').click();
  await player(page, answers, { button: '#no-more' });
  await page.locator('#start').click();
  expect(await screen(page)).toBe('play');
}

/** The same, scoring by name, with three players who wrote one answer each. */
async function toSolo(page) {
  await page.locator('#mode-solo').click();
  await page.locator('.count[data-answers="1"]').click();
  await page.locator('#begin').click();
  await player(page, ['Otter'], { name: 'Ada' });
  await player(page, ['Puffin'], { name: 'Ben' });
  await player(page, ['Badger'], { name: 'Cy', button: '#no-more' });
  await page.locator('#start').click();
  expect(await screen(page)).toBe('play');
}

/** The slip on the card, whichever one was drawn. */
const word = page => page.locator('#word').textContent();

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('setting up', () => {
  test('opens on setup with a question, two teams and a minute',
    async ({ page }) => {
      expect(await screen(page)).toBe('setup');
      await expect(page.locator('.cat[aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('.count[data-teams="2"]'))
        .toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.count[data-secs="60"]'))
        .toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#clock')).toHaveText('1:00');
    });

  test('offers a set of questions and takes one of your own', async ({ page }) => {
    await expect(page.locator('#questions .cat')).toHaveCount(10);
    await page.locator('.cat[data-q="An animal"]').click();
    await expect(page.locator('.cat[data-q="An animal"]'))
      .toHaveAttribute('aria-pressed', 'true');

    await page.locator('#question-own').fill('A terrible film');
    // Two selected questions would be a lie about what everyone is writing.
    await expect(page.locator('.cat[aria-pressed="true"]')).toHaveCount(0);
    await page.locator('#begin').click();
    await expect(page.locator('#write-q')).toHaveText('A terrible film');
  });

  test('two to six teams, and the turn length changes the clock',
    async ({ page }) => {
      await expect(page.locator('.count[data-teams]')).toHaveCount(5);
      await page.locator('.count[data-teams="4"]').click();
      expect((await saved(page)).teams).toBe(4);
      await expect(page.locator('#team-names .team-row')).toHaveCount(4);

      await page.locator('.count[data-secs="30"]').click();
      await expect(page.locator('#clock')).toHaveText('0:30');
    });
});

test.describe('the settings', () => {
  test('how many answers each changes the form', async ({ page }) => {
    await page.locator('.count[data-answers="5"]').click();
    await page.locator('#begin').click();
    await expect(page.locator('.slip-input')).toHaveCount(5);
    await expect(page.locator('#write-note')).toContainText('5 answers');

    await player(page, ['a', 'b', 'c', 'd', 'e']);
    expect((await saved(page)).slips).toHaveLength(5);
  });

  test('one answer each is allowed', async ({ page }) => {
    await page.locator('.count[data-answers="1"]').click();
    await page.locator('#begin').click();
    await expect(page.locator('.slip-input')).toHaveCount(1);
    await expect(page.locator('#write-note')).toContainText('1 answer,');
  });

  test('repeats can be allowed', async ({ page }) => {
    await page.locator('#unique-off').click();
    await page.locator('#begin').click();
    await player(page, ['Otter', 'Puffin', 'Badger']);
    await player(page, ['Otter', 'Vole', 'Heron']);

    // Taken, not refused: the setting says the bowl may hold repeats.
    expect((await saved(page)).slips).toHaveLength(6);
    await expect(page.locator('#write-who')).toHaveText('Player 3');
  });

  test('the scoring mode decides whether teams are asked for',
    async ({ page }) => {
      await expect(page.locator('#teams-row')).toBeVisible();
      await page.locator('#mode-solo').click();
      // Scoring by name seats whoever fills the bowl, so there is no count
      // to set. See _README.md.
      await expect(page.locator('#teams-row')).toBeHidden();
      await expect(page.locator('body')).toHaveAttribute('data-mode', 'solo');
      await page.locator('#mode-teams').click();
      await expect(page.locator('#teams-row')).toBeVisible();
    });
});

test.describe('scoring by name', () => {
  test('the buttons are everyone but the clue-giver', async ({ page }) => {
    await toSolo(page);
    await expect(page.locator('#play-who')).toHaveText('Ada');
    await expect(page.locator('.who-btn')).toHaveText(['Ben', 'Cy']);
    // The teams row of Skip and Got it is not the interface here.
    await expect(page.locator('.actions')).toBeHidden();
    await expect(page.locator('#who-row')).toBeVisible();
  });

  test('the point goes to the guesser and the clue-giver', async ({ page }) => {
    await toSolo(page);
    await page.locator('.who-btn', { hasText: 'Cy' }).click();

    expect((await saved(page)).scores).toEqual([1, 0, 1]);
    await expect(page.locator('#tally')).toHaveText('1');
  });

  test('the name box remembers who has played', async ({ page }) => {
    await toSolo(page);
    await page.reload();
    const known = await page.evaluate(() =>
      [...document.querySelectorAll('#recent-names option')].map(o => o.value));
    expect(known).toContain('Ada');
    expect(known).toContain('Cy');
  });

  test('naming needs somebody to name', async ({ page }) => {
    await page.locator('#mode-solo').click();
    await page.locator('.count[data-answers="1"]').click();
    await page.locator('#begin').click();
    await player(page, ['Otter'], { name: 'Ada', button: '#no-more' });

    // One player has nobody to give clues to.
    expect(await screen(page)).toBe('write');
    await expect(page.locator('#bowl-count')).toContainText('Two players at least');
  });

  test('an unnamed player is numbered rather than blank', async ({ page }) => {
    await page.locator('#mode-solo').click();
    await page.locator('.count[data-answers="1"]').click();
    await page.locator('#begin').click();
    await player(page, ['Otter']);
    await player(page, ['Puffin'], { button: '#no-more' });
    await expect(page.locator('#ready-who')).toHaveText('Player 1');
  });
});

test.describe('filling the bowl', () => {
  test('takes three answers a player at a time', async ({ page }) => {
    await page.locator('#begin').click();
    expect(await screen(page)).toBe('write');
    await expect(page.locator('#write-who')).toHaveText('Player 1');

    await player(page, ['Otter', 'Puffin', 'Badger']);
    await expect(page.locator('#write-who')).toHaveText('Player 2');
    await expect(page.locator('.slip-input').first()).toHaveValue('');
    await expect(page.locator('#bowl-count')).toContainText('3 slips');

    await player(page, ['Heron', 'Vole', 'Pine marten']);
    await expect(page.locator('#write-who')).toHaveText('Player 3');
    await expect(page.locator('#bowl-count')).toContainText('6 slips');
    expect((await saved(page)).slips).toHaveLength(6);
  });

  test('Next player wants all three answers', async ({ page }) => {
    await page.locator('#begin').click();
    await expect(page.locator('#next-player')).toBeDisabled();
    await page.locator('.slip-input').nth(0).fill('Otter');
    await page.locator('.slip-input').nth(1).fill('Puffin');
    await expect(page.locator('#next-player')).toBeDisabled();
    await page.locator('.slip-input').nth(2).fill('Badger');
    await expect(page.locator('#next-player')).toBeEnabled();
  });

  test('the same answer cannot go in the bowl twice', async ({ page }) => {
    await page.locator('#begin').click();
    await player(page, ['Otter', 'Puffin', 'Badger']);
    await player(page, ['Heron', 'otter', 'Vole']);

    await expect(page.locator('#bowl-count')).toContainText('already in the bowl');
    expect((await saved(page)).slips).toHaveLength(3);
    // Nothing was taken, so the player is still the one typing.
    await expect(page.locator('#write-who')).toHaveText('Player 2');
  });

  test('No more players needs a bowl, and one player is enough',
    async ({ page }) => {
      await page.locator('#begin').click();
      await expect(page.locator('#no-more')).toBeDisabled();
      await player(page, ['Otter', 'Puffin', 'Badger'], { button: '#no-more' });

      expect(await screen(page)).toBe('ready');
      expect((await saved(page)).slips).toHaveLength(3);
    });

  test('a part-filled form is dropped rather than taken', async ({ page }) => {
    await page.locator('#begin').click();
    await player(page, ['Otter', 'Puffin', 'Badger']);
    await page.locator('.slip-input').nth(0).fill('Half an answer');
    await page.locator('#no-more').click();

    expect(await screen(page)).toBe('ready');
    expect((await saved(page)).slips).toEqual(['Otter', 'Puffin', 'Badger']);
  });
});

test.describe('a turn', () => {
  test('Got it scores and deals the next slip', async ({ page }) => {
    await toPlay(page);
    const first = await word(page);
    await expect(page.locator('#tally')).toHaveText('0');

    await page.locator('#got').click();
    await expect(page.locator('#tally')).toHaveText('1');
    expect(await word(page)).not.toBe(first);
    expect((await saved(page)).scores).toEqual([1, 0]);
  });

  test('Pass sets the slip aside until the turn ends', async ({ page }) => {
    await toPlay(page);
    const first = await word(page);
    await page.locator('#pass').click();

    // Not back in the bowl: it cannot come round again this turn.
    expect(await word(page)).not.toBe(first);
    await expect(page.locator('#tally')).toHaveText('0');
    expect((await saved(page)).aside).toHaveLength(1);

    await page.locator('#pass').click();
    // Two aside and one in hand is the whole bowl, so passing the last one
    // ends the turn rather than dealing from nothing.
    await page.locator('#pass').click();
    expect(await screen(page)).toBe('between');
    expect((await saved(page)).aside).toHaveLength(0);
    expect((await saved(page)).left).toHaveLength(3);
  });

  test('the clock ends the turn and passes the phone', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
    await toPlay(page);
    await expect(page.locator('#clock')).toHaveText('1:00');
    await page.locator('#got').click();

    await page.clock.runFor(51000);
    await expect(page.locator('#clock')).toHaveText('0:09');
    await expect(page.locator('#clock')).toHaveAttribute('data-low', '');

    await page.clock.runFor(10000);
    expect(await screen(page)).toBe('between');
    await expect(page.locator('#between-title')).toHaveText('+1');
    await expect(page.locator('#between-sub')).toContainText('Team 2');
    // The point scored before the buzzer stands.
    expect((await saved(page)).scores).toEqual([1, 0]);
  });

  test('an emptied bowl ends the round and refills it', async ({ page }) => {
    await toPlay(page);
    for (let i = 0; i < 3; i++) await page.locator('#got').click();

    expect(await screen(page)).toBe('between');
    await expect(page.locator('#between-label')).toHaveText('Round over');
    await expect(page.locator('#carry-on')).toHaveText('Start One word');
    const state = await saved(page);
    expect(state.round).toBe(1);
    expect(state.left).toHaveLength(3);
    expect(state.scores).toEqual([3, 0]);
  });

  test('three rounds and then the game is over', async ({ page }) => {
    await toPlay(page);
    for (const name of ['One word', 'Act it out']) {
      for (let i = 0; i < 3; i++) await page.locator('#got').click();
      await expect(page.locator('#carry-on')).toHaveText('Start ' + name);
      await page.locator('#carry-on').click();
      await page.locator('#start').click();
    }
    for (let i = 0; i < 3; i++) await page.locator('#got').click();

    // Each round opens on the seat after the one that closed the last, so
    // three rounds of three slips fall 3-3-3 across two teams as 6 and 3.
    expect(await screen(page)).toBe('over');
    await expect(page.locator('#over-score')).toHaveText('6');
    expect(await board(page, 'over-board')).toEqual([
      { name: 'Team 1', score: 6 }, { name: 'Team 2', score: 3 }]);
  });

  test('the card names the round it is being given in', async ({ page }) => {
    await toPlay(page);
    await expect(page.locator('#card-cat')).toHaveText('Describe it');
    await expect(page.locator('#word')).not.toBeEmpty();
  });
});

test.describe('teams', () => {
  test('named in settings, and the names stick', async ({ page }) => {
    await page.locator('.count[data-teams="3"]').click();
    await page.locator('#settings-btn').click();
    const names = page.locator('#team-names input');
    await names.nth(0).fill('Sharks');
    await names.nth(2).fill('Owls');
    await page.keyboard.press('Escape');

    await toPlay(page);
    await expect(page.locator('#play-who')).toHaveText('Sharks');
    expect((await saved(page)).names).toEqual(['Sharks', '', 'Owls']);

    await page.reload();
    await page.locator('#settings-btn').click();
    await expect(page.locator('#team-names input').nth(2)).toHaveValue('Owls');
  });

  test('an unnamed team is numbered rather than blank', async ({ page }) => {
    await toPlay(page);
    await expect(page.locator('#play-who')).toHaveText('Team 1');
    expect(await board(page, 'between-board')).toEqual([
      { name: 'Team 1', score: 0 }, { name: 'Team 2', score: 0 }]);
  });

  test('the turn passes round every team in order', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL);
    await clearState(page);
    await page.locator('.count[data-teams="3"]').click();
    await toPlay(page);

    await expect(page.locator('#play-who')).toHaveText('Team 1');
    await page.clock.runFor(61000);
    await page.locator('#carry-on').click();
    await expect(page.locator('#ready-who')).toHaveText('Team 2');
    await page.locator('#start').click();
    await page.clock.runFor(61000);
    await page.locator('#carry-on').click();
    await expect(page.locator('#ready-who')).toHaveText('Team 3');
  });
});

test.describe('the page itself', () => {
  test('a reload during a turn spends it and keeps the points',
    async ({ page }) => {
      await toPlay(page);
      await page.locator('#got').click();
      await page.reload();

      // The clock stopped while the page was gone; there is no honest time
      // to restart it with. See _README.md.
      expect(await screen(page)).toBe('between');
      const state = await saved(page);
      expect(state.scores).toEqual([1, 0]);
      expect(state.turn).toBe(1);
      // The slip in hand went back in the bowl rather than being lost.
      expect(state.left).toHaveLength(2);
      await expect(page.locator('#between-sub')).toContainText('Team 2');
    });

  test('the bowl survives a reload while it is being filled', async ({ page }) => {
    await page.locator('#begin').click();
    await player(page, ['Otter', 'Puffin', 'Badger']);
    await page.reload();

    expect(await screen(page)).toBe('write');
    await expect(page.locator('#write-who')).toHaveText('Player 2');
    await expect(page.locator('#bowl-count')).toContainText('3 slips');
  });

  test('the rules dialog opens and closes', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toHaveAttribute('data-open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).not.toHaveAttribute('data-open', '');
  });

  test('New game goes back to setup', async ({ page }) => {
    await toPlay(page);
    await page.locator('#setup-btn').click();
    expect(await screen(page)).toBe('setup');
    expect((await saved(page)).slips).toEqual([]);
  });

  test('nothing leaves the origin, and nothing throws', async ({ page }) => {
    const external = trackExternalRequests(page);
    const errors = trackErrors(page);
    await page.goto(URL);
    await clearState(page);
    await toPlay(page);
    await page.locator('#got').click();
    await page.locator('#pass').click();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
});
