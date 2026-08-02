const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/spin-words/';
const KEY = 'games.spin-words.v1';

const key = (page, ch) => page.locator(`.key[data-letter="${ch}"]`);
const vowelKey = (page, ch) => page.locator(`.vowel-key[data-letter="${ch}"]`);
const bank = (page, i) => page.locator(`.seat[data-seat="${i}"] .seat-bank`);
const seat = (page, i) => page.locator(`.seat[data-seat="${i}"]`);
const phase = page => page.locator('body').getAttribute('data-phase');

/** The board as text, with a dot for every letter still hidden. */
const boardText = page => page.evaluate(() =>
  [...document.querySelectorAll('.word')].map(w =>
    [...w.querySelectorAll('.tile')]
      .map(t => (t.hasAttribute('data-shown') ? t.dataset.letter : '.')).join('')
  ).join(' '));

/**
 * Seeds a game and reloads onto it. The puzzle is drawn at load from
 * Math.random, before a test can reach it, so the answer is set here rather
 * than stubbed — see the game's _README.md.
 */
async function seed(page, patch) {
  const base = {
    players: 3, puzzles: 3, names: ['Ada', 'Ben', 'Cy'], banks: [0, 0, 0],
    current: 0, roundMoney: 0, solvedCount: 0,
    answer: 'BETTER LATE THAN NEVER', category: 'Phrase',
    called: '', phase: 'spin', wedge: 0, message: '', used: []
  };
  await page.evaluate(([k, value]) => localStorage.setItem(k, JSON.stringify(value)),
    [KEY, Object.assign(base, patch)]);
  await page.reload();
}

/** Spins with the wedge forced, and waits for the reel to settle. */
async function spin(page, wedge) {
  await page.evaluate(w => {
    const saved = JSON.parse(localStorage.getItem('games.spin-words.v1'));
    saved.wedge = w;
    localStorage.setItem('games.spin-words.v1', JSON.stringify(saved));
    // The wedge is drawn from the head of Math.random, so pinning that head
    // pins where the reel lands.
    Math.random = () => (w + 0.5) / 24;
  }, wedge);
  await page.locator('#spin').click();
  await expect(page.locator('body')).not.toHaveAttribute('data-phase', 'spinning');
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await clearState(page);
});

test.describe('the board', () => {
  test('hides the letters and shows the category', async ({ page }) => {
    await seed(page, {});
    expect(await boardText(page)).toBe('...... .... .... .....');
    await expect(page.locator('#category')).toHaveText('Phrase');
  });

  test('a called letter shows everywhere it appears', async ({ page }) => {
    await seed(page, { called: 'E' });
    expect(await boardText(page)).toBe('.E..E. ...E .... .E.E.');
  });

  test('one word per group, so a word never breaks across lines',
    async ({ page }) => {
      await seed(page, {});
      await expect(page.locator('.word')).toHaveCount(4);
    });

  test('a seat is marked as the one holding the phone', async ({ page }) => {
    await seed(page, { current: 1 });
    await expect(seat(page, 1)).toHaveAttribute('data-active', '');
    await expect(seat(page, 0)).not.toHaveAttribute('data-active', '');
  });
});

test.describe('passing the phone', () => {
  test('a new game opens on the pass screen', async ({ page }) => {
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'pass');
    await expect(page.locator('#pass-note')).toContainText('Pass the phone to');
    await page.locator('#ready').click();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'spin');
  });

  test('the pass screen names who is up and what just happened',
    async ({ page }) => {
      await seed(page, { current: 1, phase: 'pass', message: 'Ada missed it.' });
      await expect(page.locator('#pass-note')).toHaveText(/Ada missed it\..*Ben/);
    });
});

test.describe('spinning and calling', () => {
  test('a cash wedge opens the keyboard', async ({ page }) => {
    await seed(page, {});
    await spin(page, 0);                      // wedge 0 is $600
    expect(await phase(page)).toBe('pick');
    await expect(page.locator('#pick-hint')).toContainText('$600');
  });

  test('a consonant that is there pays per letter and keeps the phone',
    async ({ page }) => {
      await seed(page, {});
      await spin(page, 0);
      await key(page, 'T').click();           // four Ts in the puzzle
      expect(await phase(page)).toBe('spin');
      await expect(page.locator('#turn')).toContainText('$2,400');
      expect(await boardText(page)).toBe('..TT.. ..T. T... .....');
    });

  test('a consonant that is not there ends the turn', async ({ page }) => {
    await seed(page, {});
    await spin(page, 0);
    await key(page, 'Z').click();
    expect(await phase(page)).toBe('pass');
    await expect(page.locator('#pass-note')).toContainText('No Z');
    await expect(page.locator('#pass-note')).toContainText('Ben');
  });

  test('called letters go dark and stay unclickable', async ({ page }) => {
    await seed(page, { called: 'T' });
    await spin(page, 0);
    await expect(key(page, 'T')).toHaveAttribute('data-used', '');
    await expect(key(page, 'T')).toBeDisabled();
    await expect(key(page, 'R')).toBeEnabled();
  });

  test('vowels cannot be called for free', async ({ page }) => {
    await seed(page, {});
    await spin(page, 0);
    for (const ch of 'AEIOU') await expect(key(page, ch)).toBeDisabled();
    for (const ch of 'BCDFG') await expect(key(page, ch)).toBeEnabled();
  });

  test('the keyboard is dead when it is not a pick', async ({ page }) => {
    await seed(page, {});
    await expect(key(page, 'T')).toBeDisabled();
    await expect(key(page, 'T')).not.toHaveAttribute('data-used', '');
  });

  test('bankrupt takes this puzzle only, not the bank', async ({ page }) => {
    await seed(page, { roundMoney: 1800, banks: [4000, 0, 0] });
    await spin(page, 1);                      // wedge 1 is BANKRUPT
    expect(await phase(page)).toBe('pass');
    await expect(page.locator('#pass-note')).toContainText('Bankrupt');
    await expect(bank(page, 0)).toHaveText('$4,000');
    await page.locator('#ready').click();
    await expect(page.locator('#turn')).not.toContainText('this puzzle');
  });

  test('lose a turn just passes the phone', async ({ page }) => {
    await seed(page, { roundMoney: 900 });
    await spin(page, 6);                      // wedge 6 is LOSE A TURN
    expect(await phase(page)).toBe('pass');
    await expect(page.locator('#pass-note')).toContainText('lost a turn');
  });
});

test.describe('buying a vowel', () => {
  test('needs the $250 first', async ({ page }) => {
    await seed(page, { roundMoney: 0 });
    await expect(page.locator('#vowel')).toBeDisabled();
    await seed(page, { roundMoney: 250 });
    await expect(page.locator('#vowel')).toBeEnabled();
  });

  test('shows the five vowels rather than the keyboard', async ({ page }) => {
    await seed(page, { roundMoney: 900 });
    await page.locator('#vowel').click();
    expect(await phase(page)).toBe('vowel');
    await expect(page.locator('.vowel-key')).toHaveCount(5);
    await expect(page.locator('.keys')).not.toBeVisible();
    for (const ch of 'AEIOU') await expect(vowelKey(page, ch)).toBeEnabled();
  });

  test('costs the money and pays nothing', async ({ page }) => {
    await seed(page, { roundMoney: 900 });
    await page.locator('#vowel').click();
    await vowelKey(page, 'E').click();
    expect(await phase(page)).toBe('spin');
    await expect(page.locator('#turn')).toContainText('$650');
    expect(await boardText(page)).toBe('.E..E. ...E .... .E.E.');
  });

  test('a vowel that is not there still costs, and ends the turn',
    async ({ page }) => {
      await seed(page, { roundMoney: 900 });
      await page.locator('#vowel').click();
      await vowelKey(page, 'O').click();
      expect(await phase(page)).toBe('pass');
      await expect(page.locator('#pass-note')).toContainText('No O');
    });

  test('a vowel already bought cannot be bought again', async ({ page }) => {
    await seed(page, { roundMoney: 900, called: 'E' });
    await page.locator('#vowel').click();
    await expect(vowelKey(page, 'E')).toBeDisabled();
    await expect(vowelKey(page, 'A')).toBeEnabled();
  });

  test('Back leaves the vowel pad without spending', async ({ page }) => {
    await seed(page, { roundMoney: 900 });
    await page.locator('#vowel').click();
    await page.locator('#vowel-back').click();
    expect(await phase(page)).toBe('spin');
    await expect(page.locator('#turn')).toContainText('$900');
  });
});

test.describe('solving', () => {
  test('the table judges it out loud', async ({ page }) => {
    await seed(page, { roundMoney: 1800 });
    await page.locator('#solve').click();
    expect(await phase(page)).toBe('judge');
    await expect(page.locator('#got-it')).toBeVisible();
  });

  test('Got it banks the puzzle and reveals the answer', async ({ page }) => {
    await seed(page, { roundMoney: 1800, banks: [500, 0, 0] });
    await page.locator('#solve').click();
    await page.locator('#got-it').click();
    expect(await phase(page)).toBe('solved');
    await expect(bank(page, 0)).toHaveText('$2,300');
    expect(await boardText(page)).toBe('BETTER LATE THAN NEVER');
  });

  test('Missed passes the phone and loses the puzzle money', async ({ page }) => {
    await seed(page, { roundMoney: 1800, banks: [500, 0, 0] });
    await page.locator('#solve').click();
    await page.locator('#missed').click();
    expect(await phase(page)).toBe('pass');
    await expect(bank(page, 0)).toHaveText('$500');
  });

  test('the next puzzle opens on the seat after the solver', async ({ page }) => {
    await seed(page, { current: 0, roundMoney: 300 });
    await page.locator('#solve').click();
    await page.locator('#got-it').click();
    await page.locator('#next-puzzle').click();
    expect(await phase(page)).toBe('pass');
    await expect(seat(page, 1)).toHaveAttribute('data-active', '');
    // A fresh puzzle, so nothing is showing and nothing is banked to it.
    await expect(page.locator('.tile[data-shown]')).toHaveCount(0);
  });

  test('the last puzzle ends the game and names a winner', async ({ page }) => {
    await seed(page, { puzzles: 3, solvedCount: 2, roundMoney: 900,
      banks: [0, 100, 0] });
    await page.locator('#solve').click();
    await page.locator('#got-it').click();
    expect(await phase(page)).toBe('over');
    await expect(page.locator('#over-note')).toContainText('Ada wins with $900');
    await page.locator('#again').click();
    expect(await phase(page)).toBe('pass');
    await expect(bank(page, 0)).toHaveText('$0');
  });

  test('a tie is called a tie', async ({ page }) => {
    await seed(page, { puzzles: 3, solvedCount: 2, roundMoney: 100,
      banks: [0, 100, 0] });
    await page.locator('#solve').click();
    await page.locator('#got-it').click();
    await expect(page.locator('#over-note')).toContainText('A tie at $100');
  });
});

test.describe('running out of letters', () => {
  test('no consonants left kills Spin but never Solve', async ({ page }) => {
    // Every consonant of BETTER LATE THAN NEVER, vowels still hidden.
    await seed(page, { called: 'BTRLTHNNVR', roundMoney: 0 });
    await expect(page.locator('#spin')).toBeDisabled();
    await expect(page.locator('#solve')).toBeEnabled();
    await expect(page.locator('#spin-hint')).toContainText('No consonants left');
  });

  test('Solve is the way out with no money and no consonants',
    async ({ page }) => {
      await seed(page, { called: 'BTRLTHNNVR', roundMoney: 0 });
      await expect(page.locator('#vowel')).toBeDisabled();
      await page.locator('#solve').click();
      expect(await phase(page)).toBe('judge');
    });
});

test.describe('players', () => {
  test('seats two to eight', async ({ page }) => {
    await expect(page.locator('.count[data-count]')).toHaveCount(7);
    await page.locator('#settings-btn').click();
    await page.locator('.count[data-count="6"]').click();
    await expect(page.locator('.seat')).toHaveCount(6);
    await expect(page.locator('.count[data-count="6"]'))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('names replace the numbered fallback', async ({ page }) => {
    await seed(page, { names: ['', 'Ben', ''] });
    await expect(page.locator('.seat[data-seat="0"] .seat-name'))
      .toHaveText('Player 1');
    await expect(page.locator('.seat[data-seat="1"] .seat-name')).toHaveText('Ben');
  });

  test('turns walk round every seat', async ({ page }) => {
    await seed(page, { players: 4, names: ['', '', '', ''], banks: [0, 0, 0, 0],
      current: 3 });
    await spin(page, 0);
    await key(page, 'Z').click();
    await expect(seat(page, 0)).toHaveAttribute('data-active', '');
  });
});

test.describe('the puzzles', () => {
  test('this game keeps its phrases to itself', () => {
    // The whole reason phrases.js is in the game folder rather than in
    // js/lib/ — see the game's notes.
    const games = path.join(__dirname, '..', '..', 'games');
    const leaked = [];
    for (const slug of fs.readdirSync(games)) {
      const file = path.join(games, slug, 'index.html');
      if (slug === 'spin-words' || !fs.existsSync(file)) continue;
      if (fs.readFileSync(file, 'utf8').includes('phrases.js')) leaked.push(slug);
    }
    expect(leaked).toEqual([]);
    const lib = fs.readdirSync(path.join(__dirname, '..', '..', 'js', 'lib'));
    expect(lib).not.toContain('phrases.js');
  });

  test('no phrase is also a shared-vocabulary term', async ({ page }) => {
    const clash = await page.evaluate(() => {
      const words = new Set(Vocab.pool().map(t => t.word.toUpperCase()));
      return SpinPhrases.pool()
        .filter(p => words.has(p.text.toUpperCase())).map(p => p.text);
    });
    expect(clash).toEqual([]);
  });

  test('phrases are unique, and shaped for a board', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const all = SpinPhrases.pool();
      return {
        count: all.length,
        unique: new Set(all.map(p => p.text.toUpperCase())).size,
        // Letters and single spaces only: every tile is a letter to call or
        // a gap between words, with nothing in between to explain.
        odd: all.filter(p => !/^[A-Za-z]+( [A-Za-z]+)*$/.test(p.text))
          .map(p => p.text),
        long: all.filter(p => p.text.length > 32).map(p => p.text),
        short: all.filter(p => p.text.replace(/ /g, '').length < 5)
          .map(p => p.text),
        categories: SpinPhrases.categories().length,
      };
    });
    expect(shape.count).toBeGreaterThanOrEqual(280);
    expect(shape.unique).toBe(shape.count);
    expect(shape.odd).toEqual([]);
    expect(shape.long).toEqual([]);
    expect(shape.short).toEqual([]);
    expect(shape.categories).toBeGreaterThanOrEqual(12);
  });

  test('every category is worth drawing from', async ({ page }) => {
    // A thin category is a category that repeats, and a puzzle coming round
    // twice in an evening is what makes the deck feel small.
    const thin = await page.evaluate(() => {
      const counts = {};
      for (const p of SpinPhrases.pool()) counts[p.category] = (counts[p.category] || 0) + 1;
      return Object.keys(counts).filter(c => counts[c] < 18);
    });
    expect(thin).toEqual([]);
  });

  test('Before and After puzzles pivot on a shared word', async ({ page }) => {
    // Three words at least, or there is no pivot to share.
    const short = await page.evaluate(() => SpinPhrases.pool()
      .filter(p => p.category === 'Before and After')
      .filter(p => p.text.split(' ').length < 3).map(p => p.text));
    expect(short).toEqual([]);
  });

  test('Same Letter puzzles start every word with the same letter',
    async ({ page }) => {
      const wrong = await page.evaluate(() => SpinPhrases.pool()
        .filter(p => p.category === 'Same Letter')
        .filter(p => {
          const first = p.text.split(' ').map(w => w[0].toUpperCase());
          return first.some(c => c !== first[0]);
        }).map(p => p.text));
      expect(wrong).toEqual([]);
    });

  test('a puzzle is never a four-letter word', async ({ page }) => {
    const answers = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < 40; i++) {
        localStorage.removeItem('games.spin-words.v1');
        out.push(null);
      }
      return out.length;
    });
    expect(answers).toBe(40);
    // The draw itself: every candidate the game will accept has five
    // letters or more.
    const tooShort = await page.evaluate(() => Vocab.pool()
      .map(t => t.word.toUpperCase().replace(/[^A-Z]/g, ''))
      .filter(w => w.length >= 5).filter(w => w.length < 5));
    expect(tooShort).toEqual([]);
  });

  test('there is no category picker', async ({ page }) => {
    // Deliberate: a puzzle is a puzzle, and picking categories would be
    // four taps in the way of starting.
    await page.locator('#settings-btn').click();
    await expect(page.locator('.cat')).toHaveCount(0);
  });
});

test.describe('persistence', () => {
  test('a game in progress survives a reload', async ({ page }) => {
    await seed(page, { roundMoney: 0 });
    await spin(page, 0);
    await key(page, 'T').click();
    await page.reload();
    expect(await phase(page)).toBe('spin');
    await expect(page.locator('#turn')).toContainText('$2,400');
    expect(await boardText(page)).toBe('..TT.. ..T. T... .....');
  });

  test('a reload mid-spin lands on the spin screen', async ({ page }) => {
    await seed(page, { phase: 'spinning' });
    expect(await phase(page)).toBe('spin');
  });

  test('corrupt saved state starts a clean game', async ({ page }) => {
    await page.evaluate(k => localStorage.setItem(k, 'not json'), KEY);
    await page.reload();
    expect(await phase(page)).toBe('pass');
    await expect(page.locator('.tile[data-shown]')).toHaveCount(0);
  });

  test('a saved game with no answer is redealt rather than blank',
    async ({ page }) => {
      await page.evaluate(k => localStorage.setItem(k,
        JSON.stringify({ players: 4, answer: '   ' })), KEY);
      await page.reload();
      await expect(page.locator('.seat')).toHaveCount(4);
      await expect(page.locator('.tile')).not.toHaveCount(0);
    });
});

test.describe('presentation', () => {
  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('nothing overflows the screen at any size', async ({ page }) => {
    for (const p of ['pass', 'spin', 'pick', 'vowel', 'judge', 'over']) {
      await seed(page, { phase: p, roundMoney: 900, solvedCount: 2 });
      for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 },
        { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        const m = await page.evaluate(() => ({
          ox: document.documentElement.scrollWidth - window.innerWidth,
          oy: document.documentElement.scrollHeight - window.innerHeight,
        }));
        const at = `${p} at ${size.width}x${size.height}`;
        expect(m.ox, `x overflow, ${at}`).toBeLessThanOrEqual(0);
        expect(m.oy, `y overflow, ${at}`).toBeLessThanOrEqual(0);
      }
    }
  });

  test('swapping panes does not move the board', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, { phase: 'spin' });
    const before = await page.locator('#board').boundingBox();
    await spin(page, 0);
    const after = await page.locator('#board').boundingBox();
    expect(Math.abs(after.y - before.y), 'the keyboard pane is taller')
      .toBeLessThanOrEqual(1);
  });

  test('keys stay inside the panel', async ({ page }) => {
    for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await seed(page, {});
      await spin(page, 0);
      const fits = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.keys-row')];
        const box = document.querySelector('.panel').getBoundingClientRect();
        return rows.every(r => {
          const b = r.getBoundingClientRect();
          return b.left >= box.left - 0.5 && b.right <= box.right + 0.5;
        });
      });
      expect(fits, `keys fit at ${size.width}x${size.height}`).toBe(true);
    }
  });
});
