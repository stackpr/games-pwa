/*
 * Golf / mini golf scorecard. Holes down, players across; tap a square and
 * pick the strokes off a 1-9 pad. See _README.md.
 */
(function () {
  const KEY = 'games.golf.v1';
  const MAX_PLAYERS = 12;
  const MAX_STROKES = 9;
  const HOLE_COUNTS = [9, 18];

  const $ = id => document.getElementById(id);
  // A worker can serve this script with the previous release's HTML, so every
  // binding tolerates a missing node rather than taking the page down.
  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  /* ---- state ------------------------------------------------------------ */

  let state = null;
  let picker = null;
  let settingsSheet = null;
  let asking = null;
  let armed = null;

  function blank() {
    return {
      holes: 18,
      players: ['', ''],
      usePar: false,
      // 0 means "not set" throughout — for a par and for a score alike.
      pars: new Array(18).fill(0),
      scores: [new Array(18).fill(0), new Array(18).fill(0)],
      nameMode: 'type'
    };
  }

  function sized(list, length) {
    const out = new Array(length).fill(0);
    if (Array.isArray(list)) {
      for (let i = 0; i < length; i++) {
        const v = list[i];
        if (Number.isInteger(v) && v >= 1 && v <= MAX_STROKES) out[i] = v;
      }
    }
    return out;
  }

  function load() {
    const saved = Store.load(KEY);
    if (!saved || typeof saved !== 'object') return blank();

    const s = blank();
    s.holes = HOLE_COUNTS.indexOf(saved.holes) >= 0 ? saved.holes : 18;
    s.usePar = saved.usePar === true;
    s.nameMode = saved.nameMode === 'pick' ? 'pick' : 'type';

    const names = Array.isArray(saved.players) ? saved.players : [];
    const count = Math.min(MAX_PLAYERS, Math.max(1, names.length || 2));
    s.players = [];
    for (let i = 0; i < count; i++) {
      s.players.push(typeof names[i] === 'string' ? names[i].slice(0, 16) : '');
    }

    s.pars = sized(saved.pars, s.holes);
    s.scores = s.players.map((_, i) =>
      sized(Array.isArray(saved.scores) ? saved.scores[i] : null, s.holes));
    return s;
  }

  function save() {
    Store.save(KEY, state);
  }

  function name(i) {
    const given = String(state.players[i] || '').trim();
    return given || 'Player ' + (i + 1);
  }

  /* ---- the sums --------------------------------------------------------- */

  /** Strokes taken over a span, and how many of those holes were played. */
  function span(list, from, to) {
    let total = 0;
    let played = 0;
    for (let h = from; h < to && h < list.length; h++) {
      if (list[h]) { total += list[h]; played++; }
    }
    return { total: total, played: played };
  }

  /** Par over the same span, counting only holes that were actually played. */
  function parFor(list, from, to) {
    let total = 0;
    for (let h = from; h < to && h < state.pars.length; h++) {
      if (list[h] && state.pars[h]) total += state.pars[h];
    }
    return total;
  }

  function vsPar(list, from, to) {
    if (!state.usePar) return null;
    const par = parFor(list, from, to);
    if (!par) return null;
    return span(list, from, to).total - par;
  }

  // ASCII minus, matching the rest of the site — Counter's spec pins the
  // same character.
  function signed(n) {
    if (n === 0) return 'E';
    return (n > 0 ? '+' : '-') + Math.abs(n);
  }

  /* ---- rendering -------------------------------------------------------- */

  function cell(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function scoreButton(p, h) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'score';
    btn.dataset.p = String(p);
    btn.dataset.h = String(h);
    const value = state.scores[p][h];
    btn.textContent = value ? String(value) : '';

    const par = state.pars[h];
    if (value) btn.dataset.set = '';
    if (value && state.usePar && par) {
      if (value === 1) btn.dataset.vs = 'ace';
      else if (value < par) btn.dataset.vs = 'under';
      else if (value > par) btn.dataset.vs = 'over';
    }

    const said = value ? value + (value === 1 ? ' stroke' : ' strokes') : 'not scored';
    btn.setAttribute('aria-label', 'Hole ' + (h + 1) + ', ' + name(p) + ', ' + said);
    btn.addEventListener('click', () => askScore(p, h));
    return btn;
  }

  function subtotalRow(label, from, to) {
    const tr = cell('tr', 'sub');
    tr.dataset.sub = label.toLowerCase();
    const head = cell('th', 'col-hole');
    head.scope = 'row';
    const tag = cell('span', 'sub-label');
    tag.textContent = label;
    head.append(tag);
    tr.append(head);

    const parCell = cell('td', 'col-par');
    let par = 0;
    for (let h = from; h < to && h < state.pars.length; h++) par += state.pars[h];
    parCell.textContent = par ? String(par) : '';
    tr.append(parCell);

    for (let p = 0; p < state.players.length; p++) {
      const td = cell('td', 'col-p');
      td.dataset.p = String(p);
      const sum = span(state.scores[p], from, to);
      td.textContent = sum.played ? String(sum.total) : '';
      tr.append(td);
    }
    return tr;
  }

  function render() {
    document.body.dataset.nameMode = state.nameMode;
    if (state.usePar) document.body.dataset.par = '';
    else delete document.body.dataset.par;

    const table = $('card');
    if (!table) return;
    table.textContent = '';
    // The count clamps at one everywhere it is set, so an empty card is not
    // a state the page has to have an answer for.
    if (!state.players.length) return;

    const head = cell('thead');
    const headRow = cell('tr');
    const holeHead = cell('th', 'col-hole');
    holeHead.textContent = 'Hole';
    const parHead = cell('th', 'col-par');
    parHead.textContent = 'Par';
    headRow.append(holeHead, parHead);
    for (let p = 0; p < state.players.length; p++) {
      const th = cell('th', 'col-p');
      th.scope = 'col';
      const label = cell('span', 'player-name');
      label.textContent = name(p);
      th.append(label);
      const sum = span(state.scores[p], 0, state.holes);
      const sub = cell('span', 'player-sub');
      sub.textContent = sum.played + '/' + state.holes;
      th.append(sub);
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);

    const body = cell('tbody');
    for (let h = 0; h < state.holes; h++) {
      const tr = cell('tr');
      const th = cell('th', 'col-hole');
      th.scope = 'row';
      th.textContent = String(h + 1);
      tr.append(th);

      const parCell = cell('td', 'col-par');
      parCell.textContent = state.pars[h] ? String(state.pars[h]) : '';
      tr.append(parCell);

      for (let p = 0; p < state.players.length; p++) {
        const td = cell('td', 'score-cell col-p');
        td.append(scoreButton(p, h));
        tr.append(td);
      }
      body.append(tr);

      // Subtotals land where a paper card puts them: after 9, and after 18.
      if (h === 8) body.append(subtotalRow('Out', 0, 9));
      if (h === 17) body.append(subtotalRow('In', 9, 18));
    }
    table.append(body);

    const foot = cell('tfoot');
    const footRow = cell('tr');
    const footHead = cell('th', 'col-hole');
    footHead.scope = 'row';
    footHead.textContent = 'Tot';
    footRow.append(footHead);

    const footPar = cell('td', 'col-par');
    let allPar = 0;
    for (let h = 0; h < state.holes; h++) allPar += state.pars[h];
    footPar.textContent = allPar ? String(allPar) : '';
    footRow.append(footPar);

    // The running total is the leader board: lowest wins, and only among
    // cards that have something on them.
    const totals = state.players.map((_, p) => span(state.scores[p], 0, state.holes));
    const live = totals.filter(t => t.played).map(t => t.total);
    const best = live.length ? Math.min.apply(null, live) : null;

    for (let p = 0; p < state.players.length; p++) {
      const td = cell('td', 'col-p');
      td.dataset.p = String(p);
      const total = cell('span', 'grand-total');
      total.textContent = totals[p].played ? String(totals[p].total) : '–';
      td.append(total);

      const diff = vsPar(state.scores[p], 0, state.holes);
      if (diff !== null) {
        const vs = cell('span', 'grand-vs');
        vs.textContent = signed(diff);
        if (diff < 0) vs.dataset.vs = 'under';
        else if (diff > 0) vs.dataset.vs = 'over';
        td.append(vs);
      }
      if (best !== null && totals[p].played && totals[p].total === best) {
        td.dataset.lead = '';
      }
      footRow.append(td);
    }
    foot.append(footRow);
    table.append(foot);
  }

  /* ---- the stroke pad --------------------------------------------------- */

  function buildPad() {
    const pad = $('pad');
    if (!pad) return;
    pad.textContent = '';
    for (let n = 1; n <= MAX_STROKES; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.n = String(n);
      b.textContent = String(n);
      b.addEventListener('click', () => choose(n));
      pad.append(b);
    }
  }

  /** Marks the pad key that matches this hole's par, when there is one. */
  function markPar(par) {
    const pad = $('pad');
    if (!pad) return;
    for (const b of pad.querySelectorAll('button')) {
      if (par && Number(b.dataset.n) === par) b.dataset.parMark = '';
      else delete b.dataset.parMark;
    }
  }

  function openPad(title, par) {
    const heading = $('picker-title');
    if (heading) heading.textContent = title;
    markPar(par);
    if (picker) picker.open();
  }

  function askScore(p, h) {
    asking = { kind: 'score', p: p, h: h };
    openPad('Hole ' + (h + 1) + ' · ' + name(p), state.usePar ? state.pars[h] : 0);
  }

  function askPar(h) {
    asking = { kind: 'par', h: h };
    openPad('Par for hole ' + (h + 1), state.pars[h]);
  }

  function askParAll() {
    asking = { kind: 'par-all' };
    openPad('Par for every hole', 0);
  }

  function choose(n) {
    apply(n);
    if (picker) picker.close();
  }

  function apply(n) {
    if (!asking) return;
    if (asking.kind === 'score') {
      state.scores[asking.p][asking.h] = n;
      say(name(asking.p) + ', hole ' + (asking.h + 1) + ': ' +
        (n ? n + (n === 1 ? ' stroke' : ' strokes') : 'cleared'));
    } else if (asking.kind === 'par') {
      state.pars[asking.h] = n;
    } else if (asking.kind === 'par-all') {
      state.pars = new Array(state.holes).fill(n);
    }
    asking = null;
    save();
    render();
    renderSettings();
  }

  function say(text) {
    const el = $('say');
    if (el) el.textContent = text;
  }

  /* ---- settings --------------------------------------------------------- */

  function resize() {
    const count = state.players.length;
    state.pars = sized(state.pars, state.holes);
    const scores = [];
    for (let i = 0; i < count; i++) {
      scores.push(sized(state.scores[i], state.holes));
    }
    state.scores = scores;
  }

  function setPlayers(count) {
    const next = Math.min(MAX_PLAYERS, Math.max(1, count));
    while (state.players.length > next) {
      state.players.pop();
      state.scores.pop();
    }
    while (state.players.length < next) {
      state.players.push('');
      state.scores.push(new Array(state.holes).fill(0));
    }
  }

  let inputs = [];

  function buildNameInputs() {
    const wrap = $('name-inputs');
    if (!wrap) return;
    if (inputs.length !== state.players.length) {
      wrap.textContent = '';
      inputs = [];
      for (let i = 0; i < state.players.length; i++) {
        const box = document.createElement('input');
        box.className = 'name-input';
        box.maxLength = Names.MAX_LENGTH;
        box.placeholder = 'Player ' + (i + 1);
        box.setAttribute('aria-label', 'Name for player ' + (i + 1));
        box.value = state.players[i] || '';
        box.addEventListener('input', () => {
          state.players[i] = box.value;
          save();
          render();
        });
        // Remembered on the way out, not per keystroke, or the recent list
        // fills with every half-typed prefix of a name.
        box.addEventListener('change', () => {
          Names.remember(box.value);
          renderRecent();
        });
        inputs.push(box);
        wrap.append(box);
      }
      return;
    }
    for (let i = 0; i < inputs.length; i++) {
      const want = state.players[i] || '';
      if (inputs[i].value !== want) inputs[i].value = want;
    }
  }

  /*
   * The recent list, shared with the party games through js/lib/names.js:
   * ticking somebody fills the first empty seat, unticking takes them off
   * and the player count follows.
   */
  function renderRecent() {
    const wrap = $('recent-list');
    if (!wrap) return;
    const chosen = new Set(state.players
      .map(n => String(n).trim().toLowerCase()).filter(Boolean));
    const list = Names.recent();
    wrap.textContent = '';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'recent-empty';
      empty.textContent = 'Nobody yet — type some names and they will be here next time.';
      wrap.append(empty);
      return;
    }
    for (const person of list) {
      const b = document.createElement('button');
      b.className = 'recent';
      b.type = 'button';
      b.dataset.name = person;
      b.textContent = person;
      b.setAttribute('aria-pressed', chosen.has(person.toLowerCase()) ? 'true' : 'false');
      b.addEventListener('click', () => toggleRecent(person));
      wrap.append(b);
    }
  }

  function toggleRecent(person) {
    const named = state.players.map(n => String(n).trim()).filter(Boolean);
    const at = named.findIndex(n => n.toLowerCase() === person.toLowerCase());
    if (at !== -1) named.splice(at, 1);
    else named.push(person);

    setPlayers(Math.max(1, named.length));
    for (let i = 0; i < state.players.length; i++) state.players[i] = named[i] || '';
    inputs = [];
    save();
    render();
    renderSettings();
  }

  function renderSettings() {
    for (const b of document.querySelectorAll('#holes-row .pick')) {
      b.setAttribute('aria-pressed',
        Number(b.dataset.holes) === state.holes ? 'true' : 'false');
    }
    for (const b of document.querySelectorAll('#name-mode-row .pick')) {
      b.setAttribute('aria-pressed',
        b.dataset.nameMode === state.nameMode ? 'true' : 'false');
    }
    for (const b of document.querySelectorAll('#par-row .pick')) {
      const on = b.dataset.par === 'on';
      b.setAttribute('aria-pressed', on === state.usePar ? 'true' : 'false');
    }

    const row = $('count-row');
    if (row && row.children.length !== MAX_PLAYERS) {
      row.textContent = '';
      for (let n = 1; n <= MAX_PLAYERS; n++) {
        const b = document.createElement('button');
        b.className = 'count';
        b.type = 'button';
        b.dataset.count = String(n);
        b.textContent = String(n);
        b.addEventListener('click', () => {
          setPlayers(n);
          inputs = [];
          save();
          render();
          renderSettings();
        });
        row.append(b);
      }
    }
    if (row) {
      for (const b of row.children) {
        b.setAttribute('aria-pressed',
          Number(b.dataset.count) === state.players.length ? 'true' : 'false');
      }
    }

    const editor = $('par-editor');
    if (editor) editor.hidden = !state.usePar;
    const grid = $('par-grid');
    if (grid && state.usePar) {
      grid.textContent = '';
      for (let h = 0; h < state.holes; h++) {
        const b = document.createElement('button');
        b.className = 'par-hole';
        b.type = 'button';
        b.dataset.hole = String(h);
        if (!state.pars[h]) b.dataset.unset = '';
        b.setAttribute('aria-label',
          'Par for hole ' + (h + 1) + (state.pars[h] ? ', now ' + state.pars[h] : ', not set'));
        const tag = document.createElement('small');
        tag.textContent = String(h + 1);
        const value = document.createElement('span');
        value.className = 'par-val';
        value.textContent = state.pars[h] ? String(state.pars[h]) : '–';
        b.append(tag, value);
        b.addEventListener('click', () => askPar(h));
        grid.append(b);
      }
    }

    buildNameInputs();
    renderRecent();
  }

  /* ---- wiring ----------------------------------------------------------- */

  state = load();

  picker = Modal.create($('picker'), {
    onClose: function () { asking = null; }
  });
  settingsSheet = Modal.create($('settings'), {
    trigger: $('settings-btn'),
    onOpen: renderSettings
  });

  buildPad();
  on($('pad-clear'), 'click', () => choose(0));

  /*
   * Escape with the pad open over the settings sheet should close the pad
   * and leave the sheet. js/lib/modal.js listens on the document, so both
   * dialogs would otherwise answer the same key; taking it in the capture
   * phase and stopping it there is what keeps this one to the top dialog.
   */
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !picker || !picker.isOpen()) return;
    picker.close();
    event.stopImmediatePropagation();
    event.preventDefault();
  }, true);

  for (const b of document.querySelectorAll('#holes-row .pick')) {
    b.addEventListener('click', () => {
      state.holes = Number(b.dataset.holes);
      resize();
      save();
      render();
      renderSettings();
    });
  }
  for (const b of document.querySelectorAll('#name-mode-row .pick')) {
    b.addEventListener('click', () => {
      state.nameMode = b.dataset.nameMode;
      save();
      render();
      renderSettings();
    });
  }
  for (const b of document.querySelectorAll('#par-row .pick')) {
    b.addEventListener('click', () => {
      state.usePar = b.dataset.par === 'on';
      save();
      render();
      renderSettings();
    });
  }
  on($('par-all'), 'click', askParAll);

  /*
   * A round is a lot of taps to lose to a stray one, so the button asks
   * twice — and disarms itself, so a tap and a walk away leaves it safe.
   */
  on($('new-btn'), 'click', () => {
    const btn = $('new-btn');
    if (!armed) {
      armed = setTimeout(() => {
        armed = null;
        if (btn) {
          delete btn.dataset.armed;
          btn.textContent = 'New round';
        }
      }, 3000);
      if (btn) {
        btn.dataset.armed = '';
        btn.textContent = 'Clear all?';
      }
      return;
    }
    clearTimeout(armed);
    armed = null;
    if (btn) {
      delete btn.dataset.armed;
      btn.textContent = 'New round';
    }
    state.scores = state.players.map(() => new Array(state.holes).fill(0));
    save();
    render();
    say('New round. The card is clear.');
  });

  // An empty recent list has nothing to pick from, so a first run is put in
  // the typing mode rather than shown a panel it cannot use.
  if (state.nameMode === 'pick' && !Names.recent().length) state.nameMode = 'type';

  render();
  renderSettings();
})();
