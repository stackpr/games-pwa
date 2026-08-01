// Star Words: draw the term, no letters and no talking. See _README.md.
(function () {
  const STORAGE_KEY = 'games.star-words.v1';
  const SECONDS = [60, 90, 120, 180];

  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'span');
  }

  const el = {
    body: document.body,
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
    card: pick('card'),
    cardCat: pick('card-cat'),
    cardWord: pick('card-word'),
    reveal: pick('reveal', 'button'),
    got: pick('got', 'button'),
    skip: pick('skip', 'button'),
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
  let deck = [];
  let at = 0;
  let card = null;
  let roundScore = 0;
  let timer = Timer.create(el.clock, { seconds: settings.seconds, onEnd: endRound });

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

  /**
   * Every card starts covered. The phone sits face-up while somebody draws,
   * so a word that simply appeared would be read by the room before the
   * drawer had covered it.
   */
  function draw() {
    if (at >= deck.length) {
      deck = Vocab.deck(settings.categories);
      at = 0;
    }
    card = deck[at++] || null;
    if (card) {
      el.cardCat.textContent = card.category;
      el.cardWord.textContent = card.word;
    }
    el.card.dataset.hidden = '';
  }

  function seatName(i) {
    return party.names[i] || Party.defaultName(party.mode, i);
  }

  function seatToken(i) {
    return party.mode === 'teams' ? String(i + 1) : '';
  }

  function renderReady() {
    const r = Party.roles(party);
    el.readyWho.textContent = seatName(r.present);
    el.readyWho.dataset.seat = seatToken(r.present);
    el.readySub.textContent = r.guess === null
      ? 'draws. Everyone else guesses.'
      : 'draws for ' + seatName(r.guess) + '. Both of them score.';
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
  el.reveal.addEventListener('click', () => {
    delete el.card.dataset.hidden;
  });
  el.got.addEventListener('click', () => score(1));
  el.skip.addEventListener('click', () => score(0));

  Modal.create(el.rules, { trigger: el.rulesBtn });

  setup.render();
  renderBoard();
  screen('setup');
})();
