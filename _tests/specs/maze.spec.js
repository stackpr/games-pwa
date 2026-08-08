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
          if (!m.canMove(x, y, d)) continue;
          const nx = x + DIRS[d][0];
          const ny = y + DIRS[d][1];
          if (seen.has(key(nx, ny))) continue;
          seen.add(key(nx, ny));
          from.set(key(nx, ny), [x, y, d]);
          next.push([nx, ny]);
        }
      }
      queue = next;
    }
    if (!seen.has(key(m.exitTile.x, m.exitTile.y))) return null;
    const path = [];
    let cur = [m.exitTile.x, m.exitTile.y];
    while (key(cur[0], cur[1]) !== key(m.start.x, m.start.y)) {
      const step = from.get(key(cur[0], cur[1]));
      path.unshift(step[2]);
      cur = [step[0], step[1]];
    }
    return path;
  }, code);
}

/** Walks a solution by pressing the pad, which is far quicker than keys. */
function walk(page, path) {
  return page.evaluate(dirs => {
    for (const dir of dirs) {
      const btn = document.querySelector('.dir[data-dir="' + dir + '"]');
      if (btn) btn.click();
    }
    return document.body.dataset.state;
  }, path);
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
  test('every square is reachable, and so is the way out', async ({ page }) => {
    // Walls on the edges mean every square of the grid is somewhere you can
    // stand — so a spanning-tree carve reaches all of them, and "there is a
    // way out" is a property of the construction rather than a retry loop.
    const bad = await page.evaluate(() => {
      const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
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
              for (const d in DIRS) {
                if (!m.canMove(x, y, d)) continue;
                const nx = x + DIRS[d][0];
                const ny = y + DIRS[d][1];
                if (seen.has(nx + ',' + ny)) continue;
                seen.add(nx + ',' + ny);
                next.push([nx, ny]);
              }
            }
            queue = next;
          }
          // Every square, plus the one outside the opening.
          if (seen.size !== m.n * m.n + 1) failures.push(code + ': ' + seen.size);
          if (!seen.has(m.exitTile.x + ',' + m.exitTile.y)) failures.push(code + ': no exit');
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
          if (!m.wall(i, 0, 'up')) n++;
          if (!m.wall(i, m.n - 1, 'down')) n++;
          if (!m.wall(0, i, 'left')) n++;
          if (!m.wall(m.n - 1, i, 'right')) n++;
        }
        counts.push(n);
      }
      return counts;
    });
    expect(openings).toEqual([1, 1, 1, 1]);
  });

  test('every wall is one of two per square, plus the far edges', async ({ page }) => {
    // The model the game stores: a square owns the wall above it and the wall
    // to its left, and the grid carries one extra row and column of edges.
    const m = await page.evaluate(() => {
      const maze = window.MazeSeed.build('RUDEB');
      const n = maze.n;
      return {
        n: n,
        // Outside the grid there is nothing to own, so nothing is reported.
        beyond: [
          maze.edge(-1, 0, 'up'), maze.edge(0, -1, 'left'),
          maze.edge(n, 0, 'up'), maze.edge(0, n, 'left'),
        ],
        // The far edges do exist: row n of horizontals, column n of
        // verticals, solid all the way across bar the one way out.
        farRow: (() => {
          let walls = 0;
          for (let x = 0; x < n; x++) walls += maze.edge(x, n, 'up');
          return [walls, n - (maze.exit.dir === 'down' ? 1 : 0)];
        })(),
        farCol: (() => {
          let walls = 0;
          for (let y = 0; y < n; y++) walls += maze.edge(n, y, 'left');
          return [walls, n - (maze.exit.dir === 'right' ? 1 : 0)];
        })(),
        // A wall read from either side is the same wall.
        agrees: maze.wall(1, 1, 'right') === maze.wall(2, 1, 'left') &&
                maze.wall(1, 1, 'down') === maze.wall(1, 2, 'up'),
      };
    });
    expect(m.beyond).toEqual([0, 0, 0, 0]);
    expect(m.farRow[0]).toBe(m.farRow[1]);
    expect(m.farCol[0]).toBe(m.farCol[1]);
    expect(m.agrees).toBe(true);
  });

  test('the exit is the furthest way out, not the nearest', async ({ page }) => {
    const results = await page.evaluate(() => {
      const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      return ['MOKAM', 'RUDEB', 'ZIPOC', 'HAVED'].map(code => {
        const m = window.MazeSeed.build(code);
        const dist = new Map([[m.start.x + ',' + m.start.y, 0]]);
        let queue = [[m.start.x, m.start.y]];
        while (queue.length) {
          const next = [];
          for (const [x, y] of queue) {
            for (const d in DIRS) {
              if (!m.canMove(x, y, d)) continue;
              const nx = x + DIRS[d][0];
              const ny = y + DIRS[d][1];
              if (dist.has(nx + ',' + ny)) continue;
              dist.set(nx + ',' + ny, dist.get(x + ',' + y) + 1);
              next.push([nx, ny]);
            }
          }
          queue = next;
        }
        // Every square on the outer ring could have been the way out.
        let best = 0;
        for (let i = 0; i < m.n; i++) {
          for (const p of [[i, 0], [i, m.n - 1], [0, i], [m.n - 1, i]]) {
            best = Math.max(best, dist.get(p[0] + ',' + p[1]) || 0);
          }
        }
        return { exit: dist.get(m.exit.x + ',' + m.exit.y), best: best };
      });
    });
    for (const r of results) expect(r.exit).toBe(r.best);
  });

  test('the same code draws the same maze twice', async ({ page }) => {
    const fingerprint = code => page.evaluate(code => {
      const m = window.MazeSeed.build(code);
      let out = m.n + ':' + m.start.x + ',' + m.start.y + ':' +
        m.exit.x + ',' + m.exit.y + m.exit.dir + ':';
      for (let y = 0; y <= m.n; y++) {
        for (let x = 0; x <= m.n; x++) {
          out += m.edge(x, y, 'up') + '' + m.edge(x, y, 'left');
        }
      }
      return out;
    }, code);
    const first = await fingerprint('RUDEB');
    await page.reload();
    expect(await fingerprint('RUDEB')).toBe(first);
    // …and a different code is a different maze.
    expect(await fingerprint('ZIPOB')).not.toBe(first);
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

  test('every square you can see is a square you could stand on', async ({ page }) => {
    // Walls are edges now, so nothing in the view is a solid block; the
    // whole 5×5 is floor unless it is off the edge of the maze.
    await start(page);
    const kinds = await cells(page).evaluateAll(list =>
      [...new Set(list.map(c => c.dataset.t))]);
    expect(kinds).toEqual(['floor']);
    // …and the squares carry the walls, drawn once each.
    const walls = await cells(page).evaluateAll(list =>
      list.map(c => c.dataset.walls).join('|'));
    expect(walls).toMatch(/[nesw]/);
  });

  test('a wall does not let you through', async ({ page }) => {
    // Pick a code whose starting square has a wall to walk into, rather than
    // hoping the offered one does.
    const found = await page.evaluate(() => {
      for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const code = ch + 'OKAM';
        const m = window.MazeSeed.build(code);
        for (const d of ['up', 'down', 'left', 'right']) {
          if (m.wall(m.start.x, m.start.y, d)) return { code: code, dir: d };
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

    // The wall is on the middle square's own edge, in the direction it blocks.
    const side = { up: 'n', down: 's', left: 'w', right: 'e' }[found.dir];
    const seen = await cells(page).nth(12).getAttribute('data-walls');
    const neighbour = { up: 7, down: 17, left: 11, right: 13 }[found.dir];
    const other = await cells(page).nth(neighbour).getAttribute('data-walls');
    // Drawn once: either this square's edge or its neighbour's, never both.
    const mine = seen.split(' ').indexOf(side) >= 0;
    const theirs = other.split(' ').indexOf({ n: 's', s: 'n', w: 'e', e: 'w' }[side]) >= 0;
    expect(mine || theirs).toBe(true);
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
    // The way out is a real walk now that every square is walkable.
    expect(path.length).toBeGreaterThan(20);
    expect(await walk(page, path)).toBe('won');

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
      list.map(c => c.dataset.walls).join('|'));

    await page.reload();
    await expect(page.locator('#start')).not.toHaveAttribute('data-open', /.*/);
    await expect(page.locator('#code-btn')).toHaveText('RUDEB');
    await expect(steps(page)).toHaveText('3');
    expect(await cells(page).evaluateAll(list =>
      list.map(c => c.dataset.walls).join('|'))).toBe(view);
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

  test('a saved position off the grid is not restored', async ({ page }) => {
    await join(page, 'RUDEB');
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('games.maze.v1'));
      saved.x = -5;
      saved.y = 99;
      saved.steps = 40;
      localStorage.setItem('games.maze.v1', JSON.stringify(saved));
    });
    await page.reload();
    // Back to the middle of the maze, and the run goes with it.
    await expect(page.locator('.cell[data-you]')).toHaveCount(1);
    await expect(cells(page).nth(12)).toHaveAttribute('data-t', 'floor');
    await expect(steps(page)).toHaveText('0');
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
