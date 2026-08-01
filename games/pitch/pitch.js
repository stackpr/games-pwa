// Pitch scoresheet for four or five players. See _README.md.
(function () {
  const STORAGE_KEY = 'games.pitch.v1';
  const MIN_BID = 2;

  /*
   * What is at stake in a hand, per point version. Pitch point sets vary a
   * lot from table to table; this is the one table to edit if yours differs,
   * and the rules modal is generated from it so the two cannot disagree.
   */
  const POINT_SETS = {
    10: [
      { key: 'high', name: 'High', value: 1 },
      { key: 'low', name: 'Low', value: 1 },
      { key: 'jack', name: 'Jack', value: 1 },
      { key: 'offjack', name: 'Off-Jack', value: 1 },
      { key: 'hijoker', name: 'High Joker', value: 1 },
      { key: 'lojoker', name: 'Low Joker', value: 1 },
      { key: 'three', name: 'Three', value: 3 },
      { key: 'game', name: 'Game', value: 1 }
    ],
    13: [
      { key: 'high', name: 'High', value: 1 },
      { key: 'low', name: 'Low', value: 1 },
      { key: 'jack', name: 'Jack', value: 1 },
      { key: 'offjack', name: 'Off-Jack', value: 1 },
      { key: 'hijoker', name: 'High Joker', value: 1 },
      { key: 'lojoker', name: 'Low Joker', value: 1 },
      { key: 'three', name: 'Three', value: 3 },
      { key: 'five', name: 'Five (Pedro)', value: 3 },
      { key: 'game', name: 'Game', value: 1 }
    ]
  };
  const VERSIONS = [10, 13];
  const PLAYER_COUNTS = [4, 5];

  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'span');
  }

  const el = {
    head: pick('head'),
    rows: pick('rows'),
    empty: pick('empty'),
    totals: pick('totals'),
    entryTitle: pick('entry-title'),
    entryLeft: pick('entry-left'),
    bidValue: pick('bid-value'),
    bidUp: pick('bid-up', 'button'),
    bidDown: pick('bid-down', 'button'),
    bidderRow: pick('bidder-row'),
    items: pick('items'),
    score: pick('score', 'button'),
    undo: pick('undo', 'button'),
    newGame: pick('new-game', 'button'),
    settings: pick('settings'),
    settingsBtn: pick('settings-btn', 'button'),
    playersRow: pick('players-row'),
    pointsRow: pick('points-row'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button'),
    pointsList: pick('points-list')
  };

  // Initialised before load() runs, because load() validates against the
  // player count and point version it has just read.
  let state = { players: 4, points: 10, rounds: [], draft: null };
  const sideBtns = {};   // key -> [button per side]
  let bidderBtns = [];

  /*
   * Four players is two partnerships; five is every player for themselves.
   * That split is the usual one and it means "side" covers both: a side is
   * whatever thing scores, and everything downstream counts sides, not seats.
   */
  function sideCount() {
    return state.players === 5 ? 5 : 2;
  }

  function sideName(i) {
    return state.players === 5 ? 'P' + (i + 1) : 'Team ' + (i + 1);
  }

  function items() {
    return POINT_SETS[state.points] || POINT_SETS[10];
  }

  function maxBid() {
    return state.points;
  }

  function freshDraft() {
    const taken = {};
    for (const item of items()) taken[item.key] = null;
    return { bidder: 0, bid: Math.min(4, maxBid()), taken };
  }

  function validDraft(d) {
    const sides = sideCount();
    const draft = freshDraft();
    if (!d) return draft;
    if (Number.isInteger(d.bidder) && d.bidder >= 0 && d.bidder < sides) {
      draft.bidder = d.bidder;
    }
    if (Number.isInteger(d.bid) && d.bid >= MIN_BID && d.bid <= maxBid()) {
      draft.bid = d.bid;
    }
    for (const item of items()) {
      const v = d.taken && d.taken[item.key];
      draft.taken[item.key] = Number.isInteger(v) && v >= 0 && v < sides ? v : null;
    }
    return draft;
  }

  function load() {
    const p = Store.load(STORAGE_KEY) || {};
    const players = PLAYER_COUNTS.indexOf(p.players) !== -1 ? p.players : 4;
    const points = VERSIONS.indexOf(p.points) !== -1 ? p.points : 10;
    state = { players, points, rounds: [], draft: null };
    const raw = Array.isArray(p.rounds) ? p.rounds : [];
    const rounds = raw
      .filter(r => r && Number.isInteger(r.bid) && Number.isInteger(r.bidder))
      .map(r => validDraft(r));
    return { players, points, rounds, draft: validDraft(p.draft) };
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  /**
   * A hand's value to each side: what they took, except that the bidder
   * either makes the bid or loses it outright. Unassigned points score for
   * nobody, so a half-filled hand is simply worth less rather than wrong.
   */
  function scoreRound(round) {
    const sides = sideCount();
    const took = Array(sides).fill(0);
    for (const item of items()) {
      const side = round.taken[item.key];
      if (side != null && side < sides) took[side] += item.value;
    }
    const out = took.slice();
    out[round.bidder] = took[round.bidder] >= round.bid ? took[round.bidder] : -round.bid;
    return out;
  }

  function totals() {
    const sides = sideCount();
    const sum = Array(sides).fill(0);
    for (const round of state.rounds) {
      const values = scoreRound(round);
      for (let i = 0; i < sides; i++) sum[i] += values[i];
    }
    return sum;
  }

  function assigned() {
    return items().reduce((n, item) =>
      n + (state.draft.taken[item.key] == null ? 0 : item.value), 0);
  }

  function buildSideRow(container, name, onPick) {
    container.textContent = '';
    container.style.gridTemplateColumns = 'repeat(' + sideCount() + ', 1fr)';
    const made = [];
    for (let i = 0; i < sideCount(); i++) {
      const b = document.createElement('button');
      b.className = 'side';
      b.type = 'button';
      b.dataset.side = String(i);
      b.textContent = sideName(i);
      b.setAttribute('aria-label', name + ': ' + sideName(i));
      b.addEventListener('click', () => onPick(i));
      container.append(b);
      made.push(b);
    }
    return made;
  }

  function buildEntry() {
    bidderBtns = buildSideRow(el.bidderRow, 'Bidder', i => {
      state.draft.bidder = i;
      save();
      render();
    });

    el.items.textContent = '';
    for (const key of Object.keys(sideBtns)) delete sideBtns[key];
    for (const item of items()) {
      const row = document.createElement('div');
      row.className = 'item';
      row.dataset.item = item.key;

      const name = document.createElement('span');
      name.className = 'item-name';
      name.append(document.createTextNode(item.name + ' '));
      const worth = document.createElement('b');
      worth.textContent = item.value > 1 ? '(' + item.value + ')' : '';
      name.append(worth);

      const sides = document.createElement('div');
      sides.className = 'sides';
      row.append(name, sides);
      el.items.append(row);

      // Tapping the side already chosen clears it, so a mis-tap needs one
      // more tap rather than a reset.
      sideBtns[item.key] = buildSideRow(sides, item.name, i => {
        state.draft.taken[item.key] =
          state.draft.taken[item.key] === i ? null : i;
        save();
        render();
      });
    }

    el.totals.style.gridTemplateColumns = 'repeat(' + sideCount() + ', 1fr)';
    el.pointsList.textContent = '';
    for (const item of items()) {
      const li = document.createElement('li');
      li.textContent = item.name + ' — ' + item.value
        + (item.value === 1 ? ' point' : ' points');
      el.pointsList.append(li);
    }
    const total = document.createElement('li');
    total.textContent = 'Everything counted: ' + state.points + ' points a hand.';
    el.pointsList.append(total);
  }

  function renderSheet() {
    const sides = sideCount();
    el.head.textContent = '';
    const corner = document.createElement('th');
    corner.className = 'rnd';
    corner.textContent = '#';
    el.head.append(corner);
    const bidHead = document.createElement('th');
    bidHead.textContent = 'bid';
    el.head.append(bidHead);
    for (let i = 0; i < sides; i++) {
      const th = document.createElement('th');
      th.dataset.side = String(i);
      th.textContent = sideName(i);
      el.head.append(th);
    }

    el.rows.textContent = '';
    for (let r = 0; r < state.rounds.length; r++) {
      const round = state.rounds[r];
      const values = scoreRound(round);
      const tr = document.createElement('tr');
      tr.dataset.round = String(r + 1);

      const n = document.createElement('td');
      n.className = 'rnd';
      n.textContent = String(r + 1);
      const bid = document.createElement('td');
      bid.className = 'bidcell';
      bid.textContent = sideName(round.bidder) + ' ' + round.bid;
      tr.append(n, bid);

      for (let i = 0; i < sides; i++) {
        const td = document.createElement('td');
        td.className = 'pts';
        td.dataset.side = String(i);
        td.textContent = String(values[i]);
        if (values[i] < 0) td.dataset.sign = 'down';
        if (i === round.bidder) td.dataset.bidder = '';
        tr.append(td);
      }
      el.rows.append(tr);
    }
    el.empty.hidden = state.rounds.length > 0;

    const sum = totals();
    el.totals.textContent = '';
    for (let i = 0; i < sides; i++) {
      const box = document.createElement('div');
      box.className = 'total';
      box.dataset.side = String(i);
      const name = document.createElement('span');
      name.className = 'total-name';
      name.textContent = sideName(i);
      const value = document.createElement('span');
      value.className = 'total-score';
      value.id = 'total-' + i;
      value.textContent = String(sum[i]);
      box.append(name, value);
      el.totals.append(box);
    }
  }

  function renderEntry() {
    el.entryTitle.textContent = 'Hand ' + (state.rounds.length + 1);
    el.bidValue.textContent = String(state.draft.bid);
    el.bidUp.disabled = state.draft.bid >= maxBid();
    el.bidDown.disabled = state.draft.bid <= MIN_BID;

    for (let i = 0; i < bidderBtns.length; i++) {
      bidderBtns[i].setAttribute('aria-pressed',
        state.draft.bidder === i ? 'true' : 'false');
    }
    for (const item of items()) {
      const chosen = state.draft.taken[item.key];
      const btns = sideBtns[item.key] || [];
      for (let i = 0; i < btns.length; i++) {
        btns[i].setAttribute('aria-pressed', chosen === i ? 'true' : 'false');
      }
    }

    const left = state.points - assigned();
    el.entryLeft.textContent = left === 0
      ? 'all ' + state.points + ' points placed'
      : left + ' of ' + state.points + ' still to place';
    el.undo.disabled = state.rounds.length === 0;
  }

  function render() {
    renderSheet();
    renderEntry();
  }

  function bumpBid(by) {
    const next = state.draft.bid + by;
    if (next < MIN_BID || next > maxBid()) return;
    state.draft.bid = next;
    save();
    renderEntry();
  }

  function reshape(players, points) {
    state.players = players;
    state.points = points;
    state.rounds = [];
    state.draft = freshDraft();
    save();
    buildEntry();
    render();
    renderSettings();
  }

  function renderSettings() {
    for (const b of el.playersRow.querySelectorAll('.pick')) {
      b.setAttribute('aria-pressed',
        Number(b.dataset.players) === state.players ? 'true' : 'false');
    }
    for (const b of el.pointsRow.querySelectorAll('.pick')) {
      b.setAttribute('aria-pressed',
        Number(b.dataset.points) === state.points ? 'true' : 'false');
    }
  }

  state = load();

  el.bidUp.addEventListener('click', () => bumpBid(1));
  el.bidDown.addEventListener('click', () => bumpBid(-1));

  el.score.addEventListener('click', () => {
    state.rounds.push(state.draft);
    state.draft = freshDraft();
    save();
    render();
    const sheet = document.querySelector('.sheet');
    if (sheet) sheet.scrollTop = sheet.scrollHeight;
  });

  el.undo.addEventListener('click', () => {
    if (!state.rounds.length) return;
    state.rounds.pop();
    save();
    render();
  });

  el.newGame.addEventListener('click', () => {
    if (state.rounds.length && !confirm('Start a new game?')) return;
    state.rounds = [];
    state.draft = freshDraft();
    save();
    render();
  });

  for (const b of el.playersRow.querySelectorAll('.pick')) {
    b.addEventListener('click', () => {
      const n = Number(b.dataset.players);
      if (n === state.players) return;
      if (state.rounds.length && !confirm('That clears the sheet. Carry on?')) return;
      reshape(n, state.points);
    });
  }
  for (const b of el.pointsRow.querySelectorAll('.pick')) {
    b.addEventListener('click', () => {
      const n = Number(b.dataset.points);
      if (n === state.points) return;
      if (state.rounds.length && !confirm('That clears the sheet. Carry on?')) return;
      reshape(state.players, n);
    });
  }

  Modal.create(el.settings, { trigger: el.settingsBtn });
  Modal.create(el.rules, { trigger: el.rulesBtn });

  buildEntry();
  render();
  renderSettings();
})();
