/*
 * Publishes the usable viewport height as --measured-height, and re-measures
 * it on every event that can change it — including once a second after load.
 *
 * Why: an installed PWA on Android sometimes lays the page out against a
 * viewport taller than the space the system navigation bar actually leaves,
 * so the bottom row of a full-height page sits under the home/back/recents
 * buttons. Rotating the phone and rotating back fixes it, which is the whole
 * clue: the height is stale, not wrong. A late re-measure is what the
 * rotation was really doing.
 *
 * Pages do not use this value raw. Each declares
 *
 *   --app-height: min(var(--measured-height, 100dvh), 100dvh);
 *
 * so the measurement can only ever make the page *shorter*. That is the
 * direction the bug runs in, and the cap is what keeps a stale reading —
 * this script always trails a resize by a frame — from being able to push
 * the page off the bottom of the window instead. See CLAUDE.md.
 */
window.Viewport = (function () {
  // window.innerHeight, not visualViewport.height: the latter shrinks for the
  // on-screen keyboard and for pinch-zoom, neither of which should resize a
  // game board.
  function measure() {
    return window.innerHeight;
  }

  function apply() {
    const h = measure();
    if (h > 0) {
      document.documentElement.style.setProperty('--measured-height', h + 'px');
    }
  }

  // The one-second beat is the fix for the Android case: the first few
  // measurements can all be the stale one, and the system bars have settled
  // well before a second is out.
  const BEATS = [0, 250, 1000];

  function start() {
    for (const ms of BEATS) {
      if (ms === 0) apply();
      else setTimeout(apply, ms);
    }
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', () => {
      apply();
      // Android reports the resize before the bars have finished moving.
      setTimeout(apply, 300);
    });
    // Coming back from the app switcher is the other way the height goes
    // stale, and it fires pageshow rather than resize.
    window.addEventListener('pageshow', apply);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) apply();
    });
  }

  start();

  return { apply, measure };
})();
