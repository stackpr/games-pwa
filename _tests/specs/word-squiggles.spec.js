const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/word-squiggles/';
const KEY = 'games.word-squiggles.v1';

const cells = page => page.locator('#board .cell');
const flash = page => page.locator('#flash');

/** The puzzle the page is currently showing, straight out of storage. */
const puzzleOf = page =>
  page.evaluate(k => (JSON.parse(localStorage.getItem(k) || 'null') || {}).puzzle, KEY);

/**
 * Traces a word by dragging across its cells, the way a finger would. The
 * path has to be the one the builder laid, so it is read from the puzzle
 * rather than searched for.
 */
async function trace(page, path) {
  const boxes = [];
  for (const i of path) {
    boxes.push(await page.locator(`#board .cell[data-i="${i}"]`).boundingBox());
  }
  await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2);
  await page.mouse.down();
  for (const b of boxes.slice(1)) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
  }
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
  await page.reload();
});

test.describe('the board', () => {
  test('every letter belongs to exactly one word', async ({ page }) => {
    /*
     * The invariant the whole game rests on: no filler, no letter used
     * twice. If this ever breaks, a puzzle becomes unsolvable rather than
     * merely wrong, so it is checked over many freshly built boards.
     */
    const bad = await page.evaluate(() => {
      const out = [];
      const sets = window.SquiggleSets.all();
      for (let n = 0; n < 40; n++) {
        const saved = JSON.parse(localStorage.getItem('games.word-squiggles.v1'));
        const p = saved.puzzle;
        const size = p.cols * p.rows;
        const seen = new Array(size).fill(0);
        for (const entry of p.words) {
          for (let k = 0; k < entry.cells.length; k++) {
            seen[entry.cells[k]]++;
            if (p.letters[entry.cells[k]] !== entry.word[k]) {
              out.push(entry.word + ' does not spell out along its cells');
            }
          }
        }
        for (let i = 0; i < size; i++) {
          if (seen[i] !== 1) out.push('cell ' + i + ' used ' + seen[i] + ' times');
        }
        if (!sets.some(s => s.title === p.title)) out.push('unknown theme ' + p.title);
        if (out.length) return out.slice(0, 4);
        document.getElementById('new-btn').click();
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('every word is a run of touching cells', async ({ page }) => {
    const bad = await page.evaluate(() => {
      const out = [];
      for (let n = 0; n < 25; n++) {
        const p = JSON.parse(localStorage.getItem('games.word-squiggles.v1')).puzzle;
        for (const entry of p.words) {
          for (let k = 1; k < entry.cells.length; k++) {
            const a = entry.cells[k - 1];
            const b = entry.cells[k];
            const ax = a % p.cols, ay = (a - ax) / p.cols;
            const bx = b % p.cols, by = (b - bx) / p.cols;
            if (Math.abs(ax - bx) > 1 || Math.abs(ay - by) > 1 || a === b) {
              out.push(entry.word + ' jumps between cells');
            }
          }
        }
        if (out.length) return out.slice(0, 3);
        document.getElementById('new-btn').click();
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('exactly one word crosses the board', async ({ page }) => {
    const bad = await page.evaluate(() => {
      const out = [];
      for (let n = 0; n < 25; n++) {
        const p = JSON.parse(localStorage.getItem('games.word-squiggles.v1')).puzzle;
        const spanners = p.words.filter(w => w.spanner);
        if (spanners.length !== 1) {
          out.push('found ' + spanners.length + ' spanners');
        } else {
          let l = false, r = false, t = false, b = false;
          for (const i of spanners[0].cells) {
            const x = i % p.cols, y = (i - x) / p.cols;
            if (x === 0) l = true;
            if (x === p.cols - 1) r = true;
            if (y === 0) t = true;
            if (y === p.rows - 1) b = true;
          }
          if (!((l && r) || (t && b))) out.push(spanners[0].word + ' does not reach two opposite edges');
        }
        if (out.length) return out;
        document.getElementById('new-btn').click();
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('the grid is not predetermined', async ({ page }) => {
    /*
     * The whole point of building at open time. Same twenty themes, but a
     * repeated theme must not mean a repeated board — so both the shape and
     * the chosen words have to vary.
     */
    const seen = await page.evaluate(() => {
      const shapes = {};
      const sets = {};
      for (let n = 0; n < 30; n++) {
        const p = JSON.parse(localStorage.getItem('games.word-squiggles.v1')).puzzle;
        shapes[p.cols + 'x' + p.rows] = 1;
        sets[p.title + '|' + p.words.map(w => w.word).sort().join(',')] = 1;
        document.getElementById('new-btn').click();
      }
      return { shapes: Object.keys(shapes).length, sets: Object.keys(sets).length };
    });
    expect(seen.shapes, 'every board came out the same shape').toBeGreaterThan(2);
    expect(seen.sets, 'the same words keep coming up').toBeGreaterThan(25);
  });
});

test.describe('playing', () => {
  test('tracing a word finds it', async ({ page }) => {
    const p = await puzzleOf(page);
    const entry = p.words[0];
    await trace(page, entry.cells);

    await expect(flash(page)).toContainText(entry.word);
    await expect(page.locator('#tally')).toContainText('1 of ' + p.words.length);
    // Its cells lock in, and the chip stops hiding the word.
    for (const i of entry.cells) {
      await expect(page.locator(`#board .cell[data-i="${i}"]`))
        .toHaveAttribute('data-state', /found|span/);
    }
    await expect(page.locator('#words .chip-word', { hasText: entry.word })).toHaveCount(1);
  });

  test('tracing it backwards works too', async ({ page }) => {
    const p = await puzzleOf(page);
    const entry = p.words[0];
    await trace(page, entry.cells.slice().reverse());
    await expect(page.locator('#tally')).toContainText('1 of ' + p.words.length);
  });

  test('a squiggle that is not a word is refused', async ({ page }) => {
    const p = await puzzleOf(page);
    // Three cells in a row along the top, which is vanishingly unlikely to
    // be one of the laid paths — and asserted not to be, so this cannot
    // silently start testing nothing.
    const path = [0, 1, 2];
    const laid = p.words.some(w =>
      w.cells.join(',') === path.join(',') ||
      w.cells.slice().reverse().join(',') === path.join(','));
    test.skip(laid, 'the top row happens to be a real word here');

    await trace(page, path);
    await expect(flash(page)).toHaveText('Not one of them');
    await expect(page.locator('#tally')).toContainText('0 of ' + p.words.length);
  });

  test('solving every word opens the sheet', async ({ page }) => {
    const p = await puzzleOf(page);
    for (const entry of p.words) await trace(page, entry.cells);

    await expect(page.locator('#over')).toHaveAttribute('data-open', /.*/);
    await expect(page.locator('#over-sub')).toHaveText(p.title);
    await expect(page.locator('#over-count')).toContainText(p.cols + '×' + p.rows);
    // Not a letter left unclaimed.
    await expect(cells(page).locator('[data-state="open"]')).toHaveCount(0);
  });

  test('a hint marks where a word starts, and nothing more', async ({ page }) => {
    const p = await puzzleOf(page);
    await page.locator('#hint-btn').click();
    await expect(page.locator('#board .cell[data-hint]')).toHaveCount(1);

    const at = Number(await page.locator('#board .cell[data-hint]').getAttribute('data-i'));
    expect(p.words.some(w => w.cells[0] === at), 'the hint is not a word start').toBe(true);
    // Still nothing found — a hint is a nudge, not an answer.
    await expect(page.locator('#tally')).toContainText('0 of ' + p.words.length);
  });
});

test.describe('saved state', () => {
  test('a half-played board survives a reload', async ({ page }) => {
    const p = await puzzleOf(page);
    await trace(page, p.words[0].cells);
    await expect(page.locator('#tally')).toContainText('1 of ');

    await page.reload();
    const after = await puzzleOf(page);
    expect(after.title).toBe(p.title);
    expect(after.letters.join('')).toBe(p.letters.join(''));
    await expect(page.locator('#tally')).toContainText('1 of ' + p.words.length);
  });

  test('a board whose cells do not add up is thrown away', async ({ page }) => {
    /*
     * Every cell covered exactly once is what the game rests on, so a saved
     * board that breaks it is replaced rather than played half-broken.
     */
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.puzzle.words[0].cells = saved.puzzle.words[0].cells.slice(1);
      localStorage.setItem(key, JSON.stringify(saved));
    }, KEY);
    await page.reload();

    const after = await puzzleOf(page);
    const size = after.cols * after.rows;
    let covered = 0;
    for (const w of after.words) covered += w.cells.length;
    expect(covered).toBe(size);
    await expect(page.locator('#tally')).toContainText('0 of ');
  });

  test('corrupt saved state still deals a playable board', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, 'not json'), KEY);
    await page.reload();
    await expect(cells(page)).not.toHaveCount(0);
    const p = await puzzleOf(page);
    await trace(page, p.words[0].cells);
    await expect(page.locator('#tally')).toContainText('1 of ');
  });
});

test.describe('the page itself', () => {
  test('reaches nothing off the origin and logs nothing', async ({ page }) => {
    const external = trackExternalRequests(page);
    const errors = trackErrors(page);
    await page.goto(URL);
    await page.locator('#new-btn').click();
    await page.locator('#hint-btn').click();
    await page.locator('#rules-btn').click();
    // Built on the device from words it ships: no dictionary, no network.
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the board fits the screen at every shape', async ({ page }) => {
    for (const size of [{ w: 320, h: 568 }, { w: 390, h: 720 }, { w: 740, h: 360 }]) {
      await page.setViewportSize({ width: size.w, height: size.h });
      const at = `${size.w}x${size.h}`;
      for (let n = 0; n < 6; n++) {
        await page.locator('#new-btn').click();
        const m = await page.evaluate(() => {
          const box = sel => {
            const r = document.querySelector(sel).getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
              width: r.width, height: r.height };
          };
          return { board: box('#board'), stage: box('.stage'), words: box('#words') };
        });
        expect(m.board.height, 'board taller than its stage at ' + at)
          .toBeLessThanOrEqual(m.stage.height + 0.5);
        expect(m.board.width, 'board wider than its stage at ' + at)
          .toBeLessThanOrEqual(m.stage.width + 0.5);
        const hits = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5
          && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        expect(hits(m.board, m.words), 'board over the word list at ' + at).toBe(false);
      }
      // Square cells, whatever shape the builder chose.
      const cell = await cells(page).first().boundingBox();
      expect(Math.abs(cell.width - cell.height), 'cells not square at ' + at)
        .toBeLessThan(1.5);
    }
  });
});
