// Dice: roll one to six dice, nothing else. See _README.md.
// The tray and its animation come from js/lib/dice.js.
(function () {
  const STORAGE_KEY = 'games.dice.v1';
  const MIN = 1;
  const MAX = 6;

  const el = {
    tray: document.getElementById('tray'),
    countRow: document.getElementById('count-row'),
    roll: document.getElementById('roll'),
    result: document.getElementById('result')
  };

  // No onPick: nothing here is selectable, so the dice are spans and stay
  // out of the tab order.
  const tray = DiceTray.create(el.tray);

  let state = load();

  function clampCount(n) {
    const c = Math.floor(Number(n));
    if (!Number.isFinite(c)) return 2;
    return Math.min(MAX, Math.max(MIN, c));
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    if (!p) return { count: 2, faces: [] };
    const count = clampCount(p.count);
    const raw = Array.isArray(p.faces) ? p.faces : [];
    const faces = raw
      .slice(0, count)
      .map(f => (Number.isInteger(f) && f >= 1 && f <= DiceTray.FACES ? f : 1));
    // A short saved roll is dropped rather than padded: half a roll is not a
    // roll that ever happened.
    return { count, faces: faces.length === count ? faces : [] };
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  function renderCounts() {
    for (const b of el.countRow.children) {
      b.setAttribute('aria-pressed', Number(b.dataset.count) === state.count ? 'true' : 'false');
    }
  }

  function announce() {
    el.result.textContent = state.faces.length
      ? 'Rolled ' + state.faces.join(', ')
      : '';
  }

  function setCount(count) {
    if (count === state.count) return;
    tray.cancel();
    state = { count: clampCount(count), faces: [] };
    tray.setCount(state.count);
    renderCounts();
    announce();
    el.roll.disabled = false;
    save();
  }

  function doRoll() {
    if (tray.isRolling()) return;
    state.faces = Array.from({ length: state.count }, () => DiceTray.randomFace());
    save();

    el.roll.disabled = true;
    const indices = state.faces.map((_, i) => i);
    tray.roll(indices, state.faces, () => {
      el.roll.disabled = false;
      announce();
    });
  }

  for (let c = MIN; c <= MAX; c++) {
    const b = document.createElement('button');
    b.className = 'count';
    b.type = 'button';
    b.textContent = String(c);
    b.dataset.count = String(c);
    b.addEventListener('click', () => setCount(c));
    el.countRow.append(b);
  }

  el.roll.addEventListener('click', doRoll);
  // The tray is a roll target too — tapping the dice is the natural gesture.
  el.tray.addEventListener('click', doRoll);

  tray.setCount(state.count);
  if (state.faces.length) tray.showFaces(state.faces);
  renderCounts();
  announce();
})();
