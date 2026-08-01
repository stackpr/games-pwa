// Spades: a scoresheet for four-handed partners. See _README.md.
(function () {
  const STORAGE_KEY = 'games.spades.v1';
  const SEATS = 4;
  const TRICKS = 13;
  // Sentinels rather than 0, because nil is a different kind of bid: it has
  // its own bonus and contributes nothing to the team contract.
  const NIL = -1;
  const BLIND = -2;
  // Stepping down from 1 reaches nil, and blind nil sits below that.
  const BID_STEPS = [BLIND, NIL].concat(
    Array.from({ length: TRICKS }, (_, i) => i + 1));
  const DEFAULT_BID = 3;

  const el = {
    rows: document.getElementById('rows'),
    empty: document.getElementById('empty'),
    seats: document.getElementById('seats'),
    total1: document.getElementById('total-1'),
    total2: document.getElementById('total-2'),
    score: document.getElementById('score-round'),
    undo: document.getElementById('undo'),
    newGame: document.getElementById('new-game'),
    rules: document.getElementById('rules'),
    rulesBtn: document.getElementById('rules-btn')
  };

  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Missing element for a ' + type + ' handler');
  }

  let state = load();
  let draft = freshDraft();
  const bidCells = [];
  const trickCells = [];
  const bidBtns = [];
  const trickBtns = [];

  function freshDraft() {
    return {
      bids: Array(SEATS).fill(DEFAULT_BID),
      tricks: Array(SEATS).fill(0)
    };
  }

  function validBid(v) {
    return BID_STEPS.indexOf(v) >= 0 ? v : DEFAULT_BID;
  }

  function validTricks(v) {
    return Number.isInteger(v) && v >= 0 && v <= TRICKS ? v : 0;
  }

  function load() {
    const p = Store.load(STORAGE_KEY);
    const raw = p && Array.isArray(p.rounds) ? p.rounds : [];
    const rounds = raw
      .filter(r => r && Array.isArray(r.bids) && Array.isArray(r.tricks))
      .map(r => ({
        bids: Array.from({ length: SEATS }, (_, i) => validBid(r.bids[i])),
        tricks: Array.from({ length: SEATS }, (_, i) => validTricks(r.tricks[i]))
      }));
    return { rounds };
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  /**
   * Score one team's half of a round. Nil is settled per player and added on
   * top; a nil bidder's tricks still count toward the partner's contract.
   * No bag penalty — see _README.md.
   */
  function scoreTeam(bids, tricks) {
    let contract = 0;
    let bonus = 0;
    for (let i = 0; i < bids.length; i++) {
      if (bids[i] === NIL) bonus += tricks[i] === 0 ? 100 : -100;
      else if (bids[i] === BLIND) bonus += tricks[i] === 0 ? 200 : -200;
      else contract += bids[i];
    }
    const took = tricks.reduce((a, b) => a + b, 0);
    let base = 0;
    if (contract > 0) {
      base = took >= contract ? contract * 10 + (took - contract) : -contract * 10;
    }
    return base + bonus;
  }

  // Partners sit across: team 1 is seats 0 and 2, team 2 is seats 1 and 3.
  function seatsOf(team) {
    return team === 1 ? [0, 2] : [1, 3];
  }

  function roundScore(round, team) {
    const s = seatsOf(team);
    return scoreTeam(s.map(i => round.bids[i]), s.map(i => round.tricks[i]));
  }

  function totalFor(team) {
    return state.rounds.reduce((sum, r) => sum + roundScore(r, team), 0);
  }

  function bidLabel(v) {
    if (v === NIL) return 'Nil';
    if (v === BLIND) return 'Blind';
    return String(v);
  }

  // Whoever deals rotates one seat a round, and P1 deals the first.
  function dealer() {
    return state.rounds.length % SEATS;
  }

  function buildEntry() {
    el.seats.textContent = '';
    const cells = [];

    // Header row: seat names, with the dealer marked underneath.
    cells.push(blank());
    for (let i = 0; i < SEATS; i++) {
      const name = document.createElement('div');
      name.className = 'seat-name';
      name.dataset.team = String((i % 2) + 1);
      name.dataset.seat = String(i);
      name.append(document.createTextNode('P' + (i + 1)));
      const deal = document.createElement('span');
      deal.className = 'deal';
      name.append(deal);
      cells.push(name);
    }

    cells.push(label('Bid'));
    for (let i = 0; i < SEATS; i++) cells.push(stepper('bid', i));
    cells.push(label('Took'));
    for (let i = 0; i < SEATS; i++) cells.push(stepper('tricks', i));

    for (const c of cells) el.seats.append(c);
  }

  function blank() {
    return document.createElement('span');
  }

  function label(text) {
    const s = document.createElement('span');
    s.className = 'row-label';
    s.textContent = text;
    return s;
  }

  function stepper(kind, seat) {
    const wrap = document.createElement('div');
    wrap.className = 'stepper';

    const up = document.createElement('button');
    up.className = 'step';
    up.type = 'button';
    up.textContent = '▲';
    up.dataset.kind = kind;
    up.dataset.seat = String(seat);
    up.dataset.dir = 'up';
    up.setAttribute('aria-label', 'Raise P' + (seat + 1) + ' ' + kind);

    const value = document.createElement('div');
    value.className = 'value';
    value.dataset.kind = kind;
    value.dataset.seat = String(seat);

    const down = up.cloneNode(false);
    down.textContent = '▼';
    down.dataset.dir = 'down';
    down.setAttribute('aria-label', 'Lower P' + (seat + 1) + ' ' + kind);

    up.addEventListener('click', () => bump(kind, seat, +1));
    down.addEventListener('click', () => bump(kind, seat, -1));

    if (kind === 'bid') { bidCells[seat] = value; bidBtns[seat] = { up, down }; }
    else { trickCells[seat] = value; trickBtns[seat] = { up, down }; }

    wrap.append(up, value, down);
    return wrap;
  }

  function bump(kind, seat, dir) {
    if (kind === 'bid') {
      const at = BID_STEPS.indexOf(draft.bids[seat]);
      const next = at + dir;
      if (next < 0 || next >= BID_STEPS.length) return;
      draft.bids[seat] = BID_STEPS[next];
    } else {
      const next = draft.tricks[seat] + dir;
      if (next < 0 || next > TRICKS) return;
      draft.tricks[seat] = next;
    }
    renderEntry();
  }

  function renderEntry() {
    const d = dealer();
    for (let i = 0; i < SEATS; i++) {
      const bid = draft.bids[i];
      bidCells[i].textContent = bidLabel(bid);
      if (bid < 0) bidCells[i].dataset.special = '';
      else delete bidCells[i].dataset.special;
      trickCells[i].textContent = String(draft.tricks[i]);

      const at = BID_STEPS.indexOf(bid);
      bidBtns[i].up.disabled = at >= BID_STEPS.length - 1;
      bidBtns[i].down.disabled = at <= 0;
      trickBtns[i].up.disabled = draft.tricks[i] >= TRICKS;
      trickBtns[i].down.disabled = draft.tricks[i] <= 0;

      const name = el.seats.querySelector('.seat-name[data-seat="' + i + '"] .deal');
      if (name) name.textContent = i === d ? 'deals' : '';
    }
  }

  function renderSheet() {
    el.rows.textContent = '';
    for (let r = 0; r < state.rounds.length; r++) {
      const round = state.rounds[r];
      const tr = document.createElement('tr');
      tr.dataset.round = String(r + 1);

      const n = document.createElement('td');
      n.className = 'rnd';
      n.textContent = String(r + 1);
      tr.append(n);

      for (const team of [1, 2]) {
        if (team === 2) {
          const div = document.createElement('td');
          div.className = 'divider';
          tr.append(div);
        }
        const s = seatsOf(team);
        const bids = document.createElement('td');
        bids.className = 'bids';
        bids.dataset.team = String(team);
        bids.textContent = s.map(i => bidLabel(round.bids[i])).join(' / ');
        const pts = document.createElement('td');
        pts.className = 'pts';
        pts.dataset.team = String(team);
        const value = roundScore(round, team);
        pts.textContent = String(value);
        if (value < 0) pts.dataset.sign = 'down';
        tr.append(bids, pts);
      }
      el.rows.append(tr);
    }

    el.empty.hidden = state.rounds.length > 0;
    el.total1.textContent = String(totalFor(1));
    el.total2.textContent = String(totalFor(2));
    el.undo.disabled = state.rounds.length === 0;
  }

  function render() {
    renderSheet();
    renderEntry();
  }

  function scoreRound() {
    state.rounds.push({ bids: draft.bids.slice(), tricks: draft.tricks.slice() });
    draft = freshDraft();
    save();
    render();
    // A fresh round is the interesting one, so keep it in view.
    const sheet = document.querySelector('.sheet');
    if (sheet) sheet.scrollTop = sheet.scrollHeight;
  }

  on(el.score, 'click', scoreRound);
  on(el.undo, 'click', () => {
    if (!state.rounds.length) return;
    state.rounds.pop();
    save();
    render();
  });
  on(el.newGame, 'click', () => {
    if (state.rounds.length && !confirm('Start a new game?')) return;
    state = { rounds: [] };
    draft = freshDraft();
    save();
    render();
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  buildEntry();
  render();
})();
