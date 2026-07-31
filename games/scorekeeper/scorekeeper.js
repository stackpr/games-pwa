// Two-team scorekeeper. See _README.md for behaviour and rationale.
(function () {
  const STORAGE_KEY = 'games.scorekeeper.v1';
  const MAX_HISTORY = 200;
  const GROUP_MS = 1000;

  const el = {
    scoreA: document.getElementById('score-a'),
    scoreB: document.getElementById('score-b'),
    histA: document.getElementById('hist-a'),
    histB: document.getElementById('hist-b'),
    nameA: document.getElementById('name-a'),
    nameB: document.getElementById('name-b'),
    tapA: document.getElementById('tap-a'),
    tapB: document.getElementById('tap-b'),
    minusA: document.getElementById('minus-a'),
    minusB: document.getElementById('minus-b'),
    plus5A: document.getElementById('plus5-a'),
    plus5B: document.getElementById('plus5-b'),
    undo: document.getElementById('undo'),
    reset: document.getElementById('reset')
  };

  let state = load();
  // Snapshots taken at the start of each group; in-memory only.
  let undoStack = [];
  // Restored history has no snapshot, so only a group opened in this
  // session may be extended.
  let groupOpen = false;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          a: Number.isInteger(parsed.a) ? parsed.a : 0,
          b: Number.isInteger(parsed.b) ? parsed.b : 0,
          nameA: typeof parsed.nameA === 'string' ? parsed.nameA : 'Team 1',
          nameB: typeof parsed.nameB === 'string' ? parsed.nameB : 'Team 2',
          events: loadEvents(parsed.events)
        };
      }
    } catch (err) {
      console.warn('Could not load saved scores:', err);
    }
    return { a: 0, b: 0, nameA: 'Team 1', nameB: 'Team 2', events: [] };
  }

  function loadEvents(events) {
    if (!Array.isArray(events)) return [];
    return events
      .filter(e => e && (e.team === 'a' || e.team === 'b') && Number.isInteger(e.delta) && e.delta !== 0)
      .map(e => ({ team: e.team, delta: e.delta, t: Number.isFinite(e.t) ? e.t : 0 }))
      .slice(-MAX_HISTORY);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not save scores:', err);
    }
  }

  function formatEvent(delta) {
    return delta > 0 ? `+${delta}` : String(delta);
  }

  function renderHistory(team, node) {
    node.textContent = state.events
      .filter(e => e.team === team)
      .map(e => formatEvent(e.delta))
      .join(', ');
  }

  function render() {
    el.scoreA.textContent = state.a;
    el.scoreB.textContent = state.b;
    renderHistory('a', el.histA);
    renderHistory('b', el.histB);
    el.undo.disabled = undoStack.length === 0;
  }

  function pushUndo() {
    undoStack.push({
      a: state.a,
      b: state.b,
      events: state.events.map(e => ({ ...e }))
    });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }

  // Same team, same direction, within the sliding window.
  function continuesGroup(team, delta, now) {
    if (!groupOpen) return false;
    const last = state.events[state.events.length - 1];
    if (!last) return false;
    return last.team === team
      && Math.sign(last.delta) === Math.sign(delta)
      && now - last.t < GROUP_MS;
  }

  function bump(team, delta) {
    const current = state[team];
    const next = Math.max(0, current + delta);
    const applied = next - current;
    if (applied === 0) return; // clamped at zero: record nothing

    const now = Date.now();
    if (continuesGroup(team, applied, now)) {
      const last = state.events[state.events.length - 1];
      last.delta += applied;
      last.t = now;
    } else {
      pushUndo();
      state.events.push({ team, delta: applied, t: now });
      if (state.events.length > MAX_HISTORY) state.events.shift();
    }
    groupOpen = true;

    state[team] = next;
    save();
    render();
  }

  el.tapA.addEventListener('click', () => bump('a', +1));
  el.tapB.addEventListener('click', () => bump('b', +1));
  el.minusA.addEventListener('click', () => bump('a', -1));
  el.minusB.addEventListener('click', () => bump('b', -1));
  // +5 goes through the same bump(), so it groups exactly as five taps do:
  // a following +1 inside the window extends it to +6. See _README.md.
  el.plus5A.addEventListener('click', () => bump('a', +5));
  el.plus5B.addEventListener('click', () => bump('b', +5));

  el.undo.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    state.a = prev.a;
    state.b = prev.b;
    state.events = prev.events;
    groupOpen = false;
    save();
    render();
  });

  el.reset.addEventListener('click', () => {
    if (state.a === 0 && state.b === 0 && state.events.length === 0) return;
    if (!confirm('Reset both scores to 0?')) return;
    pushUndo();
    state.a = 0;
    state.b = 0;
    state.events = [];
    groupOpen = false;
    save();
    render();
  });

  el.nameA.addEventListener('input', () => { state.nameA = el.nameA.value; save(); });
  el.nameB.addEventListener('input', () => { state.nameB = el.nameB.value; save(); });

  el.nameA.value = state.nameA;
  el.nameB.value = state.nameB;
  render();
})();
