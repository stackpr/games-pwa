// Forbidden Words: describe the term without its related words.
// See _README.md for the rules and the naming note.
(function () {
  const STORAGE_KEY = 'games.forbidden-words.v1';
  const SECONDS = [45, 60, 90, 120];

  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'span');
  }

  const el = {
    body: document.body,
    setup: pick('setup'),
    setupBtn: pick('setup-btn', 'button'),
    modeRow: pick('mode-row'),
    countRow: pick('count-row'),
    secsRow: pick('secs-row'),
    catGrid: pick('cat-grid'),
    catCount: pick('cat-count'),
    catAll: pick('cat-all', 'button'),
    catNone: pick('cat-none', 'button'),
    begin: pick('begin', 'button'),
    readyWho: pick('ready-who'),
    readySub: pick('ready-sub'),
    start: pick('start', 'button'),
    playWho: pick('play-who'),
    clock: pick('clock'),
    roundTally: pick('round-tally'),
    cardCat: pick('card-cat'),
    cardWord: pick('card-word'),
    banned: pick('banned'),
    got: pick('got', 'button'),
    skip: pick('skip', 'button'),
    foul: pick('foul', 'button'),
    overLabel: pick('over-label'),
    overScore: pick('over-score'),
    board: pick('board'),
    next: pick('next', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  const saved = Store.load(STORAGE_KEY) || {};
  const settings = PartySetup.shape(saved.settings, SECONDS);
  let party = Party.shape(saved.party);
  // The deck is dealt through and only reshuffled when it runs out, so a
  // term cannot come round twice while there are unseen ones left.
  let deck = [];
  let at = 0;
  let card = null;
  let roundScore = 0;

  function save() {
    Store.save(STORAGE_KEY, { settings, party });
  }

  function screen(name) {
    el.body.dataset.screen = name;
  }

  const setup = PartySetup.create({
    el: {
      modeRow: el.modeRow, countRow: el.countRow, secsRow: el.secsRow,
      catGrid: el.catGrid, catCount: el.catCount,
      all: el.catAll, none: el.catNone, begin: el.begin
    },
    seconds: SECONDS,
    settings,
    onChange: save
  });

  // Rebuilt per round, because the round length is a setting and a Timer
  // takes its length once, at creation.
  let timer = Timer.create(el.clock, { seconds: settings.seconds, onEnd: endRound });

  function draw() {
    if (at >= deck.length) {
      deck = Vocab.deck(settings.categories);
      at = 0;
    }
    card = deck[at++] || null;
    renderCard();
  }

  function renderCard() {
    if (!card) return;
    el.cardCat.textContent = card.category;
    el.cardWord.textContent = card.word;
    el.banned.textContent = '';
    const head = document.createElement('li');
    head.className = 'banned-head';
    head.setAttribute('aria-hidden', 'true');
    head.textContent = 'Do not say';
    el.banned.append(head);
    for (const word of card.related) {
      const li = document.createElement('li');
      li.textContent = word;
      el.banned.append(li);
    }
  }

  function seatName(i) {
    return party.names[i] || Party.defaultName(party.mode, i);
  }

  /** Teams get the shared player colours; a table of players does not. */
  function seatToken(i) {
    return party.mode === 'teams' ? String(i + 1) : '';
  }

  function renderReady() {
    const r = Party.roles(party);
    el.readyWho.textContent = seatName(r.present);
    el.readyWho.dataset.seat = seatToken(r.present);
    el.readySub.textContent = r.guess === null
      ? 'describes. Everyone else guesses.'
      : 'describes to ' + seatName(r.guess) + '. Both of them score.';
    el.playWho.textContent = r.guess === null
      ? seatName(r.present)
      : seatName(r.present) + ' → ' + seatName(r.guess);
  }

  function renderBoard() {
    const scoring = Party.scoring(party);
    el.board.textContent = '';
    for (let i = 0; i < party.scores.length; i++) {
      const li = document.createElement('li');
      li.dataset.seat = seatToken(i);
      if (scoring.indexOf(i) !== -1) li.dataset.up = '';
      const name = document.createElement('span');
      name.className = 'board-name';
      name.textContent = seatName(i);
      const score = document.createElement('span');
      score.className = 'board-score';
      score.textContent = String(party.scores[i]);
      li.append(name, score);
      el.board.append(li);
    }
  }

  function beginRound() {
    roundScore = 0;
    el.roundTally.textContent = '0';
    renderReady();
    screen('play');
    draw();
    timer.stop();
    timer = Timer.create(el.clock, { seconds: settings.seconds, onEnd: endRound });
    timer.start();
  }

  function score(points) {
    if (el.body.dataset.screen !== 'play') return;
    roundScore += points;
    el.roundTally.textContent = String(roundScore);
    draw();
  }

  function endRound() {
    timer.stop();
    Party.award(party, roundScore);
    const who = Party.scoring(party).map(seatName).join(' and ');
    el.overLabel.textContent = 'Time! ' + who;
    el.overScore.textContent = (roundScore > 0 ? '+' : '') + roundScore;
    Party.advance(party);
    renderBoard();
    save();
    screen('over');
  }

  el.begin.addEventListener('click', () => {
    if (!Vocab.pool(settings.categories).length) return;
    // A change of mode or player count is a different set of seats, so the
    // scores start over rather than being carried onto seats that moved.
    const want = settings.mode === 'teams' ? Party.TEAMS : settings.players;
    if (party.mode !== settings.mode || party.scores.length !== want) {
      party = Party.blank(settings.mode, settings.players);
    }
    deck = Vocab.deck(settings.categories);
    at = 0;
    save();
    renderReady();
    renderBoard();
    screen('ready');
  });

  el.setupBtn.addEventListener('click', () => {
    timer.stop();
    setup.render();
    screen('setup');
  });

  el.start.addEventListener('click', beginRound);
  el.next.addEventListener('click', () => {
    renderReady();
    screen('ready');
  });
  el.got.addEventListener('click', () => score(1));
  el.skip.addEventListener('click', () => score(0));
  el.foul.addEventListener('click', () => score(-1));

  Modal.create(el.rules, { trigger: el.rulesBtn });

  setup.render();
  renderBoard();
  screen('setup');
})();
