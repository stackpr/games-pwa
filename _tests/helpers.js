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

module.exports = {
  freshPage,
  clearState,
  serviceWorkerReady,
  trackExternalRequests,
  trackErrors,
};
