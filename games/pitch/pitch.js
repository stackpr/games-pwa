// Pitch scoresheet for four or five players. See _README.md.
(function () {
  const STORAGE_KEY = 'games.pitch.v2';
  const MIN_BID = 2;

  /*
   * What a hand is made of, per point version. Pitch point sets vary a lot
   * from table to table; this is the one table to edit if yours differs, and
   * the rules modal is generated from it so the two cannot disagree. The
   * entry panel no longer names the individual points — a table can count
   * its own tricks — so this decides the hand total and nothing else.
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
    entry: pick('entry'),
    entryTitle: pick('entry-title'),
    entryLeft: pick('entry-left'),
    editBid: pick('edit-bid', 'button'),
    bidValue: pick('bid-value'),
    bidUp: pick('bid-up', 'button'),
    bidDown: pick('bid-down', 'button'),
    bidderRow: pick('bidder-row'),
    took: pick('took'),
    tookLabel: pick('took-label'),
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
  let bidderBtns = [];
  const tookCells = [];   // side -> { value, up, down }

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
    return {
      phase: 'bidding',
      bidder: 0,
      bid: Math.min(4, maxBid()),
      took: Array(sideCount()).fill(0)
    };
  }

  function validDraft(d) {
    const sides = sideCount();
    const draft = freshDraft();
    if (!d) return draft;
    if (d.phase === 'playing') draft.phase = 'playing';
    if (Number.isInteger(d.bidder) && d.bidder >= 0 && d.bidder < sides) {
      draft.bidder = d.bidder;
    }
    if (Number.isInteger(d.bid) && d.bid >= MIN_BID && d.bid <= maxBid()) {
      draft.bid = d.bid;
    }
    const took = Array.isArray(d.took) ? d.took : [];
    for (let i = 0; i < sides; i++) {
      const v = took[i];
      draft.took[i] = Number.isInteger(v) && v >= 0 && v <= state.points ? v : 0;
    }
    // A saved hand that no longer adds up is kept rather than zeroed: the
    // Score button will not fire until it does, which is a repair the table
    // can see rather than one made behind their back.
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
      // Scored hands carry no phase; a draft's validation is reused for the
      // fields they do share and the rest is dropped.
      .map(r => {
        const d = validDraft(r);
        return { bidder: d.bidder, bid: d.bid, took: d.took };
      });
    return { players, points, rounds, draft: validDraft(p.draft) };
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  /**
   * A hand's value to each side: what they took, except that the bidder
   * either makes the bid or loses it outright.
   */
  function scoreRound(round) {
    const sides = sideCount();
    const out = Array.from({ length: sides }, (_, i) => round.took[i] || 0);
    out[round.bidder] = out[round.bidder] >= round.bid ? out[round.bidder] : -round.bid;
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

  function placed() {
    return state.draft.took.reduce((a, b) => a + b, 0);
  }

  function buildEntry() {
    el.bidderRow.textContent = '';
    el.bidderRow.style.gridTemplateColumns = 'repeat(' + sideCount() + ', 1fr)';
    bidderBtns = [];
    for (let i = 0; i < sideCount(); i++) {
      const b = document.createElement('button');
      b.className = 'side';
      b.type = 'button';
      b.dataset.side = String(i);
      b.textContent = sideName(i);
      b.setAttribute('aria-label', sideName(i) + ' bid');
      b.addEventListener('click', () => {
        if (state.draft.phase !== 'bidding') return;
        state.draft.bidder = i;
        save();
        render();
      });
      el.bidderRow.append(b);
      bidderBtns.push(b);
    }

    el.took.textContent = '';
    el.took.style.gridTemplateColumns = 'repeat(' + sideCount() + ', 1fr)';
    tookCells.length = 0;
    for (let i = 0; i < sideCount(); i++) {
      const cell = document.createElement('div');
      cell.className = 'took-cell';
      cell.dataset.side = String(i);

      const name = document.createElement('span');
      name.className = 'took-name';
      name.textContent = sideName(i);

      const up = document.createElement('button');
      up.className = 'step';
      up.type = 'button';
      up.id = 'took-up-' + i;
      up.textContent = '+';
      up.setAttribute('aria-label', 'Add a point to ' + sideName(i));
      up.addEventListener('click', () => bumpTook(i, +1));

      const value = document.createElement('span');
      value.className = 'took-value';
      value.id = 'took-' + i;

      const down = document.createElement('button');
      down.className = 'step';
      down.type = 'button';
      down.id = 'took-down-' + i;
      down.textContent = '−';
      down.setAttribute('aria-label', 'Take a point off ' + sideName(i));
      down.addEventListener('click', () => bumpTook(i, -1));

      cell.append(name, up, value, down);
      el.took.append(cell);
      tookCells.push({ value, up, down });
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
    const bidding = state.draft.phase === 'bidding';
    el.entry.dataset.phase = state.draft.phase;
    el.entryTitle.textContent = bidding
      ? 'Hand ' + (state.rounds.length + 1) + ' · bidding'
      : 'Hand ' + (state.rounds.length + 1) + ' · '
        + sideName(state.draft.bidder) + ' bid ' + state.draft.bid;

    el.bidValue.textContent = String(state.draft.bid);
    el.bidUp.disabled = !bidding || state.draft.bid >= maxBid();
    el.bidDown.disabled = !bidding || state.draft.bid <= MIN_BID;
    for (let i = 0; i < bidderBtns.length; i++) {
      bidderBtns[i].setAttribute('aria-pressed',
        state.draft.bidder === i ? 'true' : 'false');
    }

    // The steppers cannot overshoot the hand total, so an entry is either
    // short or exactly right — never wrong in a way that needs an error.
    const left = state.points - placed();
    for (let i = 0; i < tookCells.length; i++) {
      const cell = tookCells[i];
      cell.value.textContent = String(state.draft.took[i]);
      cell.up.disabled = bidding || left <= 0;
      cell.down.disabled = bidding || state.draft.took[i] <= 0;
    }

    el.tookLabel.textContent = 'Points taken · ' + state.points + ' in the hand';
    el.entryLeft.textContent = bidding
      ? ''
      : left === 0
        ? 'all ' + state.points + ' placed'
        : left + ' of ' + state.points + ' still to place';

    el.score.textContent = bidding ? 'Lock bid' : 'Score the hand';
    el.score.disabled = !bidding && left !== 0;
    el.undo.disabled = state.rounds.length === 0;
  }

  function render() {
    renderSheet();
    renderEntry();
  }

  function bumpBid(by) {
    if (state.draft.phase !== 'bidding') return;
    const next = state.draft.bid + by;
    if (next < MIN_BID || next > maxBid()) return;
    state.draft.bid = next;
    save();
    renderEntry();
  }

  function bumpTook(side, by) {
    if (state.draft.phase !== 'playing') return;
    const next = state.draft.took[side] + by;
    if (next < 0 || placed() + by > state.points) return;
    state.draft.took[side] = next;
    // The hand in progress is persisted on every tap: the gap between
    // locking the bid and scoring is the hand itself. See _README.md.
    save();
    renderEntry();
  }

  function commit() {
    if (state.draft.phase === 'bidding') {
      state.draft.phase = 'playing';
      save();
      render();
      return;
    }
    if (placed() !== state.points) return;
    state.rounds.push({
      bidder: state.draft.bidder,
      bid: state.draft.bid,
      took: state.draft.took.slice()
    });
    state.draft = freshDraft();
    save();
    render();
    const sheet = document.querySelector('.sheet');
    if (sheet) sheet.scrollTop = sheet.scrollHeight;
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
  el.score.addEventListener('click', commit);

  el.editBid.addEventListener('click', () => {
    if (state.draft.phase !== 'playing') return;
    state.draft.phase = 'bidding';
    save();
    render();
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
