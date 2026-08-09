const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/golf/';
const KEY = 'games.golf.v1';

const square = (page, p, h) => page.locator(`.score[data-p="${p}"][data-h="${h}"]`);
const total = (page, p) => page.locator(`tfoot td[data-p="${p}"] .grand-total`);
const vs = (page, p) => page.locator(`tfoot td[data-p="${p}"] .grand-vs`);
const sub = (page, which, p) => page.locator(`tr[data-sub="${which}"] td[data-p="${p}"]`);

/** Taps a square and picks a number off the pad. */
async function score(page, p, h, n) {
  await square(page, p, h).click();
  await page.locator(`#pad button[data-n="${n}"]`).click();
}

async function openSettings(page) {
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings')).toHaveAttribute('data-open', /.*/);
}

async function closeSettings(page) {
  await page.locator('#settings .modal-close').click();
  await expect(page.locator('#settings')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('entering a score', () => {
  test('a square opens a pad of one to nine', async ({ page }) => {
    await expect(page.locator('#picker')).not.toHaveAttribute('data-open', /.*/);
    await square(page, 0, 0).click();
    await expect(page.locator('#picker')).toHaveAttribute('data-open', /.*/);

    const keys = await page.locator('#pad button').evaluateAll(els =>
      els.map(e => e.textContent));
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    await expect(page.locator('#picker-title')).toHaveText('Hole 1 · Player 1');
  });

  test('picking a number fills the square and closes the pad', async ({ page }) => {
    await score(page, 0, 0, 4);
    await expect(page.locator('#picker')).toBeHidden();
    await expect(square(page, 0, 0)).toHaveText('4');
    await expect(square(page, 0, 0)).toHaveAttribute('data-set', '');
  });

  test('clear empties a square again', async ({ page }) => {
    await score(page, 0, 2, 6);
    await expect(square(page, 0, 2)).toHaveText('6');

    await square(page, 0, 2).click();
    await page.locator('#pad-clear').click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(square(page, 0, 2)).toHaveText('');
    await expect(square(page, 0, 2)).not.toHaveAttribute('data-set', '');
  });

  test('each square is its own player and hole', async ({ page }) => {
    await score(page, 0, 0, 3);
    await score(page, 1, 0, 5);
    await expect(square(page, 0, 0)).toHaveText('3');
    await expect(square(page, 1, 0)).toHaveText('5');
    await expect(square(page, 0, 1)).toHaveText('');
  });
});

test.describe('the totals', () => {
  test('the total runs as you go', async ({ page }) => {
    await expect(total(page, 0)).toHaveText('–');
    await score(page, 0, 0, 4);
    await expect(total(page, 0)).toHaveText('4');
    await score(page, 0, 1, 5);
    await expect(total(page, 0)).toHaveText('9');
    await score(page, 0, 1, 3);
    await expect(total(page, 0)).toHaveText('7');
  });

  test('Out and In subtotal at nine and eighteen', async ({ page }) => {
    for (let h = 0; h < 9; h++) await score(page, 0, h, 3);
    for (let h = 9; h < 18; h++) await score(page, 0, h, 4);

    await expect(sub(page, 'out', 0)).toHaveText('27');
    await expect(sub(page, 'in', 0)).toHaveText('36');
    await expect(total(page, 0)).toHaveText('63');
  });

  test('a nine-hole round has an Out and no In', async ({ page }) => {
    await openSettings(page);
    await page.locator('#holes-row .pick[data-holes="9"]').click();
    await closeSettings(page);

    await expect(page.locator('.score[data-p="0"]')).toHaveCount(9);
    await expect(page.locator('tr[data-sub="out"]')).toHaveCount(1);
    await expect(page.locator('tr[data-sub="in"]')).toHaveCount(0);
  });

  test('the lowest total is marked, and an empty card is not', async ({ page }) => {
    await score(page, 0, 0, 5);
    await score(page, 1, 0, 3);
    await expect(page.locator('tfoot td[data-lead]')).toHaveCount(1);
    await expect(page.locator('tfoot td[data-p="1"]')).toHaveAttribute('data-lead', '');

    // A tie marks both; a player who has not started is not in the running.
    await score(page, 0, 1, 3);
    await score(page, 1, 1, 5);
    await expect(page.locator('tfoot td[data-lead]')).toHaveCount(2);
  });
});

test.describe('par', () => {
  test('the pad opens above the settings sheet, not behind it', async ({ page }) => {
    // Both dialogs share css/modal.css's z-index and settings comes later in
    // the DOM, so the pad has to be lifted explicitly or it is unreachable.
    await openSettings(page);
    await page.locator('#par-row .pick[data-par="on"]').click();
    await page.locator('.par-hole[data-hole="0"]').click();

    const layers = await page.evaluate(() => ({
      pad: Number(getComputedStyle(document.getElementById('picker')).zIndex),
      sheet: Number(getComputedStyle(document.getElementById('settings')).zIndex),
    }));
    expect(layers.pad).toBeGreaterThan(layers.sheet);
    // Reachable, not merely on top.
    await page.locator('#pad button[data-n="3"]').click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#settings')).toHaveAttribute('data-open', /.*/);
  });

  test('escape closes the pad and leaves the sheet open', async ({ page }) => {
    await openSettings(page);
    await page.locator('#par-row .pick[data-par="on"]').click();
    await page.locator('.par-hole[data-hole="0"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#settings')).toHaveAttribute('data-open', /.*/);
  });

  test('is off until it is turned on', async ({ page }) => {
    await expect(page.locator('.col-par').first()).toBeHidden();
    await openSettings(page);
    await expect(page.locator('#par-editor')).toBeHidden();
    await page.locator('#par-row .pick[data-par="on"]').click();
    await expect(page.locator('#par-editor')).toBeVisible();
    await closeSettings(page);
    await expect(page.locator('.col-par').first()).toBeVisible();
  });

  test('every hole can be set at once, and one at a time', async ({ page }) => {
    await openSettings(page);
    await page.locator('#par-row .pick[data-par="on"]').click();

    await page.locator('#par-all').click();
    await page.locator('#pad button[data-n="3"]').click();
    const pars = await page.locator('.par-hole .par-val').evaluateAll(els =>
      els.map(e => e.textContent));
    expect(pars).toEqual(new Array(18).fill('3'));

    // One hole, on its own, off the same pad.
    await page.locator('.par-hole[data-hole="4"]').click();
    await expect(page.locator('#picker-title')).toHaveText('Par for hole 5');
    await page.locator('#pad button[data-n="5"]').click();
    await closeSettings(page);

    const shown = await page.locator('tbody tr td.col-par').evaluateAll(els =>
      els.map(e => e.textContent));
    expect(shown[4]).toBe('5');
    expect(shown[0]).toBe('3');
  });

  test('a score is marked against the hole par', async ({ page }) => {
    await openSettings(page);
    await page.locator('#par-row .pick[data-par="on"]').click();
    await page.locator('#par-all').click();
    await page.locator('#pad button[data-n="3"]').click();
    await closeSettings(page);

    await score(page, 0, 0, 2);
    await score(page, 0, 1, 3);
    await score(page, 0, 2, 5);
    await score(page, 0, 3, 1);

    await expect(square(page, 0, 0)).toHaveAttribute('data-vs', 'under');
    await expect(square(page, 0, 1)).not.toHaveAttribute('data-vs', /.*/);
    await expect(square(page, 0, 2)).toHaveAttribute('data-vs', 'over');
    await expect(square(page, 0, 3)).toHaveAttribute('data-vs', 'ace');

    // Under par keeps a ring so the marking is never colour alone; a
    // percentage anywhere in a box-shadow would void the whole declaration.
    const ring = await square(page, 0, 0).evaluate(el =>
      getComputedStyle(el).boxShadow);
    expect(ring).not.toBe('none');
  });

  test('the total counts par only for holes played', async ({ page }) => {
    await openSettings(page);
    await page.locator('#par-row .pick[data-par="on"]').click();
    await page.locator('#par-all').click();
    await page.locator('#pad button[data-n="3"]').click();
    await closeSettings(page);

    await score(page, 0, 0, 4);
    await expect(vs(page, 0)).toHaveText('+1');
    await score(page, 0, 1, 2);
    await expect(vs(page, 0)).toHaveText('E');
    await score(page, 0, 2, 2);
    await expect(vs(page, 0)).toHaveText('-1');
  });
});

test.describe('players', () => {
  test('the count runs from one to twelve', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('#count-row .count')).toHaveCount(12);
    await page.locator('#count-row .count[data-count="5"]').click();
    await closeSettings(page);
    await expect(page.locator('thead th').filter({ hasText: /Player|\w/ })).not.toHaveCount(0);
    await expect(page.locator('tfoot td[data-p]')).toHaveCount(5);
  });

  test('typed names appear on the card and are remembered', async ({ page }) => {
    await openSettings(page);
    const first = page.locator('#name-inputs .name-input').first();
    await first.fill('Ari');
    await first.blur();
    await closeSettings(page);

    await expect(page.locator('thead .player-name').first()).toHaveText('Ari');
    // The recent list is the one deliberate cross-game key. See _README.md.
    const remembered = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('games.party-names.v1')).recent);
    expect(remembered).toContain('Ari');
  });

  test('picking a remembered name seats them', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.party-names.v1',
      JSON.stringify({ recent: ['Bex', 'Cass'] })));
    await page.reload();

    await openSettings(page);
    await page.locator('#name-mode-row .pick[data-name-mode="pick"]').click();
    await page.locator('.recent[data-name="Bex"]').click();
    await expect(page.locator('.recent[data-name="Bex"]')).toHaveAttribute('aria-pressed', 'true');
    await closeSettings(page);
    await expect(page.locator('thead .player-name').first()).toHaveText('Bex');
  });

  test('dropping a player keeps the others scores', async ({ page }) => {
    await score(page, 0, 0, 4);
    await score(page, 1, 0, 6);
    await openSettings(page);
    await page.locator('#count-row .count[data-count="1"]').click();
    await closeSettings(page);

    await expect(page.locator('tfoot td[data-p]')).toHaveCount(1);
    await expect(square(page, 0, 0)).toHaveText('4');
  });
});

test.describe('the card', () => {
  test('new round clears the scores but only when asked twice', async ({ page }) => {
    await score(page, 0, 0, 4);
    await page.locator('#new-btn').click();
    await expect(page.locator('#new-btn')).toHaveText('Clear all?');
    await expect(square(page, 0, 0)).toHaveText('4');

    await page.locator('#new-btn').click();
    await expect(square(page, 0, 0)).toHaveText('');
    await expect(total(page, 0)).toHaveText('–');
    await expect(page.locator('#new-btn')).toHaveText('New round');
  });

  test('new round keeps the players and the course', async ({ page }) => {
    await openSettings(page);
    await page.locator('#par-row .pick[data-par="on"]').click();
    await page.locator('#par-all').click();
    await page.locator('#pad button[data-n="4"]').click();
    const first = page.locator('#name-inputs .name-input').first();
    await first.fill('Ari');
    await closeSettings(page);
    await score(page, 0, 0, 5);

    await page.locator('#new-btn').click();
    await page.locator('#new-btn').click();

    await expect(page.locator('thead .player-name').first()).toHaveText('Ari');
    await expect(page.locator('tbody tr td.col-par').first()).toHaveText('4');
    await expect(square(page, 0, 0)).toHaveText('');
  });

  test('the card survives a reload under its own key', async ({ page }) => {
    await score(page, 0, 0, 4);
    await score(page, 1, 3, 7);
    await page.reload();

    await expect(square(page, 0, 0)).toHaveText('4');
    await expect(square(page, 1, 3)).toHaveText('7');
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.scores[0][0]).toBe(4);
    expect(saved.holes).toBe(18);
  });

  test('corrupt saved state falls back to a usable card', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, 'not json'), KEY);
    await page.reload();
    await expect(page.locator('.score')).not.toHaveCount(0);
    await score(page, 0, 0, 3);
    await expect(total(page, 0)).toHaveText('3');
  });

  test('a score outside one to nine is not restored', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
      holes: 18, players: ['A'], usePar: false,
      pars: [], scores: [[0, 44, -2, 'x', 5]], nameMode: 'type',
    })), KEY);
    await page.reload();
    await expect(square(page, 0, 1)).toHaveText('');
    await expect(square(page, 0, 4)).toHaveText('5');
    await expect(total(page, 0)).toHaveText('5');
  });

  test('nothing leaves the origin', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await score(page, 0, 0, 4);
    expect(external).toEqual([]);
  });
});
