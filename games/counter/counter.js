// Counter: one number, up and down. See _README.md.
(function () {
  const STORAGE_KEY = 'games.counter.v1';

  const el = {
    value: document.getElementById('value'),
    up: document.getElementById('up'),
    down: document.getElementById('down'),
    reset: document.getElementById('reset')
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { count: Number.isInteger(parsed.count) ? parsed.count : 0 };
      }
    } catch (err) {
      console.warn('Could not load saved count:', err);
    }
    return { count: 0 };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not save count:', err);
    }
  }

  function render() {
    el.value.textContent = state.count;
  }

  function bump(delta) {
    state.count += delta;
    save();
    render();
  }

  el.up.addEventListener('click', () => bump(+1));
  el.down.addEventListener('click', () => bump(-1));

  el.reset.addEventListener('click', () => {
    if (state.count === 0) return;
    state.count = 0;
    save();
    render();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp') { bump(+1); event.preventDefault(); }
    else if (event.key === 'ArrowDown') { bump(-1); event.preventDefault(); }
  });

  render();
})();
