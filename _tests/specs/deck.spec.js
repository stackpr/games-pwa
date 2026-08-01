const { test, expect } = require('@playwright/test');

const URL = '/games/blackjack/';

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
});

test.describe('the card library', { tag: '@nodom' }, () => {
  test('a deck is fifty-two distinct cards', async ({ page }) => {
    const d = await page.evaluate(() => {
      const cards = Deck.single();
      return { size: cards.length, unique: new Set(cards.map(c => c.code)).size };
    });
    expect(d.size).toBe(52);
    expect(d.unique).toBe(52);
  });

  test('every code is two characters', async ({ page }) => {
    const bad = await page.evaluate(() =>
      Deck.single().filter(c => c.code.length !== 2).map(c => c.code));
    expect(bad).toEqual([]);
  });

  test('codes round-trip through parse', async ({ page }) => {
    const ok = await page.evaluate(() =>
      Deck.single().every(c => {
        const back = Deck.parse(c.code);
        return back && back.rank === c.rank && back.suit === c.suit;
      }));
    expect(ok).toBe(true);
  });

  test('a bad code parses to nothing rather than a half card', async ({ page }) => {
    const out = await page.evaluate(() =>
      ['', 'A', 'XX', '1S', 'AZ', 'ASD'].map(c => Deck.parse(c)));
    expect(out).toEqual([null, null, null, null, null, null]);
  });

  test('hearts and diamonds are the red ones', async ({ page }) => {
    const red = await page.evaluate(() =>
      [...new Set(Deck.single().filter(Deck.isRed).map(c => c.suit))].sort());
    expect(red).toEqual(['D', 'H']);
  });

  test('a shoe holds every deck it was asked for', async ({ page }) => {
    const sizes = await page.evaluate(() =>
      [1, 2, 6, 8].map(n => Deck.shoe(n).remaining()));
    expect(sizes).toEqual([52, 104, 312, 416]);
  });

  test('a shoe deals down without repeating a card', async ({ page }) => {
    const out = await page.evaluate(() => {
      const shoe = Deck.shoe(1);
      const seen = [];
      for (let i = 0; i < 52; i++) seen.push(shoe.draw().code);
      return { unique: new Set(seen).size, left: shoe.remaining() };
    });
    expect(out.unique).toBe(52);
    expect(out.left).toBe(0);
  });

  test('a shoe asks for a shuffle rather than doing it mid-hand', async ({ page }) => {
    const out = await page.evaluate(() => {
      const shoe = Deck.shoe(2);
      const before = shoe.needsShuffle();
      for (let i = 0; i < 80; i++) shoe.draw();
      const after = shoe.needsShuffle();
      shoe.shuffle();
      return { before, after, restored: shoe.remaining() };
    });
    expect(out.before).toBe(false);
    expect(out.after).toBe(true);
    expect(out.restored).toBe(104);
  });

  test('two shuffles come out in different orders', async ({ page }) => {
    const same = await page.evaluate(() => {
      const a = Deck.shuffle(Deck.single()).map(c => c.code).join();
      const b = Deck.shuffle(Deck.single()).map(c => c.code).join();
      return a === b;
    });
    expect(same).toBe(false);
  });

  test('a shoe past eight decks is clamped rather than believed', async ({ page }) => {
    const sizes = await page.evaluate(() =>
      [0, -3, 99, NaN].map(n => Deck.shoe(n).remaining()));
    expect(sizes).toEqual([52, 52, 416, 52]);
  });
});
