const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/maze/';

const status = page => page.locator('#status');
const steps = page => page.locator('#steps');
const cells = page => page.locator('#board .cell');

const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/** Dismisses the start sheet, keeping the code the page offered. */
async function start(page) {
  await page.locator('#start-go').click();
  await expect(page.locator('#start')).not.toHaveAttribute('data-open', /.*/);
}

/** Types a code into the start sheet and plays it. */
async function join(page, code) {
  await page.locator('#code-input').fill(code);
  await page.locator('#code-go').click();
}

/** BFS through the generator, returning the directions that lead out. */
function solve(page, code) {
  return page.evaluate(code => {
    const m = window.MazeSeed.build(code);
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const key = (x, y) => x + ',' + y;
    const from = new Map();
    const seen = new Set([key(m.start.x, m.start.y)]);
    let queue = [[m.start.x, m.start.y]];
    while (queue.length) {
      const next = [];
      for (const [x, y] of queue) {
        for (const d in DIRS) {
          const nx = x + DIRS[d][0];
          const ny = y + DIRS[d][1];
          if (!m.open(nx, ny) || seen.has(key(nx, ny))) continue;
          seen.add(key(nx, ny));
          from.set(key(nx, ny), [x, y, d]);
          next.push([nx, ny]);
        }
      }
      queue = next;
    }
    if (!seen.has(key(m.exit.x, m.exit.y))) return null;
    const path = [];
    let cur = [m.exit.x, m.exit.y];
    while (key(cur[0], cur[1]) !== key(m.start.x, m.start.y)) {
      const step = from.get(key(cur[0], cur[1]));
      path.unshift(step[2]);
      cur = [step[0], step[1]];
    }
    return path;
  }, code);
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the code', () => {
  test('a code is offered on the first visit', async ({ page }) => {
    await expect(page.locator('#start')).toHaveAttribute('data-open', /.*/);
    await expect(page.locator('#start-code')).toHaveText(/^[A-Z]{5}$/);
    await expect(page.locator('#start-size')).toHaveText(/^\d+ × \d+ squares$/);
  });

  test('the offered code is the one being played', async ({ page }) => {
    const code = await page.locator('#start-code').textContent();
    await start(page);
    await expect(page.locator('#code-btn')).toHaveText(code);
    await expect(status(page)).toHaveText(new RegExp('^' + code + ' · '));
  });

  test('the last letter carries the maze size', async ({ page }) => {
    // Everyone has to be running the same dimensions, and the code is the
    // only thing that travels between phones. See _README.md.
    for (const code of ['MOKAM', 'MOKAB', 'MOKAC', 'MOKAD']) {
      const size = await page.evaluate(c => window.MazeSeed.sizeFor(c), code);
      await join(page, code);
      await expect(status(page)).toHaveText(new RegExp(code + ' · ' + size + '×' + size));
      await page.locator('#code-btn').click();
    }
  });

  test('a typed code is upper-cased', async ({ page }) => {
    await join(page, 'mokat');
    await expect(page.locator('#code-btn')).toHaveText('MOKAT');
  });

  test('a code that is not five letters is refused', async ({ page }) => {
    await join(page, 'ab1');
    await expect(page.locator('#join-error')).toHaveText(/five letters/);
    await expect(page.locator('#start')).toHaveAttribute('data-open', /.*/);
  });
});

test.describe('the maze', () => {
  test('every code has a way out, at every size', async ({ page }) => {
    // A perfect maze is connected by construction, so this is a check on the
    // construction rather than a retry loop the game needs at run time.
    const bad = await page.evaluate(() => {
      const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const failures = [];
      for (let i = 0; i < letters.length; i++) {
        for (let j = 0; j < letters.length; j += 5) {
          const code = letters[i] + 'OKA' + letters[j];
          const m = window.MazeSeed.build(code);
          const seen = new Set([m.start.x + ',' + m.start.y]);
          let queue = [[m.start.x, m.start.y]];
          while (queue.length) {
            const next = [];
            for (const [x, y] of queue) {
              for (const [dx, dy] of DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                if (!m.open(nx, ny) || seen.has(nx + ',' + ny)) continue;
                seen.add(nx + ',' + ny);
                next.push([nx, ny]);
              }
            }
            queue = next;
          }
          if (!seen.has(m.exit.x + ',' + m.exit.y)) failures.push(code);
        }
      }
      return failures;
    });
    expect(bad).toEqual([]);
  });

  test('the border has exactly one opening', async ({ page }) => {
    const openings = await page.evaluate(() => {
      const counts = [];
      for (const code of ['MOKAM', 'RUDEB', 'ZIPOC', 'HAVED']) {
        const m = window.MazeSeed.build(code);
        let n = 0;
        for (let i = 0; i < m.n; i++) {
          if (m.open(i, 0)) n++;
          if (m.open(i, m.n - 1)) n++;
          if (m.open(0, i)) n++;
          if (m.open(m.n - 1, i)) n++;
        }
        counts.push(n);
      }
      return counts;
    });
    expect(openings).toEqual([1, 1, 1, 1]);
  });

  test('the exit is the furthest way out, not the nearest', async ({ page }) => {
    const results = await page.evaluate(() => {
      const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      return ['MOKAM', 'RUDEB', 'ZIPOC', 'HAVED'].map(code => {
        const m = window.MazeSeed.build(code);
        const dist = new Map([[m.start.x + ',' + m.start.y, 0]]);
        let queue = [[m.start.x, m.start.y]];
        while (queue.length) {
          const next = [];
          for (const [x, y] of queue) {
            for (const [dx, dy] of DIRS) {
              const nx = x + dx;
              const ny = y + dy;
              if (!m.open(nx, ny) || dist.has(nx + ',' + ny)) continue;
              dist.set(nx + ',' + ny, dist.get(x + ',' + y) + 1);
              next.push([nx, ny]);
            }
          }
          queue = next;
        }
        // Every cell on the outer ring could have been the way out.
        let best = 0;
        for (let i = 1; i <= m.n - 2; i += 2) {
          for (const p of [[i, 1], [i, m.n - 2], [1, i], [m.n - 2, i]]) {
            best = Math.max(best, dist.get(p[0] + ',' + p[1]) || 0);
          }
        }
        return { exit: dist.get(m.exit.x + ',' + m.exit.y), best: best };
      });
    });
    for (const r of results) expect(r.exit).toBe(r.best + 1);
  });

  test('the same code draws the same maze twice', async ({ page }) => {
    const fingerprint = () => page.evaluate(() => {
      const m = window.MazeSeed.build('RUDEB');
      let out = m.n + ':' + m.start.x + ',' + m.start.y + ':' + m.exit.x + ',' + m.exit.y + ':';
      for (let y = 0; y < m.n; y++) {
        for (let x = 0; x < m.n; x++) out += m.open(x, y) ? '.' : '#';
      }
      return out;
    });
    const first = await fingerprint();
    await page.reload();
    expect(await fingerprint()).toBe(first);
    // …and a different code is a different maze.
    const other = await page.evaluate(() => {
      const m = window.MazeSeed.build('ZIPOB');
      let out = '';
      for (let y = 0; y < m.n; y++) {
        for (let x = 0; x < m.n; x++) out += m.open(x, y) ? '.' : '#';
      }
      return out;
    });
    expect(first).not.toContain(other);
  });
});

test.describe('moving', () => {
  test('you stay in the middle and the maze moves', async ({ page }) => {
    await start(page);
    await expect(cells(page)).toHaveCount(25);
    await expect(page.locator('.cell[data-you]')).toHaveCount(1);
    await expect(cells(page).nth(12)).toHaveAttribute('data-you', '');

    await page.locator('.dir:not([data-blocked])').first().click();
    await expect(steps(page)).toHaveText('1');
    await expect(cells(page).nth(12)).toHaveAttribute('data-you', '');
  });

  test('a wall does not let you through', async ({ page }) => {
    // Pick a code whose starting square has a wall to walk into, rather than
    // hoping the offered one does.
    const found = await page.evaluate(() => {
      const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const code = ch + 'OKAM';
        const m = window.MazeSeed.build(code);
        for (const d in DIRS) {
          if (!m.open(m.start.x + DIRS[d][0], m.start.y + DIRS[d][1])) {
            return { code: code, dir: d };
          }
        }
      }
      return null;
    });
    expect(found).not.toBeNull();

    await join(page, found.code);
    const wall = page.locator('.dir[data-dir="' + found.dir + '"]');
    await expect(wall).toHaveAttribute('data-blocked', '');
    await wall.click();
    await expect(steps(page)).toHaveText('0');
  });

  test('arrow keys move too', async ({ page }) => {
    await start(page);
    const dir = await page.locator('.dir:not([data-blocked])').first().getAttribute('data-dir');
    await page.keyboard.press(ARROWS[dir]);
    await expect(steps(page)).toHaveText('1');
  });

  test('the squares behind you are shaded, and only that many', async ({ page }) => {
    await start(page);
    // Six steps of a walk, some of which may retrace, then the trail is
    // capped at the setting rather than at how far you have been.
    for (let i = 0; i < 6; i++) {
      const dir = await page.locator('.dir:not([data-blocked])').first().getAttribute('data-dir');
      await page.keyboard.press(ARROWS[dir]);
    }
    await expect(steps(page)).toHaveText('6');
    const shaded = await page.locator('.cell[data-trail]').count();
    expect(shaded).toBeGreaterThan(0);
    expect(shaded).toBeLessThanOrEqual(6);
    // The newest is darker than the oldest on screen.
    const fades = await page.evaluate(() =>
      [...document.querySelectorAll('.cell[data-trail]')]
        .map(c => parseFloat(c.style.getPropertyValue('--fade'))));
    for (const f of fades) expect(f).toBeGreaterThan(0);
    expect(Math.max(...fades)).toBeLessThanOrEqual(0.5);
  });

  test('reaching the exit ends the run', async ({ page }) => {
    const code = 'MOKAM';
    await join(page, code);
    const path = await solve(page, code);
    expect(path.length).toBeGreaterThan(0);
    for (const dir of path) await page.keyboard.press(ARROWS[dir]);

    await expect(page.locator('body')).toHaveAttribute('data-state', 'won');
    await expect(page.locator('#win')).toBeVisible();
    await expect(page.locator('#win-line')).toHaveText(
      new RegExp('\\d+:\\d\\d · ' + path.length + ' steps'));
    await expect(steps(page)).toHaveText(String(path.length));

    // Nothing moves after that.
    await page.keyboard.press('ArrowUp');
    await expect(steps(page)).toHaveText(String(path.length));
  });
});

test.describe('settings', () => {
  test('the view size changes how much you can see', async ({ page }) => {
    await start(page);
    await page.locator('#settings-btn').click();
    await page.locator('#opt-view button', { hasText: '9×9' }).click();
    await expect(cells(page)).toHaveCount(81);
    await page.locator('#settings .modal-close').click();
    await expect(cells(page).nth(40)).toHaveAttribute('data-you', '');
  });

  test('the trail length is a setting, and none means none', async ({ page }) => {
    await start(page);
    for (let i = 0; i < 4; i++) {
      const dir = await page.locator('.dir:not([data-blocked])').first().getAttribute('data-dir');
      await page.keyboard.press(ARROWS[dir]);
    }
    await expect(page.locator('.cell[data-trail]').first()).toBeVisible();

    await page.locator('#settings-btn').click();
    await page.locator('#opt-trail button', { hasText: 'None' }).click();
    await expect(page.locator('.cell[data-trail]')).toHaveCount(0);
  });

  test('a new maze size makes a new code and a new maze', async ({ page }) => {
    await start(page);
    const before = await page.locator('#code-btn').textContent();
    await page.locator('#settings-btn').click();
    await page.locator('#opt-size button', { hasText: '15×15' }).click();
    await expect(page.locator('#start')).toHaveAttribute('data-open', /.*/);
    await expect(page.locator('#start-size')).toHaveText('15 × 15 squares');
    await start(page);
    await expect(page.locator('#code-btn')).not.toHaveText(before);
    await expect(status(page)).toHaveText(/· 15×15 ·/);
    await expect(steps(page)).toHaveText('0');
  });
});

test.describe('persistence', () => {
  test('the run survives a reload', async ({ page }) => {
    await join(page, 'RUDEB');
    for (let i = 0; i < 3; i++) {
      const dir = await page.locator('.dir:not([data-blocked])').first().getAttribute('data-dir');
      await page.keyboard.press(ARROWS[dir]);
    }
    const view = await cells(page).evaluateAll(list =>
      list.map(c => c.dataset.t).join(''));

    await page.reload();
    await expect(page.locator('#start')).not.toHaveAttribute('data-open', /.*/);
    await expect(page.locator('#code-btn')).toHaveText('RUDEB');
    await expect(steps(page)).toHaveText('3');
    expect(await cells(page).evaluateAll(list =>
      list.map(c => c.dataset.t).join(''))).toBe(view);
  });

  test('it saves under its own namespaced key', async ({ page }) => {
    await join(page, 'RUDEB');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('games.maze.v1')));
    expect(saved.code).toBe('RUDEB');
    expect(Number.isInteger(saved.x)).toBe(true);
    expect(saved.steps).toBe(0);
  });

  test('corrupt saved state falls back to a playable maze', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.maze.v1', 'not json'));
    await page.reload();
    await expect(page.locator('#start-code')).toHaveText(/^[A-Z]{5}$/);
    await start(page);
    await expect(steps(page)).toHaveText('0');
  });

  test('a saved position inside a wall is not restored', async ({ page }) => {
    await join(page, 'RUDEB');
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('games.maze.v1'));
      saved.x = 0;
      saved.y = 0;
      localStorage.setItem('games.maze.v1', JSON.stringify(saved));
    });
    await page.reload();
    // Back to the middle of the maze, which is always an open square.
    await expect(page.locator('.cell[data-you]')).toHaveCount(1);
    await expect(cells(page).nth(12)).toHaveAttribute('data-t', 'floor');
  });
});

test.describe('the shell', () => {
  test('nothing leaves the origin', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await start(page);
    await page.keyboard.press('ArrowUp');
    expect(external).toEqual([]);
  });
});
