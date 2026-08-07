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
    nameModeRow: pick('name-mode-row'),
    nameInputs: pick('name-inputs'),
    recentList: pick('recent-list'),
    whoRow: pick('who-row'),
    whoGrid: pick('who-grid'),
    whoSkip: pick('who-skip', 'button'),

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
  // Only the first card of a round is covered; see draw().
  let covered = true;
  let timer = Timer.create(el.clock, { seconds: settings.seconds, onEnd: endRound });

  function save() {
    Store.save(STORAGE_KEY, { settings, party });
  }

  const panel = GuessPanel.create({
    el: {
      whoGrid: el.whoGrid, whoSkip: el.whoSkip, board: el.board,
      got: el.got, skip: el.skip
    },
    onScore: (points, seat) => score(points, seat === null ? undefined : seat)
  });

  function screen(name) {
    el.body.dataset.screen = name;
  }

  /**
   * Seats follow the settings the moment they change, rather than at Start.
   * A name typed into setup has to land on the party that will actually
   * play, and rebuilding at Start threw those names away.
   *
   * The scores start over whenever the shape changes, because a score left
   * on a seat that moved is worse than no score. Names carry across a change
   * of player count but not a change of mode: "Team 1" is not a person.
   */
  function syncSeats() {
    const want = settings.mode === 'teams' ? Party.TEAMS : settings.players;
    if (party.mode === settings.mode && party.scores.length === want) return;
    const kept = party.mode === settings.mode ? party.names.slice() : [];
    party = Party.blank(settings.mode, settings.players);
    for (let i = 0; i < party.names.length; i++) {
      if (kept[i]) party.names[i] = kept[i];
    }
  }

  const setup = PartySetup.create({
    el: {
      modeRow: el.modeRow, countRow: el.countRow, secsRow: el.secsRow,
      catGrid: el.catGrid, catCount: el.catCount,
      all: el.catAll, none: el.catNone, begin: el.begin,
      nameModeRow: el.nameModeRow, nameInputs: el.nameInputs,
      recentList: el.recentList
    },
    seconds: SECONDS,
    settings,
    onChange: () => { syncSeats(); save(); },
    // The names live on the party, which is rebuilt when the seats change,
    // so the editor asks for them rather than holding a stale reference.
    names: () => party.names
  });

  /**
   * The **first** card of a round is covered: the phone has just been handed
   * over and the room is still looking at it. After that every card arrives
   * face up, because by then the player has the screen to themselves and a
   * tap-to-reveal between every word is a tap that buys nothing and costs
   * seconds off a running clock. See _README.md.
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
    if (covered) el.card.dataset.hidden = '';
    else delete el.card.dataset.hidden;
  }

  function seatName(i) {
    return Party.nameAt(party, i);
  }

  function renderReady() {
    const r = Party.roles(party);
    // The board goes first: the panel works out the seat token, so it has
    // to have been handed the party before the ready line asks for one.
    renderBoard();
    el.readyWho.textContent = seatName(r.present);
    el.readyWho.dataset.seat = panel.seatToken(r.present);
    el.readySub.textContent = party.mode === 'teams'
      ? 'is up. Everyone else guesses.'
      : 'is up. Whoever gets it scores, and so do they.';
    el.playWho.textContent = seatName(r.present);
  }


  /**
   * The panel owns what the two scoring modes look like — the name buttons,
   * the board and the colours — and this hands it the state to draw. See
   * js/lib/guess.js.
   */
  function renderBoard() {
    panel.render({
      mode: party.mode,
      names: party.scores.map((_, i) => seatName(i)),
      scores: party.scores,
      present: Party.roles(party).present,
      up: Party.scoring(party)
    });
  }

  function beginRound() {
    roundScore = 0;
    covered = true;
    el.roundTally.textContent = '0';
    renderReady();
    screen('play');
    draw();
    timer.stop();
    timer = Timer.create(el.clock, { seconds: settings.seconds, onEnd: endRound });
    timer.start();
  }

  /**
   * Solo mode pays out per card, because the point belongs to the seat that
   * was named at that moment. Teams mode banks the round total at the end,
   * where there is only one side it could have gone to anyway.
   */
  function score(points, seat) {
    if (el.body.dataset.screen !== 'play') return;
    roundScore += points;
    el.roundTally.textContent = String(roundScore);
    if (party.mode !== 'teams') {
      Party.award(party, points, seat);
      renderBoard();
      save();
    }
    draw();
  }

  function endRound() {
    timer.stop();
    if (party.mode === 'teams') Party.award(party, roundScore);
    const who = seatName(Party.roles(party).present);
    el.overLabel.textContent = 'Time! ' + who;
    el.overScore.textContent = (roundScore > 0 ? '+' : '') + roundScore;
    Party.advance(party);
    renderBoard();
    save();
    screen('over');
  }

  el.begin.addEventListener('click', () => {
    if (!Vocab.pool(settings.categories).length) return;
    syncSeats();
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
    covered = false;
    delete el.card.dataset.hidden;
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  setup.render();
  renderBoard();
  screen('setup');
})();
