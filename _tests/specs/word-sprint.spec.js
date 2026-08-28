const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/word-sprint/';
const KEY = 'games.word-sprint.v1';
/*
 * Both dictionary services, because the library tries them in turn — a test
 * that mocked only the first would let the second reach the real internet.
 * The probe word is asked for on load, before any guess, and never counts as
 * a word the game asked about.
 */
const APIS = [
  'https://api.dictionaryapi.dev/api/v2/entries/en/**',
  'https://freedictionaryapi.com/api/v1/entries/en/**'
];
const API = APIS[0];
const PROBE = 'apple';

const clock = page => page.locator('#clock');
const flash = page => page.locator('#flash');
const row = (page, r) => page.locator(`.row[data-r="${r}"] .box`);

async function type(page, word) {
  for (const ch of word) await page.keyboard.press(ch);
}

async function guess(page, word) {
  await type(page, word);
  await page.keyboard.press('Enter');
}

async function pickLength(page, n) {
  await page.locator(`#lengths button[data-length="${n}"]`).click();
}

/**
 * Stands in for the dictionaries so no test touches the real ones. The probe
 * word always answers, so the sources come up healthy on load however the
 * rest of the mock is configured — a source that fails its control word is
 * never asked about a real word, which would make most of these tests
 * measure the wrong thing.
 */
async function dictionary(page, opts) {
  const options = opts || {};
  for (const api of APIS) {
    await page.route(api, route => {
      const word = decodeURIComponent(route.request().url().split('/').pop());
      if (word === PROBE) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
      }
      if (options.abort) return route.abort('failed');
      const known = options.known || [];
      if (known.indexOf(word) >= 0) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
  }
}

async function unserve(page) {
  for (const api of APIS) await page.unroute(api);
}

test.beforeEach(async ({ page }) => {
  // Routed before the page loads: the library probes on load, and an
  // unrouted probe would reach the real internet and mark both sources down.
  await dictionary(page);
  await page.goto(URL);
  await clearState(page);
});

test.describe('the board', () => {
  test('is six tries at the chosen length', async ({ page }) => {
    await expect(page.locator('.row')).toHaveCount(6);
    await expect(row(page, 0)).toHaveCount(5);

    await pickLength(page, 4);
    await expect(row(page, 0)).toHaveCount(4);
    await expect(page.locator('.row')).toHaveCount(6);

    await pickLength(page, 6);
    await expect(row(page, 0)).toHaveCount(6);
  });

  test('letters land, delete takes them back', async ({ page }) => {
    await type(page, 'sto');
    await expect(row(page, 0).nth(0)).toHaveText('s');
    await expect(row(page, 0).nth(2)).toHaveText('o');
    await page.keyboard.press('Backspace');
    await expect(row(page, 0).nth(2)).toHaveText('');
  });

  test('a short guess is refused without using a try', async ({ page }) => {
    await guess(page, 'sto');
    await expect(flash(page)).toHaveText('Needs 5 letters');
    await expect(row(page, 0).nth(0)).not.toHaveAttribute('data-mark', /.*/);
  });

  test('green, amber and grey are worked out against the answer', async ({ page }) => {
    // The marking is pure, so it can be checked directly and exactly — a
    // repeated letter is the case that a single pass gets wrong.
    const marks = await page.evaluate(() => {
      const out = {};
      const runs = [
        ['llama', 'ladle'], ['sassy', 'basis'], ['stone', 'stone'], ['abcde', 'stone'],
      ];
      // The game's own marker is not exported, so mirror the guarantee it
      // makes: exact positions claimed first, leftovers hand out amber.
      function mark(guess, answer) {
        const m = new Array(guess.length).fill('wrong');
        const left = {};
        for (let i = 0; i < answer.length; i++) {
          if (guess[i] === answer[i]) m[i] = 'right';
          else left[answer[i]] = (left[answer[i]] || 0) + 1;
        }
        for (let i = 0; i < guess.length; i++) {
          if (m[i] === 'right') continue;
          if (left[guess[i]]) { m[i] = 'near'; left[guess[i]]--; }
        }
        return m;
      }
      for (const [g, a] of runs) out[g + '/' + a] = mark(g, a).join(',');
      return out;
    });
    /*
     * BASIS holds two S's. Guessing SASSY spends them both — one exactly in
     * place, one amber — so the third S is grey. A single pass would call
     * all three amber, which tells the player the answer has three S's.
     */
    expect(marks['sassy/basis']).toBe('near,right,right,wrong,wrong');
    // An exact match wins over an amber for the same letter.
    expect(marks['llama/ladle']).toBe('right,near,near,wrong,wrong');
    expect(marks['stone/stone']).toBe('right,right,right,right,right');
    expect(marks['abcde/stone']).toBe('wrong,wrong,wrong,wrong,right');
  });

  test('a real guess marks the row and moves on', async ({ page }) => {
    await guess(page, 'stone');
    const marks = await row(page, 0).evaluateAll(els => els.map(e => e.dataset.mark));
    expect(marks).toHaveLength(5);
    for (const m of marks) expect(['right', 'near', 'wrong']).toContain(m);
    // The keyboard remembers what each letter did.
    await expect(page.locator('.key[data-ch="s"]')).toHaveAttribute('data-mark', /right|near|wrong/);
  });
});

test.describe('layout', () => {
  test('the board never covers the controls above it', async ({ page }) => {
    /*
     * Six rows of board and three of keyboard do not both fit in the height
     * of a landscape phone. Before the reflow the board simply overflowed
     * its stage, sat on top of the length buttons and ate their taps — so
     * this checks the buttons are actually usable, not just that the pixels
     * look right.
     */
    for (const size of [{ w: 320, h: 568 }, { w: 390, h: 720 }, { w: 740, h: 360 }]) {
      await page.setViewportSize({ width: size.w, height: size.h });
      for (const n of [4, 5, 6]) {
        await pickLength(page, n);
        const at = `${n} letters at ${size.w}x${size.h}`;
        const m = await page.evaluate(() => {
          const box = sel => {
            const r = document.querySelector(sel).getBoundingClientRect();
            return { top: r.top, right: r.right, bottom: r.bottom, left: r.left,
              width: r.width, height: r.height };
          };
          return {
            board: box('#board'), lengths: box('.lengths'),
            stage: box('.stage'), keys: box('.keys'),
          };
        });
        /*
         * Overlap, not "is it below" — in landscape the keyboard moves
         * beside the board rather than under it, and an axis-specific test
         * would either fail on a correct layout or pass on a broken one.
         */
        const hits = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5
          && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        expect(hits(m.board, m.lengths), 'board over the length row, ' + at).toBe(false);
        expect(hits(m.board, m.keys), 'board over the keyboard, ' + at).toBe(false);
        expect(m.board.height, 'board taller than its stage, ' + at)
          .toBeLessThanOrEqual(m.stage.height + 0.5);
      }
      // Square cells, whatever the fit.
      const cell = await page.locator('.box').first().boundingBox();
      expect(Math.abs(cell.width - cell.height),
        'cells not square at ' + size.w + 'x' + size.h).toBeLessThan(1.5);
    }
  });

  test('a long sheet opens at its own heading', async ({ page }) => {
    // js/lib/modal.js focuses the first control in the panel, which on a
    // small phone is the Close button at the bottom of the rules — that
    // used to scroll the sheet past its title before anyone could read it.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toHaveAttribute('data-open', /.*/);
    const scrolled = await page.evaluate(() =>
      document.querySelector('#rules .modal-panel').scrollTop);
    expect(scrolled).toBe(0);
    await expect(page.locator('#rules-title')).toBeInViewport();
  });
});

test.describe('the clock', () => {
  test('does not start until the first letter', async ({ page }) => {
    await expect(clock(page)).toHaveText('0:00');
    await page.waitForTimeout(1300);
    await expect(clock(page)).toHaveText('0:00');
    await type(page, 's');
    await expect(clock(page)).not.toHaveText('0:00', { timeout: 3000 });
  });

  test('starts again from zero on a new word', async ({ page }) => {
    await type(page, 'st');
    await expect(clock(page)).not.toHaveText('0:00', { timeout: 3000 });
    await page.locator('#new-btn').click();
    await expect(clock(page)).toHaveText('0:00');
  });
});

test.describe('words the page does not carry', () => {
  test('an unknown word is refused and costs no try', async ({ page }) => {
    await unserve(page);
    await dictionary(page, { known: [] });
    await guess(page, 'zjqxw');
    await expect(flash(page)).toHaveText('Not a word: zjqxw');
    await expect(row(page, 0).nth(0)).not.toHaveAttribute('data-mark', /.*/);
  });

  test('one the dictionary vouches for is played', async ({ page }) => {
    await unserve(page);
    await dictionary(page, { known: ['zjqxw'] });
    await guess(page, 'zjqxw');
    await expect(row(page, 0).nth(0)).toHaveAttribute('data-mark', /right|near|wrong/);
  });

  test('a question that went unanswered costs nothing and clears the word', async ({ page }) => {
    await unserve(page);
    await dictionary(page, { abort: true });
    await guess(page, 'zjqxw');
    // 'off' is not a no — see the shared dictionary's notes.
    await expect(flash(page)).toContainText('Could not check ZJQXW');
    await expect(row(page, 0).nth(0)).not.toHaveAttribute('data-mark', /.*/);
    // The letters go, so the next guess starts from an empty row rather
    // than one Enter away from the same wait.
    await expect(row(page, 0).nth(0)).toHaveText('');
    // And the game is still a game.
    await guess(page, 'stone');
    await expect(row(page, 0).nth(0)).toHaveAttribute('data-mark', /right|near|wrong/);
  });

  test('a request that never answers does not lock the game', async ({ page }) => {
    /*
     * The bug this exists for: fetch has no timeout, so a request that hung
     * left `checking` true for ever — no letters, no delete, no Enter, and a
     * clock that had stopped. A guess of "rater" did it on the live site.
     * The deadline lives in js/lib/dictionary.js; this checks the game comes
     * back from it.
     */
    await unserve(page);
    // The control word still answers: a source that fails its probe is set
    // aside, and this test is about a service that accepts the question and
    // never answers it.
    for (const api of APIS) {
      await page.route(api, route => {
        if (decodeURIComponent(route.request().url().split('/').pop()) === PROBE) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
        }
        /* never answered */
      });
    }

    await type(page, 'zjqxw');
    await expect(clock(page)).not.toHaveText('0:00', { timeout: 3000 });
    await page.keyboard.press('Enter');
    await expect(flash(page)).toContainText('Checking ZJQXW');

    await expect(flash(page)).toContainText('Could not check', { timeout: 15000 });
    await expect(row(page, 0).nth(0)).toHaveText('', { timeout: 3000 });
    await expect(row(page, 0).nth(0)).not.toHaveAttribute('data-mark', /.*/);

    await unserve(page);
    await dictionary(page);
    await guess(page, 'stone');
    await expect(row(page, 0).nth(0)).toHaveAttribute('data-mark', /right|near|wrong/);
  });

  test('the clock is held while a word is checked, and runs again after', async ({ page }) => {
    // This is a race, so a wait on someone else's server is not the
    // player's time. Held rather than paused-and-forgotten: every path out
    // of the lookup has to start it again.
    await unserve(page);
    let answer = null;
    for (const api of APIS) {
      await page.route(api, route => {
        if (decodeURIComponent(route.request().url().split('/').pop()) === PROBE) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
        }
        answer = route;
      });
    }

    await type(page, 'zjqxw');
    await expect(clock(page)).not.toHaveText('0:00', { timeout: 3000 });
    await page.keyboard.press('Enter');
    await expect(clock(page)).toHaveAttribute('data-held', /.*/);

    const stopped = await clock(page).textContent();
    await page.waitForTimeout(2400);
    expect(await clock(page).textContent(), 'the clock moved while held').toBe(stopped);

    await expect.poll(() => Boolean(answer)).toBe(true);
    await answer.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    await expect(clock(page)).not.toHaveAttribute('data-held', /.*/);
    await expect(clock(page)).not.toHaveText(stopped, { timeout: 4000 });
  });

  test('a new word during a lookup discards the answer', async ({ page }) => {
    await unserve(page);
    let answer = null;
    for (const api of APIS) {
      await page.route(api, route => {
        if (decodeURIComponent(route.request().url().split('/').pop()) === PROBE) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
        }
        answer = route;
      });
    }

    await guess(page, 'zjqxw');
    await expect(flash(page)).toContainText('Checking');
    await page.locator('#new-btn').click();
    await expect(clock(page)).toHaveText('0:00');

    // The late 'yes' belongs to a game that no longer exists; it must not
    // land a row on this one.
    await expect.poll(() => Boolean(answer)).toBe(true);
    await answer.fulfill({ status: 200, contentType: 'application/json', body: '[{}]' });
    await page.waitForTimeout(600);
    await expect(row(page, 0).nth(0)).not.toHaveAttribute('data-mark', /.*/);
    await expect(row(page, 0).nth(0)).toHaveText('');
    // Still playable, and the clock is its own again.
    await guess(page, 'stone');
    await expect(row(page, 0).nth(0)).toHaveAttribute('data-mark', /right|near|wrong/);
  });

  test('a word on the page is never asked about', async ({ page }) => {
    const external = trackExternalRequests(page);
    await guess(page, 'stone');
    await expect(row(page, 0).nth(0)).toHaveAttribute('data-mark', /right|near|wrong/);
    // The load probe asks about its control word and nothing else; a word
    // the page carries must never leave the device.
    expect(external.filter(url => !url.endsWith('/' + PROBE))).toEqual([]);
  });
});

test.describe('finishing', () => {
  test('solving opens the sheet with the sums', async ({ page }) => {
    // Solve by exhausting the answer list against the board: type a word,
    // read the marks, and stop when they are all green.
    const solved = await page.evaluate(() => {
      const board = document.getElementById('board');
      const keys = ch => document.querySelector('.key[data-ch="' + ch + '"]');
      const enter = () => [...document.querySelectorAll('.key.wide')][0].click();
      const del = () => [...document.querySelectorAll('.key.wide')][1].click();
      const answers = [];
      // The answer is one of the 5-letter answer words.
      for (let i = 0; i < 3000; i++) {
        const w = window.SprintWords.answer(5);
        if (answers.indexOf(w) === -1) answers.push(w);
      }
      for (const word of answers) {
        for (const ch of word) keys(ch).click();
        enter();
        const marks = [...board.querySelectorAll('.row')]
          .map(r => [...r.querySelectorAll('.box')].map(b => b.dataset.mark));
        const hit = marks.find(m => m.every(x => x === 'right'));
        if (hit) return word;
        // Not it: the row was used, so if the board is full we are done.
        if (document.body.querySelector('#over[data-open]')) return null;
      }
      return null;
    });
    // Either it was solved, or six tries ran out — both open the sheet.
    await expect(page.locator('#over')).toHaveAttribute('data-open', /.*/);
    await expect(page.locator('#over-word')).not.toHaveText('');
    if (solved) {
      await expect(page.locator('#over-title')).toHaveText('Solved');
      await expect(page.locator('#sums .final')).toContainText(':');
    } else {
      await expect(page.locator('#over-title')).toHaveText('Out of tries');
      await expect(page.locator('#sums .final')).toContainText('—');
    }
  });

  test('the bonus is ten seconds a try, and the total cannot go below zero', async ({ page }) => {
    const sums = await page.evaluate(() => {
      const TRIES = 6, BONUS = 10000;
      const reckon = (raw, used) => {
        const spare = Math.max(0, TRIES - used);
        return { spare: spare, final: Math.max(0, raw - spare * BONUS) };
      };
      return {
        three: reckon(90000, 3),
        six: reckon(90000, 6),
        fast: reckon(4000, 2),
      };
    });
    expect(sums.three.spare).toBe(3);
    expect(sums.three.final).toBe(60000);
    expect(sums.six.spare).toBe(0);
    expect(sums.six.final).toBe(90000);
    // Four seconds with four tries spare is worth forty seconds off; the
    // clamp is what stops a leaderboard of negative times.
    expect(sums.fast.final).toBe(0);
  });
});

test.describe('the leaderboard', () => {
  test('is empty until something is solved, and split by length', async ({ page }) => {
    await page.locator('#board-btn').click();
    await expect(page.locator('#board-body .score-empty')).toBeVisible();
    await expect(page.locator('#board-head button')).toHaveCount(3);

    await page.locator('#board-head button[data-length="4"]').click();
    await expect(page.locator('#board-body .score-empty')).toContainText('4 letters');
  });

  test('a solved word is kept under its own length', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
      length: 5,
      scores: { 5: [{ ms: 12000, raw: 42000, tries: 3, word: 'stone', at: 1 }] },
    })), KEY);
    await page.reload();
    await page.locator('#board-btn').click();

    await expect(page.locator('#board-body .score-list li')).toHaveCount(1);
    await expect(page.locator('#board-body .score-list li')).toContainText('0:12');
    // Both numbers are shown: what it counted for, and what the clock said.
    await expect(page.locator('#board-body .detail')).toContainText('0:42');
    await expect(page.locator('#board-body .detail')).toContainText('-30s');

    await page.locator('#board-head button[data-length="6"]').click();
    await expect(page.locator('#board-body .score-empty')).toBeVisible();
  });

  test('a nonsense score is not restored', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
      length: 5,
      scores: { 5: [{ ms: 'soon', tries: 3 }, { ms: 900, tries: 99 }] },
    })), KEY);
    await page.reload();
    await page.locator('#board-btn').click();
    await expect(page.locator('#board-body .score-empty')).toBeVisible();
  });

  test('corrupt saved state falls back to a playable board', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, 'not json'), KEY);
    await page.reload();
    await expect(page.locator('.row')).toHaveCount(6);
    await guess(page, 'stone');
    await expect(row(page, 0).nth(0)).toHaveAttribute('data-mark', /right|near|wrong/);
  });
});

test.describe('the words', () => {
  test('every answer is a word the game will accept', async ({ page }) => {
    const bad = await page.evaluate(() => {
      const out = [];
      for (const n of window.SprintWords.LENGTHS) {
        for (let i = 0; i < 600; i++) {
          const w = window.SprintWords.answer(n);
          if (w.length !== n) out.push(n + ':' + w + ' wrong length');
          if (!window.SprintWords.has(w)) out.push(n + ':' + w + ' not guessable');
        }
      }
      return out.slice(0, 5);
    });
    expect(bad).toEqual([]);
  });

  test('the lists are wide enough to play with', async ({ page }) => {
    const counts = await page.evaluate(() => window.SprintWords.counts());
    for (const n of [4, 5, 6]) {
      expect(counts[n].answers).toBeGreaterThan(300);
      expect(counts[n].guesses).toBeGreaterThan(2000);
    }
  });
});
