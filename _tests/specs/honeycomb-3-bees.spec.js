const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/honeycomb-3-bees/';

const cell = (page, k) => page.locator(`.cell[data-k="${k}"]`);
const label = page => page.locator('#turn-label');
const hint = page => page.locator('#hint');

/** Cell keys in the same fixed order the game stores them in. */
const KEYS = (() => {
  const out = [];
  for (let r = -3; r <= 3; r++) {
    for (let q = Math.max(-3, -3 - r); q <= Math.min(3, 3 - r); q++) out.push(q + ',' + r);
  }
  return out;
})();

/**
 * Seeds a position. `bees` maps a cell key to a colour, `gone` lists
 * removed cells, and the pool is balanced so the save passes its own
 * conservation check.
 */
async function position(page, { bees = {}, gone = [], caps, turn = 1, phase = 'move' } = {}) {
  await page.evaluate(([keys, m, g, cp, t, ph]) => {
    const SUPPLY = { w: 6, g: 8, b: 10 };
    const cells = keys.map(k => (g.includes(k) ? '-' : (m[k] || '.'))).join('');
    const caps = cp || [{ w: 0, g: 0, b: 0 }, { w: 0, g: 0, b: 0 }];
    const pool = { w: SUPPLY.w, g: SUPPLY.g, b: SUPPLY.b };
    for (const c of ['w', 'g', 'b']) {
      pool[c] -= caps[0][c] + caps[1][c];
      for (const k of Object.keys(m)) if (m[k] === c) pool[c]--;
    }
    localStorage.setItem('games.honeycomb-3-bees.v1', JSON.stringify({
      cells, pool, caps, turn: t, phase: ph, chain: null, winner: 0,
    }));
  }, [KEYS, bees, gone, caps, turn, phase]);
  await page.reload();
}

const live = page => page.evaluate(() =>
  [...document.querySelectorAll('.cell[data-live]')]
    .map(r => r.dataset.k + ':' + r.dataset.live).sort());

const onBoard = page => page.evaluate(() =>
  [...document.querySelectorAll('.cell:not([data-gone])')].length);

const capsOf = (page, side) => page.evaluate(s => ['w', 'g', 'b']
  .map(c => Number(document.getElementById('c' + s + c).lastElementChild.textContent)), side);

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the opening board', () => {
  test('thirty-seven empty cells and the full pool', async ({ page }) => {
    expect(await onBoard(page)).toBe(37);
    await expect(page.locator('.cell[data-c]')).toHaveCount(0);
    await expect(page.locator('#pool-w')).toHaveText('6');
    await expect(page.locator('#pool-g')).toHaveText('8');
    await expect(page.locator('#pool-b')).toHaveText('10');
    await expect(label(page)).toHaveText(/^Player 1 to move/);
  });

  test('the cells sit on a hexagon, widest in the middle', async ({ page }) => {
    // Turning the board a quarter-turn turns its rows into columns, so the
    // landscape ranks are read down --y and the portrait ones across --fx.
    for (const axis of ['--y', '--fx']) {
      const rows = await page.evaluate(a => {
        const by = new Map();
        for (const r of document.querySelectorAll('.cell')) {
          const y = Math.round(parseFloat(r.style.getPropertyValue(a)) * 100);
          by.set(y, (by.get(y) || 0) + 1);
        }
        return [...by.entries()].sort((x, z) => x[0] - z[0]).map(e => e[1]);
      }, axis);
      expect(rows, `ranks along ${axis}`).toEqual([4, 5, 6, 7, 6, 5, 4]);
    }
  });

  test('neighbouring cells are one step apart in either orientation',
    async ({ page }) => {
      // The two coordinate sets have to describe the same hexagon, or one
      // orientation quietly draws a squashed board.
      const gaps = await page.evaluate(() => {
        const at = k => {
          const r = document.querySelector(`.cell[data-k="${k}"]`);
          return {
            land: [+r.style.getPropertyValue('--x'), +r.style.getPropertyValue('--y')],
            port: [+r.style.getPropertyValue('--fx'), +r.style.getPropertyValue('--fy')],
          };
        };
        const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
        const o = at('0,0');
        return [['1,0'], ['0,1'], ['1,-1'], ['-1,0'], ['0,-1'], ['-1,1']]
          .map(([k]) => {
            const n = at(k);
            return [d(o.land, n.land), d(o.port, n.port)];
          });
      });
      for (const [land, port] of gaps) {
        expect(land).toBeCloseTo(1, 3);
        expect(port).toBeCloseTo(1, 3);
      }
    });

  test('a bee is a circle inside its cell', async ({ page }) => {
    await position(page, { bees: { '0,0': 'w' } });
    const box = await page.evaluate(() => {
      const r = document.querySelector('.cell[data-k="0,0"]');
      const b = r.querySelector('.bee');
      const rr = r.getBoundingClientRect();
      const bb = b.getBoundingClientRect();
      return {
        round: getComputedStyle(b).borderRadius,
        inside: bb.left > rr.left && bb.right < rr.right,
        ratio: bb.width / rr.width,
        square: Math.abs(rr.width - rr.height) < 1.5,
      };
    });
    expect(box.round).toBe('50%');
    expect(box.inside).toBe(true);
    expect(box.ratio).toBeGreaterThan(0.5);
    expect(box.ratio).toBeLessThan(0.8);
    expect(box.square).toBe(true);
  });

  test('nothing is playable until a colour is picked', async ({ page }) => {
    expect(await live(page)).toEqual([]);
    await expect(hint(page)).toHaveText('Pick a bee, then a cell.');
    await page.locator('#pick-w').click();
    await expect(hint(page)).toHaveText('Tap an empty cell.');
    expect((await live(page)).length).toBe(37);
  });
});

test.describe('placing and removing', () => {
  test('a placement is followed by taking a cell away', async ({ page }) => {
    await page.locator('#pick-w').click();
    await cell(page, '0,0').click();

    await expect(cell(page, '0,0')).toHaveAttribute('data-c', 'w');
    await expect(page.locator('#pool-w')).toHaveText('5');
    await expect(hint(page)).toHaveText('Now take a cell off the edge.');
    // The turn has not passed: the move is not finished.
    await expect(label(page)).toHaveText(/^Player 1 to move/);

    await cell(page, '3,-3').click();
    expect(await onBoard(page)).toBe(36);
    await expect(label(page)).toHaveText(/^Player 2 to move/);
  });

  test('only cells at the edge come off', async ({ page }) => {
    await page.locator('#pick-w').click();
    await cell(page, '0,0').click();
    const takeable = (await live(page)).filter(s => s.endsWith(':take'));
    // The eighteen cells of the outer hexagon, and nothing inside it.
    expect(takeable.length).toBe(18);
    expect(takeable).not.toContain('0,1:take');
    expect(takeable).toContain('3,-3:take');
  });

  test('a cell wedged between two others cannot be prised out',
    async ({ page }) => {
      // 0,0 with gaps on opposite sides only: two open neighbours, but not
      // next to each other, so it stays.
      await position(page, { gone: ['1,0', '-1,0'], phase: 'remove' });
      await expect(cell(page, '0,0')).not.toHaveAttribute('data-live', 'take');
    });

  test('a cell you just filled is not a cell you can remove', async ({ page }) => {
    await page.locator('#pick-b').click();
    await cell(page, '3,-3').click();
    await expect(cell(page, '3,-3')).not.toHaveAttribute('data-live', 'take');
  });

  test('with no cell removable the placement is the whole move',
    async ({ page }) => {
      // A flower: the centre and its six neighbours. Filling the last outer
      // cell leaves the centre empty but walled in on all six sides, so
      // nothing can be taken off and the placement stands alone.
      const flower = ['0,0', '1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1'];
      const gone = KEYS.filter(k => !flower.includes(k));
      const bees = {};
      for (const k of flower.slice(2)) bees[k] = 'g';
      await position(page, { gone, bees });

      await page.locator('#pick-w').click();
      await cell(page, '1,0').click();
      expect((await live(page)).filter(s => s.endsWith(':take'))).toEqual([]);
      await expect(label(page)).toHaveText(/^Player 2 to move/);
    });
});

test.describe('the owed cell', () => {
  test('a placement that sets up a jump still owes a cell', async ({ page }) => {
    // Dropping a bee next to a lone one creates a jump on the spot. The
    // move is only half done, so the board must keep asking for the cell.
    await position(page, { bees: { '1,0': 'g' } });
    await page.locator('#pick-w').click();
    await cell(page, '0,0').click();

    await expect(hint(page)).toHaveText('Now take a cell off the edge.');
    await expect(label(page)).toHaveText(/^Player 1 to move/);
    const marks = await live(page);
    expect(marks.every(m => m.endsWith(':take'))).toBe(true);
    expect(marks.length).toBeGreaterThan(0);
  });

  test('the jump it set up belongs to the other player', async ({ page }) => {
    await position(page, { bees: { '1,0': 'g' } });
    await page.locator('#pick-w').click();
    await cell(page, '0,0').click();
    await cell(page, '3,-3').click();

    await expect(label(page)).toHaveText(/^Player 2 to move/);
    await expect(hint(page)).toHaveText('A jump is on — you have to take it.');
  });

  test('a jump turn takes no cell off', async ({ page }) => {
    await position(page, { bees: { '0,0': 'w', '1,0': 'g' } });
    const before = await onBoard(page);
    await cell(page, '0,0').click();
    await cell(page, '2,0').click();
    // The comb is the same size afterwards: a jump takes a bee, and only a
    // placement takes a cell. See _README.md.
    expect(await onBoard(page)).toBe(before);
    await expect(label(page)).toHaveText(/^Player 2 to move/);
    await expect(hint(page)).not.toHaveText('Now take a cell off the edge.');
  });

  test('a chain is not interrupted by the removal step', async ({ page }) => {
    await position(page, { bees: { '-2,0': 'w', '-1,0': 'g', '1,0': 'b' } });
    await cell(page, '-2,0').click();
    await cell(page, '0,0').click();
    await expect(hint(page)).toHaveText('Keep jumping with that bee.');
  });
});

test.describe('jumping', () => {
  test('a jump is compulsory and placing is refused', async ({ page }) => {
    await position(page, { bees: { '0,0': 'w', '1,0': 'g' } });
    await expect(hint(page)).toHaveText('A jump is on — you have to take it.');
    await expect(page.locator('#pick-w')).toBeDisabled();
    await expect(cell(page, '0,0')).toHaveAttribute('data-live', 'jump');
  });

  test('jumping takes the bee that was jumped', async ({ page }) => {
    await position(page, { bees: { '0,0': 'w', '1,0': 'g' } });
    await cell(page, '0,0').click();
    await expect(cell(page, '2,0')).toHaveAttribute('data-live', 'drop');
    await cell(page, '2,0').click();

    await expect(cell(page, '2,0')).toHaveAttribute('data-c', 'w');
    await expect(cell(page, '0,0')).not.toHaveAttribute('data-c', /.*/);
    // The bee is taken; the cell it sat on stays, now empty. Only a
    // placement takes a cell off the comb — see _README.md.
    await expect(cell(page, '1,0')).not.toHaveAttribute('data-gone', /.*/);
    await expect(cell(page, '1,0')).not.toHaveAttribute('data-c', /.*/);
    expect(await capsOf(page, 1)).toEqual([0, 1, 0]);
    await expect(label(page)).toHaveText(/^Player 2 to move/);
  });

  test('a chain keeps the same bee going', async ({ page }) => {
    // -2,0 jumps -1,0 into the centre, and from there jumps 1,0 into 2,0.
    await position(page, { bees: { '-2,0': 'w', '-1,0': 'g', '1,0': 'b' } });
    await cell(page, '-2,0').click();
    await cell(page, '0,0').click();

    await expect(hint(page)).toHaveText('Keep jumping with that bee.');
    await expect(label(page)).toHaveText(/^Player 1 to move/);
    // Only that bee is live; nothing else may be picked up.
    expect(await live(page)).toEqual(['0,0:jump', '2,0:drop']);

    await cell(page, '2,0').click();
    expect(await capsOf(page, 1)).toEqual([0, 1, 1]);
    await expect(label(page)).toHaveText(/^Player 2 to move/);
  });

  test('a bee with nowhere to land does not count as a jump',
    async ({ page }) => {
      // Both landing cells are missing, so this is a placement turn after all.
      await position(page, {
        bees: { '0,0': 'w', '1,0': 'g' }, gone: ['2,0', '-1,0'],
      });
      await expect(hint(page)).toHaveText('Pick a bee, then a cell.');
      await expect(page.locator('#pick-w')).toBeEnabled();
    });
});

test.describe('cutting a group off', () => {
  test('a full group that comes away is claimed whole', async ({ page }) => {
    // 3,-3 and 2,-3 are a pair hanging off the corner; 3,-3 is full and
    // 2,-3 is the empty cell joining it to everything else.
    const keep = ['3,-3', '2,-3', '1,-3', '0,-3'];
    const gone = KEYS.filter(k => !keep.includes(k));
    await position(page, {
      gone, bees: { '3,-3': 'b', '0,-3': 'w' }, phase: 'remove',
    });
    await cell(page, '2,-3').click();

    // 3,-3 is now on its own and full, so it goes to the mover.
    expect(await capsOf(page, 1)).toEqual([0, 0, 1]);
    await expect(cell(page, '3,-3')).toHaveAttribute('data-gone', '');
  });

  test('a group with an empty cell in it comes off too', async ({ page }) => {
    // Same shape, but the cut-off pair is one bee and one empty ring. It
    // still leaves the board, and the bee on it is still claimed — a
    // detached ring can never be played to or from again. See _README.md.
    // Six cells in a line; cutting 1,-3 leaves two on the corner side and
    // three on the other, so the larger side is unambiguously the comb.
    const keep = ['3,-3', '2,-3', '1,-3', '0,-3', '-1,-2', '-2,-1'];
    const gone = KEYS.filter(k => !keep.includes(k));
    await position(page, {
      gone, bees: { '3,-3': 'b', '0,-3': 'w' }, phase: 'remove',
    });
    await cell(page, '1,-3').click();

    // 3,-3 and 2,-3 come away together: one dark bee to the mover.
    expect(await capsOf(page, 1)).toEqual([0, 0, 1]);
    await expect(cell(page, '3,-3')).toHaveAttribute('data-gone', '');
    await expect(cell(page, '2,-3')).toHaveAttribute('data-gone', '');
    // The larger side is the comb and stays put.
    await expect(cell(page, '0,-3')).not.toHaveAttribute('data-gone', /.*/);
  });

  test('an empty group that comes away is removed and claims nothing',
    async ({ page }) => {
      const keep = ['3,-3', '2,-3', '1,-3', '0,-3', '-1,-2', '-2,-1'];
      const gone = KEYS.filter(k => !keep.includes(k));
      await position(page, { gone, bees: { '0,-3': 'w' }, phase: 'remove' });
      await cell(page, '1,-3').click();

      expect(await capsOf(page, 1)).toEqual([0, 0, 0]);
      await expect(cell(page, '3,-3')).toHaveAttribute('data-gone', '');
      await expect(cell(page, '2,-3')).toHaveAttribute('data-gone', '');
    });
});

test.describe('winning', () => {
  const cases = [
    { name: 'three light', caps: { w: 2, g: 0, b: 0 }, colour: 'w', over: 'w' },
    { name: 'four mid', caps: { w: 0, g: 3, b: 0 }, colour: 'g', over: 'g' },
    { name: 'five dark', caps: { w: 0, g: 0, b: 4 }, colour: 'b', over: 'b' },
    { name: 'two of each', caps: { w: 2, g: 2, b: 1 }, colour: 'b', over: 'b' },
  ];

  for (const c of cases) {
    test(`taking ${c.name} wins`, async ({ page }) => {
      await position(page, {
        bees: { '0,0': 'w', '1,0': c.colour },
        caps: [c.caps, { w: 0, g: 0, b: 0 }],
      });
      await cell(page, '0,0').click();
      await cell(page, '2,0').click();
      await expect(page.locator('#turn')).toHaveAttribute('data-state', 'over');
      await expect(label(page)).toHaveText('Player 1 wins');
    });
  }

  test('a colour at its target is called out on the tray', async ({ page }) => {
    await position(page, { caps: [{ w: 3, g: 0, b: 0 }, { w: 0, g: 0, b: 0 }] });
    await expect(page.locator('#c1w')).toHaveAttribute('data-done', '');
    await expect(page.locator('#c1g')).not.toHaveAttribute('data-done', /.*/);
  });

  test('the board locks once the game is over', async ({ page }) => {
    await position(page, {
      bees: { '0,0': 'w', '1,0': 'w' },
      caps: [{ w: 2, g: 0, b: 0 }, { w: 0, g: 0, b: 0 }],
    });
    await cell(page, '0,0').click();
    await cell(page, '2,0').click();
    expect(await live(page)).toEqual([]);
  });
});

test.describe('the pool running out', () => {
  test('an empty pool is placed from your own stack', async ({ page }) => {
    // Every bee taken; player 1 has to spend one to move at all.
    await position(page, {
      caps: [{ w: 6, g: 0, b: 0 }, { w: 0, g: 8, b: 10 }],
    });
    await expect(hint(page))
      .toHaveText('Pool is empty — place from what you have taken.');
    await expect(page.locator('#pool-w')).toHaveText('6');
    await expect(page.locator('#pool-g')).toBeDisabled();

    await page.locator('#pick-w').click();
    await cell(page, '0,0').click();
    await expect(page.locator('#pool-w')).toHaveText('5');
    expect(await capsOf(page, 1)).toEqual([5, 0, 0]);
  });
});

test.describe('undo, reset and persistence', () => {
  test('undo takes back a placement and its cell', async ({ page }) => {
    await page.locator('#pick-w').click();
    await cell(page, '0,0').click();
    await cell(page, '3,-3').click();
    expect(await onBoard(page)).toBe(36);

    await page.locator('#undo').click();
    expect(await onBoard(page)).toBe(37);
    await expect(cell(page, '0,0')).not.toHaveAttribute('data-c', /.*/);
    await expect(page.locator('#pool-w')).toHaveText('6');
    await expect(label(page)).toHaveText(/^Player 1 to move/);
  });

  test('undo is disabled before anything happens', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('new game restores the full board', async ({ page }) => {
    await page.locator('#pick-w').click();
    await cell(page, '0,0').click();
    await cell(page, '3,-3').click();
    await page.locator('#reset').click();
    expect(await onBoard(page)).toBe(37);
    await expect(page.locator('#pool-w')).toHaveText('6');
  });

  test('the position survives a reload', async ({ page }) => {
    await page.locator('#pick-g').click();
    await cell(page, '0,0').click();
    await cell(page, '3,-3').click();
    await page.reload();
    await expect(cell(page, '0,0')).toHaveAttribute('data-c', 'g');
    await expect(cell(page, '3,-3')).toHaveAttribute('data-gone', '');
    await expect(label(page)).toHaveText(/^Player 2 to move/);
  });

  test('corrupt saved state falls back to a new game', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.honeycomb-3-bees.v1', 'not json'));
    await page.reload();
    expect(await onBoard(page)).toBe(37);
  });

  test('a save whose bees do not add up is rejected', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.honeycomb-3-bees.v1',
      JSON.stringify({
        cells: 'w'.repeat(37), pool: { w: 6, g: 8, b: 10 },
        caps: [{ w: 0, g: 0, b: 0 }, { w: 0, g: 0, b: 0 }],
        turn: 1, phase: 'move', chain: null, winner: 0,
      })));
    await page.reload();
    expect(await onBoard(page)).toBe(37);
    await expect(page.locator('.cell[data-c]')).toHaveCount(0);
  });
});

test.describe('presentation', () => {
  test('the rules modal states the four ways to win', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toContainText('three light');
    await expect(page.locator('#rules')).toContainText('two of every kind');
    await expect(page.locator('#rules')).toContainText('trademark');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('the bees differ by value, not hue', async ({ page }) => {
    await position(page, { bees: { '0,0': 'w', '1,0': 'g', '2,0': 'b' } });
    const light = await page.evaluate(() => {
      const lum = sel => {
        const m = getComputedStyle(document.querySelector(sel), null)
          .backgroundColor.match(/\d+/g).map(Number);
        return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
      };
      return ['w', 'g', 'b'].map(c => lum(`.cell[data-c="${c}"] .bee`));
    });
    // A clear ramp, so the three read apart in greyscale.
    expect(light[0]).toBeGreaterThan(light[1] + 40);
    expect(light[1]).toBeGreaterThan(light[2] + 40);
  });

  test('the turn indicator uses the shared player colours', async ({ page }) => {
    const c = await page.evaluate(() => {
      const disc = () => getComputedStyle(document.getElementById('turn-disc')).backgroundColor;
      const one = disc();
      document.getElementById('turn').dataset.player = '2';
      return { one, two: disc() };
    });
    expect(c.one).toBe('rgb(47, 111, 219)');
    expect(c.two).toBe('rgb(216, 74, 53)');
  });

  test('the board stays on screen and keeps its shape', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 },
      { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const m = await page.evaluate(() => {
        const b = document.getElementById('board').getBoundingClientRect();
        const a = document.querySelector('.cell[data-k="0,0"]').getBoundingClientRect();
        return {
          ratio: b.width / b.height,
          round: Math.abs(a.width - a.height),
          ox: document.documentElement.scrollWidth - window.innerWidth,
          oy: document.documentElement.scrollHeight - window.innerHeight,
        };
      });
      const at = `${size.width}x${size.height}`;
      // Turned a quarter-turn in portrait, so the board fills a tall screen.
      const want = size.height > size.width ? 6.196 / 7 : 7 / 6.196;
      expect(m.ratio, `board ratio at ${at}`).toBeCloseTo(want, 1);
      expect(m.round, `rings round at ${at}`).toBeLessThan(1.5);
      expect(m.ox, `x overflow at ${at}`).toBeLessThanOrEqual(0);
      expect(m.oy, `y overflow at ${at}`).toBeLessThanOrEqual(0);
    }
  });

  test('survives markup from the neighbouring release', async ({ page }) => {
    const errors = trackErrors(page);
    await page.route('**/games/honeycomb-3-bees/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button id="undo"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#undo')).toHaveCount(0);
    expect(await onBoard(page)).toBe(37);
    expect(errors).toEqual([]);
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});
