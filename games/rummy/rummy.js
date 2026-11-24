// Rummy scoresheet: patterns, hands and a running score. See _README.md.
(function () {
  const KEY = 'games.rummy.v1';
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 8;
  const MAX_HAND = 999;
  const PLAIN_ROUNDS = [4, 6, 8, 10, 12];

  /*
   * A meld is a kind and a length; a contract is the melds you must put
   * down before you may meld at all. `set` is same rank, `run` is
   * consecutive in a suit, and a set of 2 is a pair.
   *
   * The sequences are historical and the provenance is in _README.md.
   * They are named here by what they are rather than by the variant they
   * came from — a player reads "Seven patterns" faster than a place name,
   * and the one modern game of this shape is somebody's trademark.
   */
  const set = n => ({ kind: 'set', n });
  const run = n => ({ kind: 'run', n });

  const SEQUENCES = [
    {
      key: 'off',
      name: 'Off',
      blurb: 'Plain Rummy. Meld what you like; the sheet just counts.',
      contracts: []
    },
    {
      key: 'seven',
      name: 'Seven',
      blurb: 'The classic contract game: sets of three and runs of four, ' +
        'getting longer every deal.',
      contracts: [
        [set(3), set(3)],
        [set(3), run(4)],
        [run(4), run(4)],
        [set(3), set(3), set(3)],
        [set(3), set(3), run(4)],
        [set(3), run(4), run(4)],
        [run(4), run(4), run(4)]
      ]
    },
    {
      key: 'eight',
      name: 'Eight',
      blurb: 'The seven with a fourth set added near the end.',
      contracts: [
        [set(3), set(3)],
        [set(3), run(4)],
        [run(4), run(4)],
        [set(3), set(3), set(3)],
        [set(3), set(3), run(4)],
        [set(3), run(4), run(4)],
        [set(3), set(3), set(3), set(3)],
        [run(4), run(4), run(4)]
      ]
    },
    {
      key: 'ten',
      name: 'Ten',
      blurb: 'Longer runs rather than more melds — a run of ten is the ' +
        'wall near the end.',
      contracts: [
        [set(3), set(3)],
        [set(3), run(4)],
        [run(4), run(4)],
        [set(3), set(3), set(3)],
        [set(3), run(7)],
        [set(3), set(3), run(5)],
        [run(4), run(4), run(4)],
        [set(3), run(10)],
        [set(3), set(3), set(3), run(5)],
        [run(5), run(5), run(5)]
      ]
    },
    {
      key: 'fifteen',
      name: 'Fifteen',
      blurb: 'The long game — widening melds, then five of them, and a ' +
        'pair to finish one hand off.',
      contracts: [
        [set(3), set(3)],
        [set(3), run(4)],
        [set(4), set(4)],
        [run(4), run(4)],
        [set(3), set(3), run(4)],
        [set(4), run(5)],
        [set(5), set(5)],
        [run(5), run(5)],
        [set(3), set(3), set(3), set(3)],
        [run(4), run(4), run(4)],
        [set(4), set(4), set(4)],
        [run(3), run(3), run(3), run(3), run(3)],
        [set(3), set(3), set(3), set(3), set(3)],
        [set(5), run(5), set(2)],
        [set(3), set(3), run(5)]
      ]
    }
  ];

  /*
   * What a round is worth, given what everybody was holding. The sheet
   * stores the hands, never the scores, so switching between these
   * re-scores the whole game instead of invalidating it. See _README.md.
   */
  const SCORINGS = [
    {
      key: 'penalty',
      name: 'Cards count against you',
      note: 'Whoever goes out scores nothing; everyone else scores what ' +
        'they were holding. Lowest total wins.',
      low: true,
      score: (left, i, out) => (i === out ? 0 : left[i])
    },
    {
      key: 'reward',
      name: 'Winner takes the table',
      note: 'Whoever goes out scores everything the others were holding, ' +
        'and the others score nothing. Highest total wins.',
      low: false,
      score: (left, i, out) => (i === out ? sum(left) : 0)
    },
    {
      key: 'swing',
      name: 'Winner takes, losers lose',
      note: 'Whoever goes out scores everything the others were holding, ' +
        'and they each go negative by their own. Highest total wins.',
      low: false,
      score: (left, i, out) => (i === out ? sum(left) : -left[i])
    }
  ];

  const $ = id => document.getElementById(id);
  const sum = list => list.reduce((a, b) => a + b, 0);
  const sequence = key => SEQUENCES.find(s => s.key === key) || SEQUENCES[0];
  const scoring = key => SCORINGS.find(s => s.key === key) || SCORINGS[0];

  /* A missing element warns rather than taking the page down: a service
     worker can pair one release's markup with the next one's script. */
  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
    else console.warn('Rummy: missing element for a ' + type + ' handler');
  }

  let state = null;
  let asking = null;      // which seat the number pad is editing
  let typed = '';         // what has been tapped into the pad so far
  let armed = null;       // "New game" waiting for its second tap
  let inputs = [];

  function blank() {
    return {
      players: ['', '', ''],
      nameMode: 'type',
      patterns: 'seven',
      rounds: 7,
      advance: 'together',
      scoring: 'penalty',
      // One entry per completed round: what each player was left holding.
      // `made` only matters when players advance on their own.
      rounds_played: [],
      draft: null
    };
  }

  function freshDraft(players) {
    return {
      left: new Array(players).fill(null),
      made: new Array(players).fill(false)
    };
  }

  function load() {
    const saved = Store.load(KEY);
    const s = blank();
    if (!saved || typeof saved !== 'object') {
      s.draft = freshDraft(s.players.length);
      return s;
    }

    const names = Array.isArray(saved.players) ? saved.players : [];
    const count = Math.min(MAX_PLAYERS,
      Math.max(MIN_PLAYERS, names.length || 3));
    s.players = [];
    for (let i = 0; i < count; i++) {
      s.players.push(typeof names[i] === 'string' ? names[i].slice(0, 16) : '');
    }

    s.nameMode = saved.nameMode === 'pick' ? 'pick' : 'type';
    s.patterns = SEQUENCES.some(q => q.key === saved.patterns)
      ? saved.patterns : 'seven';
    s.advance = saved.advance === 'earned' ? 'earned' : 'together';
    s.scoring = SCORINGS.some(q => q.key === saved.scoring)
      ? saved.scoring : 'penalty';
    s.rounds = roundsFor(s.patterns, saved.rounds);

    const played = Array.isArray(saved.rounds_played) ? saved.rounds_played : [];
    s.rounds_played = [];
    for (const round of played) {
      const clean = readRound(round, count);
      if (clean) s.rounds_played.push(clean);
    }

    s.draft = readDraft(saved.draft, count) || freshDraft(count);
    return s;
  }

  /** A stored round, or null if it is not one. */
  function readRound(round, count) {
    if (!round || typeof round !== 'object') return null;
    const raw = Array.isArray(round.left) ? round.left : null;
    if (!raw || raw.length !== count) return null;
    const left = [];
    for (const v of raw) {
      if (!Number.isInteger(v) || v < 0 || v > MAX_HAND) return null;
      left.push(v);
    }
    const madeRaw = Array.isArray(round.made) ? round.made : [];
    const made = [];
    for (let i = 0; i < count; i++) made.push(madeRaw[i] === true);
    return { left, made };
  }

  function readDraft(draft, count) {
    if (!draft || typeof draft !== 'object') return null;
    const raw = Array.isArray(draft.left) ? draft.left : null;
    if (!raw || raw.length !== count) return null;
    const left = [];
    for (const v of raw) {
      if (v === null) left.push(null);
      else if (Number.isInteger(v) && v >= 0 && v <= MAX_HAND) left.push(v);
      else return null;
    }
    const madeRaw = Array.isArray(draft.made) ? draft.made : [];
    const made = [];
    for (let i = 0; i < count; i++) made.push(madeRaw[i] === true);
    return { left, made };
  }

  /** The sequence length to play — clamped to what the sequence has. */
  function roundsFor(key, want) {
    const seq = sequence(key);
    const choices = roundChoices(key);
    if (Number.isInteger(want) && choices.indexOf(want) >= 0) return want;
    return seq.contracts.length || 7;
  }

  function roundChoices(key) {
    const seq = sequence(key);
    if (!seq.contracts.length) return PLAIN_ROUNDS;
    const out = [];
    // Never fewer than three — a two-deal contract game is not a game.
    for (let n = 3; n <= seq.contracts.length; n++) out.push(n);
    return out;
  }

  function save() {
    Store.save(KEY, state);
  }

  function name(i) {
    const given = String(state.players[i] || '').trim();
    return given || 'Player ' + (i + 1);
  }

  function hasPatterns() {
    return sequence(state.patterns).contracts.length > 0;
  }

  /** How a contract reads: "2 sets of 3 + 1 run of 4". */
  function contractText(melds) {
    if (!melds || !melds.length) return 'Anything you like';
    const groups = [];
    for (const m of melds) {
      const last = groups[groups.length - 1];
      if (last && last.kind === m.kind && last.n === m.n) last.count++;
      else groups.push({ kind: m.kind, n: m.n, count: 1 });
    }
    return groups.map(g => {
      if (g.kind === 'set' && g.n === 2) {
        return g.count + (g.count === 1 ? ' pair' : ' pairs');
      }
      const word = g.kind === 'set'
        ? (g.count === 1 ? 'set' : 'sets')
        : (g.count === 1 ? 'run' : 'runs');
      return g.count + ' ' + word + ' of ' + g.n;
    }).join(' + ');
  }

  /**
   * Which contract a seat is on for the round about to be played.
   * Playing together, that is just the round number; earning it, a seat
   * advances only on a round it completed.
   */
  function contractIndex(seat) {
    if (!hasPatterns()) return -1;
    if (state.advance !== 'earned') {
      return Math.min(state.rounds_played.length, state.rounds - 1);
    }
    let at = 0;
    for (const round of state.rounds_played) if (round.made[seat]) at++;
    return Math.min(at, state.rounds - 1);
  }

  /** Has anybody finished the last contract? Then the game is over. */
  function finished() {
    if (!hasPatterns()) return state.rounds_played.length >= state.rounds;
    if (state.advance !== 'earned') {
      return state.rounds_played.length >= state.rounds;
    }
    for (let i = 0; i < state.players.length; i++) {
      let done = 0;
      for (const round of state.rounds_played) if (round.made[i]) done++;
      if (done >= state.rounds) return true;
    }
    return false;
  }

  /** Who went out in a round: the one holding nothing, or -1 for nobody. */
  function outSeat(round) {
    return round.left.indexOf(0);
  }

  function roundScores(round) {
    const how = scoring(state.scoring);
    const out = outSeat(round);
    return state.players.map((unused, i) => how.score(round.left, i, out));
  }

  function totals() {
    const out = state.players.map(() => 0);
    for (const round of state.rounds_played) {
      const scores = roundScores(round);
      for (let i = 0; i < out.length; i++) out[i] += scores[i];
    }
    return out;
  }

  function leaders() {
    if (!state.rounds_played.length) return [];
    const all = totals();
    const low = scoring(state.scoring).low;
    const best = low ? Math.min(...all) : Math.max(...all);
    const marked = [];
    for (let i = 0; i < all.length; i++) if (all[i] === best) marked.push(i);
    return marked;
  }

  function cell(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderCard() {
    const table = $('card');
    const note = $('empty-note');
    if (!table) return;
    table.textContent = '';

    if (!state.rounds_played.length) {
      if (note) {
        note.hidden = false;
        note.textContent = hasPatterns()
          ? 'Deal the first hand. The pattern to beat is above.'
          : 'Deal the first hand.';
      }
      return;
    }
    if (note) note.hidden = true;

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.append(cell('th', 'rnd', ''));
    for (let i = 0; i < state.players.length; i++) {
      const th = cell('th', null, name(i));
      th.scope = 'col';
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);

    const body = document.createElement('tbody');
    for (let r = 0; r < state.rounds_played.length; r++) {
      const round = state.rounds_played[r];
      const scores = roundScores(round);
      const out = outSeat(round);
      const tr = document.createElement('tr');
      tr.append(cell('td', 'rnd', String(r + 1)));
      for (let i = 0; i < state.players.length; i++) {
        const td = cell('td', i === out ? 'went-out' : null, String(scores[i]));
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);

    const foot = document.createElement('tfoot');
    const footRow = document.createElement('tr');
    footRow.append(cell('td', 'rnd', ''));
    const all = totals();
    const ahead = leaders();
    for (let i = 0; i < state.players.length; i++) {
      const td = cell('td', null, String(all[i]));
      if (ahead.indexOf(i) >= 0) td.dataset.lead = '';
      footRow.append(td);
    }
    foot.append(footRow);
    table.append(foot);
  }

  function renderContract() {
    const no = $('contract-no');
    const what = $('contract-what');
    if (!no || !what) return;

    if (finished()) {
      const all = totals();
      const ahead = leaders();
      no.textContent = 'Final';
      what.textContent = ahead.map(i => name(i)).join(' and ') +
        ' ' + (ahead.length > 1 ? 'tie on ' : 'wins on ') + all[ahead[0]];
      return;
    }

    const n = state.rounds_played.length + 1;
    if (!hasPatterns()) {
      no.textContent = 'Round ' + n + ' of ' + state.rounds;
      what.textContent = 'Anything you like';
      return;
    }

    if (state.advance === 'earned') {
      no.textContent = 'Round ' + n;
      // Everyone can be on a different contract, so the banner names the
      // spread and the entry rows carry each player's own.
      const at = state.players.map((unused, i) => contractIndex(i));
      const lowest = Math.min(...at);
      const highest = Math.max(...at);
      const seq = sequence(state.patterns).contracts;
      what.textContent = lowest === highest
        ? contractText(seq[lowest])
        : 'Patterns ' + (lowest + 1) + '–' + (highest + 1) + ' — see below';
      return;
    }

    const idx = contractIndex(0);
    no.textContent = 'Round ' + n + ' of ' + state.rounds;
    what.textContent = contractText(sequence(state.patterns).contracts[idx]);
  }

  function renderEntry() {
    const wrap = $('hands');
    const go = $('score');
    const entry = $('entry');
    const label = $('entry-label');
    const undo = $('undo');
    if (undo) undo.disabled = !state.rounds_played.length;

    if (!wrap) return;
    if (entry) entry.hidden = false;

    if (finished()) {
      wrap.textContent = '';
      const done = cell('p', 'setting-note',
        'That is the game. Undo the last round to carry on, or start a new one.');
      done.style.margin = '0';
      wrap.append(done);
      if (go) { go.hidden = true; }
      if (label) label.textContent = 'Game over';
      return;
    }
    if (go) go.hidden = false;
    if (label) label.textContent = 'Points left in hand';

    wrap.textContent = '';
    const seq = sequence(state.patterns).contracts;
    const perSeat = hasPatterns() && state.advance === 'earned';

    for (let i = 0; i < state.players.length; i++) {
      const row = cell('div', 'hand');

      const who = cell('div', 'hand-name');
      who.textContent = perSeat
        ? name(i) + ' · ' + contractText(seq[contractIndex(i)])
        : name(i);
      if (state.draft.left[i] === 0) who.dataset.out = '';
      row.append(who);

      const value = cell('button', 'hand-left');
      value.type = 'button';
      const got = state.draft.left[i];
      if (got === null) {
        value.textContent = '–';
        value.dataset.unset = '';
        value.setAttribute('aria-label', 'Set points left for ' + name(i));
      } else {
        value.textContent = String(got);
        value.setAttribute('aria-label',
          name(i) + ': ' + got + ' points left. Change.');
      }
      value.dataset.seat = String(i);
      on(value, 'click', () => openPad(i));
      row.append(value);

      if (perSeat) {
        const made = cell('button', 'hand-made', 'Made it');
        made.type = 'button';
        made.setAttribute('aria-pressed', state.draft.made[i] ? 'true' : 'false');
        made.setAttribute('aria-label', name(i) + ' made the pattern');
        on(made, 'click', () => {
          state.draft.made[i] = !state.draft.made[i];
          save();
          renderEntry();
        });
        row.append(made);
      } else {
        row.append(cell('span'));
      }

      wrap.append(row);
    }

    if (go) go.disabled = !ready();
  }

  /** Every hand has a number in it. Nobody on zero is allowed. */
  function ready() {
    return state.draft.left.every(v => v !== null);
  }

  function render() {
    document.body.dataset.nameMode = state.nameMode;
    renderContract();
    renderCard();
    renderEntry();
  }

  function say(text) {
    const node = $('say');
    if (node) node.textContent = text;
  }

  /* ---- the number pad ---- */

  function buildPad() {
    const pad = $('pad');
    if (!pad) return;
    pad.textContent = '';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
    for (const key of keys) {
      const b = document.createElement('button');
      b.type = 'button';
      if (key === 'clear') { b.textContent = 'C'; b.setAttribute('aria-label', 'Clear'); }
      else if (key === 'back') { b.textContent = '⌫'; b.setAttribute('aria-label', 'Backspace'); }
      else b.textContent = key;
      on(b, 'click', () => tapPad(key));
      pad.append(b);
    }
  }

  function tapPad(key) {
    if (key === 'clear') typed = '';
    else if (key === 'back') typed = typed.slice(0, -1);
    else if (typed.length < 3) typed = (typed === '0' ? '' : typed) + key;
    showPad();
  }

  function showPad() {
    const node = $('pad-value');
    if (node) node.textContent = typed === '' ? '0' : typed;
  }

  function openPad(seat) {
    asking = seat;
    const got = state.draft.left[seat];
    typed = got === null || got === 0 ? '' : String(got);
    showPad();
    const title = $('picker-title');
    if (title) title.textContent = name(seat) + ' — points left';
    if (padSheet) padSheet.open();
  }

  function closePad() {
    if (asking === null) return;
    const value = typed === '' ? 0 : Math.min(MAX_HAND, Number(typed));
    state.draft.left[asking] = value;
    // Going out is making the pattern, so the tick follows the zero
    // rather than asking twice for the same fact.
    if (value === 0) state.draft.made[asking] = true;
    asking = null;
    save();
    renderEntry();
  }

  /* ---- committing a round ---- */

  function commit() {
    if (finished() || !ready()) return;
    const left = state.draft.left.slice();
    const made = state.draft.made.slice();
    const out = left.indexOf(0);
    // Whoever went out made their pattern by definition; everyone else
    // keeps whatever was ticked, which is only read when seats advance
    // on their own.
    if (out >= 0) made[out] = true;
    if (!hasPatterns() || state.advance !== 'earned') {
      for (let i = 0; i < made.length; i++) made[i] = i === out;
    }

    state.rounds_played.push({ left, made });
    state.draft = freshDraft(state.players.length);
    save();
    render();
    say(out >= 0
      ? name(out) + ' went out. Round ' + state.rounds_played.length + ' scored.'
      : 'Round ' + state.rounds_played.length + ' scored with nobody out.');
    const wrap = document.querySelector('.card-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function undoRound() {
    if (!state.rounds_played.length) return;
    state.rounds_played.pop();
    state.draft = freshDraft(state.players.length);
    save();
    render();
    say('Last round undone.');
  }

  /* ---- settings ---- */

  function setPlayers(count) {
    const next = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, count));
    const was = state.players.length;
    if (next === was) return;

    const names = state.players.slice(0, next);
    while (names.length < next) names.push('');
    state.players = names;

    // Rounds already played are re-shaped rather than thrown away: adding
    // a seat gives the newcomer zeroes, removing one drops their column.
    for (const round of state.rounds_played) {
      round.left = sizedHands(round.left, next);
      round.made = sizedFlags(round.made, next);
    }
    state.draft = freshDraft(next);
    inputs = [];
    save();
  }

  function sizedHands(list, length) {
    const out = new Array(length).fill(0);
    for (let i = 0; i < length && i < list.length; i++) out[i] = list[i];
    return out;
  }

  function sizedFlags(list, length) {
    const out = new Array(length).fill(false);
    for (let i = 0; i < length && i < list.length; i++) out[i] = list[i] === true;
    return out;
  }

  function buildCounts() {
    const row = $('count-row');
    if (!row) return;
    row.textContent = '';
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const b = cell('button', 'count', String(n));
      b.type = 'button';
      b.dataset.count = String(n);
      on(b, 'click', () => {
        setPlayers(n);
        buildNameInputs();
        renderRecent();
        render();
        renderSettings();
      });
      row.append(b);
    }
  }

  function buildPatterns() {
    const row = $('patterns-row');
    if (!row) return;
    row.textContent = '';
    for (const seq of SEQUENCES) {
      const b = cell('button', 'pick', seq.name);
      b.type = 'button';
      b.dataset.patterns = seq.key;
      on(b, 'click', () => {
        state.patterns = seq.key;
        // Picking a sequence means wanting all of it. "How many" is the
        // deliberate trim, so it starts again from the full length rather
        // than carrying a number chosen for a different sequence.
        state.rounds = roundsFor(seq.key, null);
        save();
        buildRounds();
        render();
        renderSettings();
        renderRules();
      });
      row.append(b);
    }
  }

  function buildRounds() {
    const row = $('rounds-row');
    if (!row) return;
    row.textContent = '';
    for (const n of roundChoices(state.patterns)) {
      const b = cell('button', 'count', String(n));
      b.type = 'button';
      b.dataset.rounds = String(n);
      on(b, 'click', () => {
        state.rounds = n;
        save();
        render();
        renderSettings();
        renderRules();
      });
      row.append(b);
    }
  }

  function buildScorings() {
    const row = $('scoring-row');
    if (!row) return;
    row.textContent = '';
    for (const how of SCORINGS) {
      const b = cell('button', 'pick', how.name);
      b.type = 'button';
      b.dataset.scoring = how.key;
      on(b, 'click', () => {
        state.scoring = how.key;
        save();
        render();
        renderSettings();
      });
      row.append(b);
    }
  }

  function renderSettings() {
    for (const b of document.querySelectorAll('#count-row .count')) {
      b.setAttribute('aria-pressed',
        Number(b.dataset.count) === state.players.length ? 'true' : 'false');
    }
    for (const b of document.querySelectorAll('#patterns-row .pick')) {
      b.setAttribute('aria-pressed',
        b.dataset.patterns === state.patterns ? 'true' : 'false');
    }
    for (const b of document.querySelectorAll('#rounds-row .count')) {
      b.setAttribute('aria-pressed',
        Number(b.dataset.rounds) === state.rounds ? 'true' : 'false');
    }
    for (const b of document.querySelectorAll('#advance-row .pick')) {
      b.setAttribute('aria-pressed',
        b.dataset.advance === state.advance ? 'true' : 'false');
    }
    for (const b of document.querySelectorAll('#scoring-row .pick')) {
      b.setAttribute('aria-pressed',
        b.dataset.scoring === state.scoring ? 'true' : 'false');
    }
    for (const b of document.querySelectorAll('#name-mode-row .pick')) {
      b.setAttribute('aria-pressed',
        b.dataset.nameMode === state.nameMode ? 'true' : 'false');
    }

    const note = $('patterns-note');
    if (note) note.textContent = sequence(state.patterns).blurb;
    const how = $('scoring-note');
    if (how) how.textContent = scoring(state.scoring).note;

    // Both of these only mean anything when there are patterns to move
    // through, so they go away rather than sitting there inert.
    const roundsField = $('rounds-field');
    const advanceField = $('advance-field');
    if (roundsField) {
      roundsField.hidden = false;
      const label = $('label-rounds');
      if (label) label.textContent = hasPatterns() ? 'How many' : 'Rounds';
    }
    if (advanceField) advanceField.hidden = !hasPatterns();

    const adv = $('advance-note');
    if (adv) {
      adv.textContent = state.advance === 'earned'
        ? 'A player who misses the pattern meets it again next deal while ' +
          'the others move on, so the game runs until somebody finishes ' +
          'the last one.'
        : 'Everyone plays the same pattern each deal, whether or not they ' +
          'made the last one.';
    }
  }

  function renderRules() {
    const intro = $('rules-patterns');
    const list = $('rules-list');
    if (!intro || !list) return;
    const seq = sequence(state.patterns);
    list.textContent = '';
    if (!seq.contracts.length) {
      intro.textContent = 'Patterns are off, so there is nothing to meet ' +
        'before melding. Turn them on in settings for a contract game.';
      return;
    }
    intro.textContent = 'Each deal has a pattern you must put down before ' +
      'you may meld at all. A set is cards of the same rank; a run is ' +
      'consecutive cards of one suit. Playing the first ' + state.rounds +
      ' of ' + seq.contracts.length + ':';
    for (let i = 0; i < state.rounds; i++) {
      list.append(cell('li', null, contractText(seq.contracts[i])));
    }
  }

  /* ---- names ---- */

  function buildNameInputs() {
    const wrap = $('name-inputs');
    if (!wrap) return;
    if (inputs.length !== state.players.length) {
      wrap.textContent = '';
      inputs = [];
      for (let i = 0; i < state.players.length; i++) {
        const box = document.createElement('input');
        box.className = 'name-input';
        box.id = 'name-' + i;
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

  function renderRecent() {
    const wrap = $('recent-list');
    if (!wrap) return;
    const chosen = new Set(state.players
      .map(n => String(n).trim().toLowerCase()).filter(Boolean));
    const list = Names.recent();
    wrap.textContent = '';
    if (!list.length) {
      wrap.append(cell('p', 'recent-empty',
        'Nobody yet — type some names and they will be here next time.'));
      return;
    }
    for (const person of list) {
      const b = cell('button', 'recent', person);
      b.type = 'button';
      b.dataset.name = person;
      b.setAttribute('aria-pressed', chosen.has(person.toLowerCase()) ? 'true' : 'false');
      on(b, 'click', () => toggleRecent(person));
      wrap.append(b);
    }
  }

  function toggleRecent(person) {
    const named = state.players.map(n => String(n).trim()).filter(Boolean);
    const at = named.findIndex(n => n.toLowerCase() === person.toLowerCase());
    if (at !== -1) named.splice(at, 1);
    else named.push(person);

    setPlayers(Math.max(MIN_PLAYERS, named.length));
    for (let i = 0; i < state.players.length; i++) state.players[i] = named[i] || '';
    inputs = [];
    buildNameInputs();
    save();
    render();
    renderSettings();
    renderRecent();
  }

  /* ---- wiring ---- */

  state = load();

  // The pad writes its value back whichever way it is dismissed — Done,
  // the scrim or Escape — so a tapped number is never silently dropped.
  const padSheet = Modal.create($('picker'), { onClose: closePad });
  Modal.create($('settings'), { trigger: $('settings-btn') });
  Modal.create($('rules'), { trigger: $('rules-btn'), onOpen: renderRules });

  buildPad();
  buildCounts();
  buildPatterns();
  buildRounds();
  buildScorings();
  buildNameInputs();
  renderRecent();

  on($('score'), 'click', commit);
  on($('undo'), 'click', undoRound);

  for (const b of document.querySelectorAll('#name-mode-row .pick')) {
    on(b, 'click', () => {
      state.nameMode = b.dataset.nameMode === 'pick' ? 'pick' : 'type';
      save();
      render();
      renderSettings();
    });
  }

  for (const b of document.querySelectorAll('#advance-row .pick')) {
    on(b, 'click', () => {
      state.advance = b.dataset.advance === 'earned' ? 'earned' : 'together';
      save();
      render();
      renderSettings();
    });
  }

  // New game asks twice and disarms itself: a scored game is a lot of taps
  // to lose to a stray one, and a timeout leaves the card safe.
  const newBtn = $('new-btn');
  on(newBtn, 'click', () => {
    if (!armed) {
      newBtn.textContent = 'Clear all?';
      armed = setTimeout(() => {
        armed = null;
        newBtn.textContent = 'New game';
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    newBtn.textContent = 'New game';
    state.rounds_played = [];
    state.draft = freshDraft(state.players.length);
    save();
    render();
    say('New game.');
  });

  render();
  renderSettings();
  renderRules();
})();
