const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/the-faker/';
const KEY = 'games.the-faker.v1';

const body = page => page.locator('body');
const tiles = page => page.locator('#grid .tile');
const role = page => page.locator('#role');

/** Sets the table size on the setup screen. */
async function seats(page, n) {
  await page.locator(`#count-row .count[data-count="${n}"]`).click();
}

/** Deals, then walks the phone round every seat, collecting each card. */
async function passRound(page, n) {
  await page.locator('#begin').click();
  const cards = [];
  for (let i = 0; i < n; i++) {
    await expect(body(page)).toHaveAttribute('data-screen', 'ready');
    const who = await page.locator('#ready-who').textContent();
    await page.locator('#show').click();
    await expect(body(page)).toHaveAttribute('data-screen', 'play');
    cards.push({
      who: who,
      role: await role(page).getAttribute('data-role'),
      text: await role(page).textContent(),
      marked: await page.locator('#grid .tile[data-secret]').count(),
      words: await tiles(page).evaluateAll(els => els.map(e => e.textContent)),
      topic: await page.locator('#topic').textContent(),
    });
    await page.locator('#hide').click();
  }
  return cards;
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the board', () => {
  test('is sixteen words from one category', async ({ page }) => {
    await page.locator('#begin').click();
    await page.locator('#show').click();

    await expect(tiles(page)).toHaveCount(16);
    const topic = await page.locator('#topic').textContent();
    const known = await page.evaluate(() => Vocab.categories());
    expect(known).toContain(topic);

    // Every word on the board really is from that category, and no word is
    // on it twice.
    const words = await tiles(page).evaluateAll(els => els.map(e => e.textContent));
    const inCategory = await page.evaluate(cat =>
      Vocab.terms(cat).map(t => t.word), topic);
    for (const word of words) expect(inCategory).toContain(word);
    expect(new Set(words).size).toBe(16);
  });

  test('follows the categories that are picked', async ({ page }) => {
    await page.locator('#cat-none').click();
    await expect(page.locator('#begin')).toBeDisabled();

    await page.locator('.cat[data-cat="Animals"]').click();
    await expect(page.locator('#begin')).toBeEnabled();
    await page.locator('#begin').click();
    await page.locator('#show').click();
    await expect(page.locator('#topic')).toHaveText('Animals');
  });

  test('everyone sees the same sixteen words', async ({ page }) => {
    await seats(page, 4);
    const cards = await passRound(page, 4);
    for (const card of cards) {
      expect(card.words).toEqual(cards[0].words);
      expect(card.topic).toBe(cards[0].topic);
    }
  });
});

test.describe('the roles', () => {
  test('exactly one player is left in the dark', async ({ page }) => {
    await seats(page, 4);
    const cards = await passRound(page, 4);

    const fakers = cards.filter(c => c.role === 'faker');
    expect(fakers).toHaveLength(1);
    expect(cards.filter(c => c.role === 'knows')).toHaveLength(3);
    // The Faker's board carries no ring; everyone else's does.
    expect(fakers[0].marked).toBe(0);
    for (const card of cards.filter(c => c.role === 'knows')) {
      expect(card.marked).toBe(1);
    }
  });

  test('the players who know are told the same word', async ({ page }) => {
    await seats(page, 4);
    const cards = await passRound(page, 4);
    const told = cards.filter(c => c.role === 'knows')
      .map(c => c.text.replace('The word is ', ''));
    expect(new Set(told).size).toBe(1);
    expect(cards[0].words).toContain(told[0]);
  });

  test('no Understudy below six players', async ({ page }) => {
    await seats(page, 5);
    const cards = await passRound(page, 5);
    expect(cards.filter(c => c.role === 'understudy')).toHaveLength(0);
    await expect(page.locator('#answer-who')).not.toBeVisible();
  });

  test('an Understudy joins at six, with clues and not the word', async ({ page }) => {
    await seats(page, 6);
    const cards = await passRound(page, 6);

    const under = cards.filter(c => c.role === 'understudy');
    expect(under).toHaveLength(1);
    expect(cards.filter(c => c.role === 'faker')).toHaveLength(1);
    // Clues, not the word: no ring on the board, and no word in the text.
    expect(under[0].marked).toBe(0);

    const secret = cards.find(c => c.role === 'knows').text.replace('The word is ', '');
    expect(under[0].text).not.toContain(secret);

    // The clues are the term's own related words — the Forbidden Words list.
    const related = await page.evaluate(word => {
      for (const cat of Vocab.categories()) {
        const hit = Vocab.terms(cat).find(t => t.word === word);
        if (hit) return hit.related;
      }
      return null;
    }, secret);
    expect(related).not.toBeNull();
    for (const clue of related) expect(under[0].text).toContain(clue);
  });

  test('the Understudy can be turned off entirely', async ({ page }) => {
    await seats(page, 6);
    await page.locator('#understudy-row .pick[data-understudy="off"]').click();
    const cards = await passRound(page, 6);
    expect(cards.filter(c => c.role === 'understudy')).toHaveLength(0);
    expect(cards.filter(c => c.role === 'faker')).toHaveLength(1);
  });

  test('the setting says why it is doing nothing below six', async ({ page }) => {
    await seats(page, 4);
    await expect(page.locator('#understudy-note')).toHaveText(/Waiting for 6 players/);
    await seats(page, 6);
    await expect(page.locator('#understudy-note')).toHaveText(/second player/i);
  });
});

test.describe('the round', () => {
  test('passes the phone once per seat, then goes to the table', async ({ page }) => {
    await seats(page, 3);
    await page.locator('#begin').click();
    for (let i = 0; i < 3; i++) {
      await expect(body(page)).toHaveAttribute('data-screen', 'ready');
      await page.locator('#show').click();
      await page.locator('#hide').click();
    }
    await expect(body(page)).toHaveAttribute('data-screen', 'over');
    await expect(page.locator('#talk')).toBeVisible();
    await expect(page.locator('#answer')).toBeHidden();
  });

  test('the shared board gives nothing away', async ({ page }) => {
    await seats(page, 3);
    await passRound(page, 3);
    await expect(page.locator('#talk-grid .tile')).toHaveCount(16);
    await expect(page.locator('#talk-grid .tile[data-secret]')).toHaveCount(0);
  });

  test('the reveal names the word and the Faker', async ({ page }) => {
    await seats(page, 4);
    const cards = await passRound(page, 4);
    const secret = cards.find(c => c.role === 'knows').text.replace('The word is ', '');
    const faker = cards.find(c => c.role === 'faker').who;

    await page.locator('#reveal').click();
    await expect(page.locator('#answer')).toBeVisible();
    await expect(page.locator('#talk')).toBeHidden();
    await expect(page.locator('#answer-word')).toHaveText(secret);
    await expect(page.locator('#answer-who')).toContainText(faker);
  });

  test('the reveal names the Understudy too', async ({ page }) => {
    await seats(page, 6);
    const cards = await passRound(page, 6);
    const under = cards.find(c => c.role === 'understudy').who;
    await page.locator('#reveal').click();
    await expect(page.locator('#answer-who')).toContainText(under);
  });

  test('dealing again gives a new round', async ({ page }) => {
    await seats(page, 3);
    await passRound(page, 3);
    await page.locator('#reveal').click();
    await page.locator('#again').click();
    await expect(body(page)).toHaveAttribute('data-screen', 'ready');
  });
});

test.describe('setup', () => {
  test('the table is set the standard way', async ({ page }) => {
    // The shared setup panel: a count row, the type-or-pick names, and the
    // category grid. See _README.md.
    await expect(page.locator('#count-row .count')).not.toHaveCount(0);
    await expect(page.locator('#players-field')).toBeVisible();
    await expect(page.locator('#names-field')).toBeVisible();
    await expect(page.locator('#cat-grid .cat')).not.toHaveCount(0);
  });

  test('names reach the pass screen and are remembered', async ({ page }) => {
    await seats(page, 3);
    const first = page.locator('#name-inputs .name-input').first();
    await first.fill('Ari');
    await first.blur();

    await page.locator('#begin').click();
    const shown = [];
    for (let i = 0; i < 3; i++) {
      shown.push(await page.locator('#ready-who').textContent());
      await page.locator('#show').click();
      await page.locator('#hide').click();
    }
    expect(shown).toContain('Ari');

    const remembered = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('games.party-names.v1')).recent);
    expect(remembered).toContain('Ari');
  });

  test('an unnamed table still deals', async ({ page }) => {
    // The names array can be empty; the seats come from the count.
    await seats(page, 5);
    const cards = await passRound(page, 5);
    expect(cards.filter(c => c.role === 'faker')).toHaveLength(1);
    expect(cards.map(c => c.who)).toContain('Player 1');
  });

  test('the table survives a reload, and the round does not', async ({ page }) => {
    await seats(page, 6);
    const first = page.locator('#name-inputs .name-input').first();
    await first.fill('Ari');
    await page.locator('#begin').click();
    await expect(body(page)).toHaveAttribute('data-screen', 'ready');

    await page.reload();
    await expect(body(page)).toHaveAttribute('data-screen', 'setup');
    await expect(page.locator('#count-row .count[data-count="6"]'))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#name-inputs .name-input').first()).toHaveValue('Ari');

    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.settings.players).toBe(6);
    expect(saved.round).toBeUndefined();
  });

  test('corrupt saved state falls back to a playable table', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, 'not json'), KEY);
    await page.reload();
    await expect(body(page)).toHaveAttribute('data-screen', 'setup');
    await page.locator('#begin').click();
    await expect(body(page)).toHaveAttribute('data-screen', 'ready');
  });

  test('nothing leaves the origin', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await page.locator('#begin').click();
    await page.locator('#show').click();
    expect(external).toEqual([]);
  });
});
