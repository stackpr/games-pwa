// Two-team scorekeeper. State persists in localStorage so scores survive
// reloads, offline use, and app restarts.
(function () {
  const STORAGE_KEY = 'games.scorekeeper.v1';
  const MAX_HISTORY = 200;

  const el = {
    scoreA: document.getElementById('score-a'),
    scoreB: document.getElementById('score-b'),
    nameA: document.getElementById('name-a'),
    nameB: document.getElementById('name-b'),
    tapA: document.getElementById('tap-a'),
    tapB: document.getElementById('tap-b'),
    minusA: document.getElementById('minus-a'),
    minusB: document.getElementById('minus-b'),
    undo: document.getElementById('undo'),
    reset: document.getElementById('reset')
  };

  let state = load();
  // history holds [scoreA, scoreB] snapshots for Undo
  let history = [];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          a: Number.isInteger(parsed.a) ? parsed.a : 0,
          b: Number.isInteger(parsed.b) ? parsed.b : 0,
          nameA: typeof parsed.nameA === 'string' ? parsed.nameA : 'Team 1',
          nameB: typeof parsed.nameB === 'string' ? parsed.nameB : 'Team 2'
        };
      }
    } catch (err) {
      console.warn('Could not load saved scores:', err);
    }
    return { a: 0, b: 0, nameA: 'Team 1', nameB: 'Team 2' };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not save scores:', err);
    }
  }

  function render() {
    el.scoreA.textContent = state.a;
    el.scoreB.textContent = state.b;
    el.undo.disabled = history.length === 0;
  }

  function pushHistory() {
    history.push([state.a, state.b]);
    if (history.length > MAX_HISTORY) history.shift();
  }

  function bump(team, delta) {
    pushHistory();
    state[team] = Math.max(0, state[team] + delta);
    save();
    render();
  }

  el.tapA.addEventListener('click', () => bump('a', +1));
  el.tapB.addEventListener('click', () => bump('b', +1));
  el.minusA.addEventListener('click', () => bump('a', -1));
  el.minusB.addEventListener('click', () => bump('b', -1));

  el.undo.addEventListener('click', () => {
    const prev = history.pop();
    if (!prev) return;
    [state.a, state.b] = prev;
    save();
    render();
  });

  el.reset.addEventListener('click', () => {
    if (state.a === 0 && state.b === 0) return;
    if (!confirm('Reset both scores to 0?')) return;
    pushHistory();
    state.a = 0;
    state.b = 0;
    save();
    render();
  });

  el.nameA.addEventListener('input', () => { state.nameA = el.nameA.value; save(); });
  el.nameB.addEventListener('input', () => { state.nameB = el.nameB.value; save(); });

  el.nameA.value = state.nameA;
  el.nameB.value = state.nameB;
  render();
})();
