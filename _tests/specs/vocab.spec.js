const { test, expect } = require('@playwright/test');

// The library is data, so these run against it directly on a page that has
// only loaded the module — no game, no state.
const URL = '/games/forbidden-words/';

const vocab = (page, fn, arg) => page.evaluate(fn, arg);

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
});

test.describe('the vocabulary library', { tag: '@nodom' }, () => {
  test('thirty categories of fifty terms', async ({ page }) => {
    const shape = await vocab(page, () => {
      const cats = Vocab.categories();
      return {
        categories: cats.length,
        counts: cats.map(c => Vocab.terms(c).length),
        total: Vocab.pool().length,
      };
    });
    expect(shape.categories).toBe(30);
    expect(shape.counts.filter(n => n !== 50)).toEqual([]);
    // Cross-listed terms are pooled once, so the pool is at or under 1500.
    expect(shape.total).toBeGreaterThan(1400);
    expect(shape.total).toBeLessThanOrEqual(1500);
  });

  test('every term carries at least four related words', async ({ page }) => {
    const thin = await vocab(page, () => Vocab.pool()
      .filter(t => t.related.length < 4 || t.related.some(r => !r.trim()))
      .map(t => t.word));
    expect(thin).toEqual([]);
  });

  test('no related word repeats within a term', async ({ page }) => {
    const dup = await vocab(page, () => Vocab.pool()
      .filter(t => new Set(t.related).size !== t.related.length)
      .map(t => t.word));
    expect(dup).toEqual([]);
  });

  test('a related word never gives the term away outright', async ({ page }) => {
    // A clue identical to the term it is banning is a card that cannot be
    // described at all.
    const same = await vocab(page, () => Vocab.pool()
      .filter(t => t.related.some(r => r.trim().toLowerCase() === t.word.toLowerCase()))
      .map(t => t.word));
    expect(same).toEqual([]);
  });

  test('the pool never holds the same word twice', async ({ page }) => {
    // A term can sit in two categories honestly; a deck built from both
    // must still not deal it twice.
    const dup = await vocab(page, () => {
      const seen = new Set();
      const out = [];
      for (const t of Vocab.pool()) {
        const k = t.word.toLowerCase();
        if (seen.has(k)) out.push(t.word);
        seen.add(k);
      }
      return out;
    });
    expect(dup).toEqual([]);
  });

  test('a deck holds every term from the chosen categories, once', async ({ page }) => {
    const deck = await vocab(page, () => {
      const cards = Vocab.deck(['Animals', 'Space']);
      return {
        size: cards.length,
        unique: new Set(cards.map(c => c.word)).size,
        cats: [...new Set(cards.map(c => c.category))].sort(),
      };
    });
    expect(deck.size).toBe(deck.unique);
    expect(deck.cats).toEqual(['Animals', 'Space']);
    expect(deck.size).toBe(100);
  });

  test('two decks come out in different orders', async ({ page }) => {
    const same = await vocab(page, () => {
      const a = Vocab.deck(['Animals']).map(t => t.word).join();
      const b = Vocab.deck(['Animals']).map(t => t.word).join();
      return a === b;
    });
    expect(same).toBe(false);
  });

  test('an unknown category is ignored rather than dealt as nothing',
    async ({ page }) => {
      const out = await vocab(page, () => ({
        known: Vocab.known(['Animals', 'Nonsense', 'Space']),
        pool: Vocab.pool(['Nonsense']).length,
      }));
      expect(out.known).toEqual(['Animals', 'Space']);
      expect(out.pool).toBe(0);
    });

  test('no category name is repeated', async ({ page }) => {
    const cats = await vocab(page, () => Vocab.categories());
    expect(new Set(cats).size).toBe(cats.length);
  });

  test('terms stay short enough to read across a room', async ({ page }) => {
    // A card that wraps to three lines is a card nobody reads in time.
    const long = await vocab(page, () => Vocab.pool()
      .filter(t => t.word.length > 22).map(t => t.word));
    expect(long).toEqual([]);
  });
});
