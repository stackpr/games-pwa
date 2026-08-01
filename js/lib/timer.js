/*
 * Round countdown, shared by the three word games.
 *
 *   const t = Timer.create(el, { seconds: 60, onEnd, onTick });
 *   t.start(); t.stop(); t.reset();
 *
 * Ticks on a 200ms interval rather than 1000ms, and derives the remaining
 * time from a start timestamp rather than counting down a variable. A phone
 * throttles timers in a backgrounded tab, and a decrementing counter comes
 * back wrong by however long the screen was off; a timestamp comes back
 * right, which for a game played against a clock is the whole point.
 *
 * `el` shows mm:ss and carries data-low under ten seconds for the CSS to
 * hang off. Every lookup is null-tolerant: a service worker can serve one
 * release's markup with the next release's script. See CLAUDE.md.
 */
window.Timer = (function () {
  const TICK_MS = 200;
  const LOW_MS = 10000;

  function format(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function create(el, opts) {
    const options = opts || {};
    const seconds = Number(options.seconds) > 0 ? Number(options.seconds) : 60;
    let endsAt = 0;
    let handle = 0;
    let running = false;

    function remaining() {
      if (!running) return seconds * 1000;
      return Math.max(0, endsAt - Date.now());
    }

    function paint() {
      const left = remaining();
      if (el) {
        el.textContent = format(left);
        if (left <= LOW_MS && running) el.dataset.low = '';
        else delete el.dataset.low;
      }
      return left;
    }

    function tick() {
      const left = paint();
      if (options.onTick) options.onTick(left);
      if (left <= 0) {
        stop();
        if (options.onEnd) options.onEnd();
      }
    }

    function start() {
      stop();
      endsAt = Date.now() + seconds * 1000;
      running = true;
      paint();
      handle = setInterval(tick, TICK_MS);
    }

    function stop() {
      if (handle) clearInterval(handle);
      handle = 0;
      running = false;
    }

    function reset() {
      stop();
      paint();
    }

    return { start, stop, reset, remaining, isRunning: () => running, seconds };
  }

  return { create, format };
})();
