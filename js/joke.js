/*
 * A dad joke above the game list, fetched from icanhazdadjoke.com.
 *
 * This is the site's second deliberate exception to "no external network
 * dependencies", and the first one on the app shell itself — so the rule it
 * has to keep is stricter than Spelling's: the home page must load, render
 * its list and install itself with this host unreachable, and must do it
 * without a single console error. Everything below is in service of that.
 * See the network-dependency notes in CLAUDE.md.
 */
(function () {
  const KEY = 'games.joke.v1';
  const API = 'https://icanhazdadjoke.com/';
  const TIMEOUT = 6000;

  const box = document.getElementById('joke');
  const text = document.getElementById('joke-text');
  const button = document.getElementById('joke-refresh');
  if (!box || !text) return;

  let busy = false;

  function show(joke) {
    text.textContent = joke;
    box.hidden = false;
  }

  function remember(joke) {
    if (window.Store) Store.save(KEY, { joke: joke });
  }

  function remembered() {
    const saved = window.Store ? Store.load(KEY) : null;
    return saved && typeof saved.joke === 'string' && saved.joke ? saved.joke : null;
  }

  /*
   * Returns the joke, or null for any failure at all — offline, blocked,
   * rate-limited, garbled. The caller keeps whatever was on screen, so a
   * failure is silent by design: a joke nobody asked for is not worth an
   * error message above the games.
   */
  function pull() {
    // Asked before the request rather than caught after it, so being offline
    // costs no failed fetch and logs no console error. The offline tests
    // assert exactly that.
    if (navigator.onLine === false) return Promise.resolve(null);

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT) : null;

    return fetch(API, {
      // A CORS-safelisted header, so this stays a simple request with no
      // preflight. The API returns HTML without it.
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const joke = data && typeof data.joke === 'string' ? data.joke.trim() : '';
        return joke || null;
      })
      .catch(() => null)
      .then(joke => {
        if (timer) clearTimeout(timer);
        return joke;
      });
  }

  function refresh() {
    if (busy) return Promise.resolve();
    busy = true;
    box.dataset.loading = '';
    if (button) button.disabled = true;
    return pull().then(joke => {
      busy = false;
      delete box.dataset.loading;
      if (button) button.disabled = false;
      if (!joke) return;
      show(joke);
      remember(joke);
    });
  }

  // The last joke goes up first so there is something to read offline and no
  // reflow when the new one lands. With nothing saved the block stays hidden
  // until a joke arrives, rather than reserving space it may never fill.
  const last = remembered();
  if (last) show(last);
  refresh();

  if (button) button.addEventListener('click', refresh);

  // Coming back from a game with the back button can restore the page from
  // the bfcache, which re-shows the list without re-running any of this — so
  // "a joke every time the list appears" needs this beat too.
  window.addEventListener('pageshow', event => {
    if (event.persisted) refresh();
  });
})();
