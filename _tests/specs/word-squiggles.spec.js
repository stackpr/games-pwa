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

  test('a new puzzle redraws the letters', async ({ page }) => {
    /*
     * The bug this exists for: the cells were only rebuilt when the new
     * board had a different number of squares, and the builder picks from
     * ten shapes, so a new theme regularly landed on the same size and
     * inherited the previous puzzle's letters. What was on screen was not
     * the puzzle being played.
     */
    const bad = await page.evaluate(() => {
      const out = [];
      for (let n = 0; n < 25; n++) {
        document.getElementById('new-btn').click();
        const p = JSON.parse(localStorage.getItem('games.word-squiggles.v1')).puzzle;
        const shown = [...document.querySelectorAll('#board .cell')]
          .map(c => c.textContent);
        if (shown.length !== p.letters.length) {
          out.push('board has ' + shown.length + ' cells for ' + p.letters.length);
        } else if (shown.join('') !== p.letters.join('')) {
          out.push('screen shows ' + shown.join('') + ' for ' + p.letters.join(''));
        }
        if (document.getElementById('theme').textContent !== p.title) {
          out.push('theme says the wrong thing');
        }
        if (out.length) return out.slice(0, 2);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('a word can rarely be spelled off its own squares', async ({ page }) => {
    /*
     * The only ambiguity that matters. A path over a word's OWN cells in
     * another order is accepted, so it is not ambiguity; a path that strays
     * onto a neighbour's cells is refused, and that is what makes a player
     * trace a word correctly and be told they are wrong.
     *
     * The builder cannot rule it out — a clean board may not exist for a
     * given set of words — so it builds several and keeps the least murky.
     * This pins the result rather than the method: with one board it
     * measured 53%, with six it measures 27%.
     */
    const rate = await page.evaluate(() => {
      const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      function strays(letters, cols, rows, entry) {
        const own = new Set(entry.cells);
        const used = new Set();
        let found = false;
        function go(i, k, off) {
          if (found) return;
          if (k === entry.word.length) { if (off) found = true; return; }
          const x = i % cols, y = (i - x) / cols;
          for (const [dy, dx] of DIRS) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            const j = ny * cols + nx;
            if (used.has(j) || letters[j] !== entry.word[k]) continue;
            used.add(j); go(j, k + 1, off || !own.has(j)); used.delete(j);
            if (found) return;
          }
        }
        for (let i = 0; i < letters.length && !found; i++) {
          if (letters[i] !== entry.word[0]) continue;
          used.clear(); used.add(i); go(i, 1, !own.has(i));
        }
        return found;
      }
      let words = 0, murky = 0;
      for (let n = 0; n < 12; n++) {
        const p = JSON.parse(localStorage.getItem('games.word-squiggles.v1')).puzzle;
        for (const e of p.words) {
          words++;
          if (strays(p.letters, p.cols, p.rows, e)) murky++;
        }
        document.getElementById('new-btn').click();
      }
      return murky / words;
    });
    expect(rate, 'too many words can be spelled off their own squares')
      .toBeLessThan(0.45);
  });

  test('every theme has enough words to be worth meeting again', async ({ page }) => {
    const sets = await page.evaluate(() => window.SquiggleSets.all()
      .map(s => ({ title: s.title, n: s.words.length })));
    expect(sets.length).toBe(20);
    for (const set of sets) {
      expect(set.n, set.title + ' is too thin a pool').toBeGreaterThanOrEqual(28);
    }
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

  test('duplicate letters count in either order', async ({ page }) => {
    /*
     * DRESS puts its two S's on two particular squares. A player who traces
     * them in the other order has drawn a squiggle nobody could tell from
     * the intended one — same squares, same letters, same word — and
     * refusing it refuses a correct answer.
     *
     * The swap has to be one a finger could actually draw, so this hunts for
     * a word where exchanging two neighbouring cells leaves every step still
     * touching, dealing new boards until it finds one.
     */
    const swap = await page.evaluate(() => {
      const touching = (a, b, cols) => {
        const ax = a % cols, ay = (a - ax) / cols;
        const bx = b % cols, by = (b - bx) / cols;
        return a !== b && Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
      };
      for (let n = 0; n < 40; n++) {
        const p = JSON.parse(localStorage.getItem('games.word-squiggles.v1')).puzzle;
        for (const e of p.words) {
          for (let k = 0; k + 1 < e.word.length; k++) {
            if (e.word[k] !== e.word[k + 1]) continue;
            const path = e.cells.slice();
            const t = path[k]; path[k] = path[k + 1]; path[k + 1] = t;
            let drawable = true;
            for (let i = 1; i < path.length; i++) {
              if (!touching(path[i - 1], path[i], p.cols)) { drawable = false; break; }
            }
            if (drawable) return { word: e.word, path: path, laid: e.cells };
          }
        }
        document.getElementById('new-btn').click();
      }
      return null;
    });
    test.skip(!swap, 'no drawable duplicate-letter swap turned up in 40 boards');

    // Not the order the builder laid, but the same squares.
    expect(swap.path).not.toEqual(swap.laid);
    expect(swap.path.slice().sort()).toEqual(swap.laid.slice().sort());

    await trace(page, swap.path);
    await expect(flash(page)).toContainText(swap.word);
    await expect(page.locator('#tally')).toContainText('1 of ');
  });

  test('the right letters over the wrong squares is still refused',
    async ({ page }) => {
      /*
       * The other half of the rule. Order within a word's own cells is free,
       * but the SQUARES are not: a path that borrows a neighbour's cell
       * would leave the real word unsolvable, so it has to be refused
       * however well it spells.
       *
       * Every word, every position, every cell on the board — an earlier
       * version only looked at cells next to the second-to-last square and
       * skipped in every run it ever had, so this half of the rule went
       * untested. A skip here is nearly as bad as a failure.
       */
      const swapped = await page.evaluate(() => {
        const touching = (a, b, cols) => {
          const ax = a % cols, ay = (a - ax) / cols;
          const bx = b % cols, by = (b - bx) / cols;
          return a !== b && Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
        };
        for (let n = 0; n < 40; n++) {
          const p = JSON.parse(localStorage.getItem('games.word-squiggles.v1')).puzzle;
          for (const e of p.words) {
            const own = new Set(e.cells);
            for (let k = 0; k < e.cells.length; k++) {
              for (let j = 0; j < p.letters.length; j++) {
                // A cell this word does not own, carrying the letter it needs.
                if (own.has(j) || p.letters[j] !== e.word[k]) continue;
                const path = e.cells.slice();
                path[k] = j;
                if (new Set(path).size !== path.length) continue;
                let drawable = true;
                for (let i = 1; i < path.length; i++) {
                  if (!touching(path[i - 1], path[i], p.cols)) { drawable = false; break; }
                }
                if (drawable) return { word: e.word, path: path, laid: e.cells };
              }
            }
          }
          document.getElementById('new-btn').click();
        }
        return null;
      });
      expect(swapped, 'no borrowed-cell path found in 40 boards').not.toBeNull();

      // It spells the word exactly, and uses one square that is not its own.
      const spelled = await page.evaluate(([puzzle, path]) =>
        path.map(i => puzzle.letters[i]).join(''),
      [await puzzleOf(page), swapped.path]);
      expect(spelled).toBe(swapped.word);
      expect(swapped.path).not.toEqual(swapped.laid);

      await trace(page, swapped.path);
      await expect(flash(page)).toHaveText('Not one of them');
      await expect(page.locator('#tally')).toContainText('0 of ');
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

test.describe('the clock and the leaderboard', () => {
  test('the clock starts as soon as the board is up', async ({ page }) => {
    /*
     * Working out the theme and finding the first word IS the solving, so
     * the clock cannot wait for a drag — a player studying the grid is
     * already playing. It used to start on the first squiggle, which paid
     * for exactly that thinking.
     */
    await expect(page.locator('#clock')).not.toHaveText('0:00', { timeout: 3000 });
  });

  test('a new puzzle restarts the clock, running', async ({ page }) => {
    await page.waitForTimeout(1200);
    await page.locator('#new-btn').click();
    // Back to zero for the new board, and moving again without being poked.
    await expect(page.locator('#clock')).not.toHaveText('0:00', { timeout: 3000 });
    const early = await page.locator('#clock').textContent();
    expect(['0:00', '0:01', '0:02']).toContain(early);
  });

  test('a restored board picks its clock back up', async ({ page }) => {
    await page.waitForTimeout(1200);
    await page.reload();
    // The puzzle is on screen again, so it is being solved again.
    const first = await page.locator('#clock').textContent();
    await expect(page.locator('#clock')).not.toHaveText(first, { timeout: 4000 });
  });

  test('a solved board leaves the clock alone', async ({ page }) => {
    const p = await puzzleOf(page);
    for (const entry of p.words) await trace(page, entry.cells);
    await expect(page.locator('#over')).toHaveAttribute('data-open', /.*/);

    const stopped = await page.locator('#clock').textContent();
    await page.waitForTimeout(1500);
    expect(await page.locator('#clock').textContent(),
      'the clock kept running after the puzzle was solved').toBe(stopped);

    // And still stopped after a reload, rather than timing a finished board.
    await page.reload();
    const after = await page.locator('#clock').textContent();
    await page.waitForTimeout(1500);
    expect(await page.locator('#clock').textContent()).toBe(after);
  });

  test('a hint costs time, and each one costs more', async ({ page }) => {
    await page.locator('#hint-btn').click();
    await expect(flash(page)).toContainText('+15s');
    await page.locator('#hint-btn').click();
    await expect(flash(page)).toContainText('+30s');
    await page.locator('#hint-btn').click();
    await expect(flash(page)).toContainText('+45s');
    await expect(page.locator('#board .cell[data-hint]')).toHaveCount(3);
  });

  test('solving records a time under the board size', async ({ page }) => {
    const p = await puzzleOf(page);
    for (const entry of p.words) await trace(page, entry.cells);
    await expect(page.locator('#over')).toHaveAttribute('data-open', /.*/);

    const shape = p.cols + '\u00d7' + p.rows;
    await expect(page.locator('#sums .final')).toContainText(shape);
    // No hints taken, so nothing was added to the clock.
    await expect(page.locator('#sums')).toContainText('No hints');

    const saved = await page.evaluate(k =>
      JSON.parse(localStorage.getItem(k)).times, KEY);
    expect(Object.keys(saved)).toContain(shape);
    expect(saved[shape]).toHaveLength(1);
    expect(saved[shape][0].hints).toBe(0);
    expect(saved[shape][0].total).toBe(saved[shape][0].raw);
  });

  test('a hint is added to the time that is recorded', async ({ page }) => {
    const p = await puzzleOf(page);
    await page.locator('#hint-btn').click();
    for (const entry of p.words) await trace(page, entry.cells);

    await expect(page.locator('#sums')).toContainText('1 hint');
    await expect(page.locator('#sums')).toContainText('+15s');

    const shape = p.cols + '\u00d7' + p.rows;
    const saved = await page.evaluate(k =>
      JSON.parse(localStorage.getItem(k)).times, KEY);
    const entry = saved[shape][0];
    expect(entry.hints).toBe(1);
    // Fifteen seconds on top of the clock, give or take the run's own time.
    expect(entry.total - entry.raw).toBe(15000);
  });

  test('the leaderboard is empty until something is solved, and split by size',
    async ({ page }) => {
      await page.locator('#board-btn').click();
      await expect(page.locator('#board-body .score-empty')).toBeVisible();
      await page.locator('#board-sheet [data-close]').click();

      const p = await puzzleOf(page);
      for (const entry of p.words) await trace(page, entry.cells);
      await page.locator('#over [data-close]').click();
      await page.locator('#board-btn').click();

      const shape = p.cols + '\u00d7' + p.rows;
      await expect(page.locator('#board-body .score-shape')).toHaveText([shape]);
      await expect(page.locator('#board-body .score-list li')).toHaveCount(1);
      await expect(page.locator('#board-body .detail')).toHaveText('no hints');
    });

  test('a nonsense time is not restored', async ({ page }) => {
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.times = { '6×8': [{ total: 'soon' }, { total: 900, hints: -2 }], 'zz': [] };
      localStorage.setItem(key, JSON.stringify(saved));
    }, KEY);
    await page.reload();
    await page.locator('#board-btn').click();
    await expect(page.locator('#board-body .score-empty')).toBeVisible();
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
