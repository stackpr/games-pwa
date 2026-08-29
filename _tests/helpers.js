// Shared helpers for the games-pwa specs.

/**
 * Loads a page with a clean slate: no saved game state, no service worker
 * left over from a previous spec. Use at the start of a test that cares
 * about first-run behaviour.
 */
async function freshPage(page, path = '/') {
  await page.goto(path);
  await page.evaluate(async () => {
    localStorage.clear();
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  });
  await page.reload();
}

/** Clears saved state only, keeping any registered service worker. */
async function clearState(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

/**
 * Waits for the service worker to control the page and finish precaching,
 * so an offline assertion afterwards is testing the cache, not a race.
 */
async function serviceWorkerReady(page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
      );
    }
    return reg.active && reg.active.state;
  });
  // Give addAll() a beat to settle before the network is cut.
  await page.waitForTimeout(500);
}

/**
 * Records every request that leaves the origin under test. The project
 * forbids external network dependencies, so this should stay empty.
 */
function trackExternalRequests(page, origin = 'http://127.0.0.1:8080') {
  const external = [];
  page.on('request', req => {
    if (!req.url().startsWith(origin) && !req.url().startsWith('data:')) {
      external.push(req.url());
    }
  });
  return external;
}

/** Collects console errors and uncaught exceptions for an end-of-test check. */
function trackErrors(page) {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  return errors;
}

/**
 * A reply shaped the way the real service at `url` shapes one.
 *
 * The two dictionaries do not answer alike, and a mock that pretends they do
 * tests a shape that does not exist. api.dictionaryapi.dev says no with a
 * 404; freedictionaryapi.com answers 200 to everything and says no with an
 * empty `entries` array. Getting that wrong in the library is how `bigie`
 * was accepted as a word, so the mocks carry the difference too.
 */
function dictionaryAnswer(url, found) {
  if (url.includes('freedictionaryapi.com')) {
    return {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        word: url.split('/').pop(),
        entries: found ? [{ language: { code: 'en' }, partOfSpeech: 'noun' }] : [],
        source: { url: 'https://en.wiktionary.org' }
      })
    };
  }
  return found
    ? { status: 200, contentType: 'application/json', body: '[{"word":"x"}]' }
    : { status: 404, contentType: 'application/json', body: '{"title":"No Definitions Found"}' };
}

module.exports = {
  dictionaryAnswer,
  freshPage,
  clearState,
  serviceWorkerReady,
  trackExternalRequests,
  trackErrors,
};
