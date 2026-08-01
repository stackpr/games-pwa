// Somewhere Between: guess where a hidden target sits on a scale.
// See _README.md for the rules and the naming note.
(function () {
  const STORAGE_KEY = 'games.somewhere-between.v1';
  // Half-widths of the scoring bands, as a percentage of the whole scale.
  // 4 points is a narrow bullseye; 2 is generous enough that a sensible
  // clue is nearly always worth something.
  const BANDS = [
    { points: 4, half: 4 },
    { points: 3, half: 9 },
    { points: 2, half: 16 }
  ];
  // The target never sits against an end, where half its band would fall off
  // the scale and the round would be unwinnable at full marks.
  const EDGE = 18;

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
    catGrid: pick('cat-grid'),
    catCount: pick('cat-count'),
    catAll: pick('cat-all', 'button'),
    catNone: pick('cat-none', 'button'),
    begin: pick('begin', 'button'),
    nameModeRow: pick('name-mode-row'),
    nameInputs: pick('name-inputs'),
    recentList: pick('recent-list'),
    whoGrid: pick('who-grid'),
    readyWho: pick('ready-who'),
    readySub: pick('ready-sub'),
    start: pick('start', 'button'),
    playWho: pick('play-who'),
    roundNo: pick('round-no'),
    scoreSoFar: pick('score-so-far'),
    clueCat: pick('clue-cat'),
    clueWord: pick('clue-word'),
    peek: pick('peek', 'button'),
    endLeft: pick('end-left'),
    endRight: pick('end-right'),
    track: pick('track'),
    band2: pick('band-2'),
    band3: pick('band-3'),
    band4: pick('band-4'),
    target: pick('target'),
    guess: pick('guess'),
    grab: pick('grab'),
    dialHint: pick('dial-hint'),
    newScale: pick('new-scale', 'button'),
    lock: pick('lock', 'button'),
    overLabel: pick('over-label'),
    overScore: pick('over-score'),
    board: pick('board'),
    next: pick('next', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  const saved = Store.load(STORAGE_KEY) || {};
  const settings = PartySetup.shape(saved.settings, [60]);
  let party = Party.shape(saved.party);
  let deck = [];
  let at = 0;
  let scales = [];
  let scaleAt = 0;
  let scale = null;
  let clue = null;
  let target = 50;
  let guess = 50;
  // Solo mode credits a named seat alongside the clue-giver; null until
  // somebody is picked, and reset with every scale.
  let credited = null;

  function save() {
    Store.save(STORAGE_KEY, { settings, party });
  }

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
      modeRow: el.modeRow, countRow: el.countRow,
      catGrid: el.catGrid, catCount: el.catCount,
      all: el.catAll, none: el.catNone, begin: el.begin,
      nameModeRow: el.nameModeRow, nameInputs: el.nameInputs,
      recentList: el.recentList
    },
    seconds: [60],
    settings,
    onChange: () => { syncSeats(); save(); },
    names: () => party.names
  });

  function seatName(i) {
    return Party.nameAt(party, i);
  }

  function seatToken(i) {
    return party.mode === 'teams' ? String(i + 1) : '';
  }

  /** Points for a guess: the narrowest band it falls inside, or nothing. */
  function scoreFor(g) {
    const off = Math.abs(g - target);
    for (const band of BANDS) {
      if (off <= band.half) return band.points;
    }
    return 0;
  }

  function dealScale() {
    credited = null;
    buildWho();
    delete el.body.dataset.revealed;
    el.lock.textContent = 'Lock it in';
    el.dialHint.textContent = 'Drag the marker, then lock it in.';
    if (scaleAt >= scales.length) {
      scales = Vocab.spectrums();
      scaleAt = 0;
    }
    if (at >= deck.length) {
      deck = Vocab.deck(settings.categories);
      at = 0;
    }
    scale = scales[scaleAt++] || { left: 'Cold', right: 'Hot' };
    clue = deck[at++] || null;
    target = EDGE + Math.random() * (100 - 2 * EDGE);
    guess = 50;
    delete el.body.dataset.peek;
    renderScale();
  }

  function place(node, percent) {
    node.style.left = percent + '%';
  }

  function renderScale() {
    el.endLeft.textContent = scale.left;
    el.endRight.textContent = scale.right;
    el.clueCat.textContent = clue ? clue.category : '';
    el.clueWord.textContent = clue ? clue.word : '';

    for (const band of BANDS) {
      const node = band.points === 4 ? el.band4 : band.points === 3 ? el.band3 : el.band2;
      node.style.left = Math.max(0, target - band.half) + '%';
      node.style.width = (Math.min(100, target + band.half)
        - Math.max(0, target - band.half)) + '%';
      node.style.borderRadius = band.points === 2 ? '999px' : '0';
    }
    place(el.target, target);
    renderGuess();
  }

  function renderGuess() {
    place(el.guess, guess);
    place(el.grab, guess);
    // aria-valuetext, not aria-valuenow alone: a screen reader saying "62"
    // would hand over the number the sighted players deliberately do not get.
    el.track.setAttribute('aria-valuenow', String(Math.round(guess)));
    el.track.setAttribute('aria-valuetext', describe(guess));
  }

  function describe(g) {
    if (g < 10) return 'hard against ' + scale.left;
    if (g < 30) return 'well towards ' + scale.left;
    if (g < 45) return 'a little towards ' + scale.left;
    if (g <= 55) return 'halfway';
    if (g <= 70) return 'a little towards ' + scale.right;
    if (g <= 90) return 'well towards ' + scale.right;
    return 'hard against ' + scale.right;
  }

  function fromEvent(event) {
    const box = el.track.getBoundingClientRect();
    const x = (event.touches ? event.touches[0].clientX : event.clientX) - box.left;
    return Math.min(100, Math.max(0, (x / box.width) * 100));
  }

  function drag(event) {
    if (el.body.dataset.screen !== 'play') return;
    event.preventDefault();
    guess = fromEvent(event);
    renderGuess();
  }

  /** In solo mode, who placed the marker. Teams mode needs no such button. */
  function buildWho() {
    el.whoGrid.textContent = '';
    if (party.mode === 'teams') return;
    for (const seat of Party.guessers(party)) {
      const b = document.createElement('button');
      b.className = 'who-btn';
      b.type = 'button';
      b.dataset.seat = String(seat);
      b.textContent = seatName(seat);
      b.setAttribute('aria-pressed', credited === seat ? 'true' : 'false');
      b.setAttribute('aria-label', seatName(seat) + ' placed the marker');
      b.addEventListener('click', () => {
        credited = credited === seat ? null : seat;
        buildWho();
      });
      el.whoGrid.append(b);
    }
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

  function renderReady() {
    const r = Party.roles(party);
    el.readyWho.textContent = seatName(r.present);
    el.readyWho.dataset.seat = seatToken(r.present);
    el.readySub.textContent = party.mode === 'teams'
      ? 'gives the clue. Everyone else guesses.'
      : 'gives the clue. Whoever placed the marker scores, and so do they.';
    el.playWho.textContent = seatName(r.present);
    buildWho();
    el.roundNo.textContent = '#' + (party.round + 1);
    el.scoreSoFar.textContent = String(party.scores[r.present]);
  }

  /**
   * The first tap reveals: the bands and the target appear against the
   * marker that is still sitting where the table put it, which is the whole
   * payoff of the round. Leaving for the scoreboard straight away would
   * take that away before anyone had looked at it. The second tap leaves.
   */
  function lockIn() {
    if (el.body.dataset.screen !== 'play') return;
    if (el.body.dataset.revealed !== undefined) {
      screen('over');
      return;
    }
    const points = scoreFor(guess);
    Party.award(party, points, credited);
    const who = party.mode === 'teams'
      ? seatName(Party.roles(party).present)
      : seatName(Party.roles(party).present)
        + (credited === null ? '' : ' and ' + seatName(credited));
    el.overLabel.textContent = points ? who : 'Missed it — ' + who;
    el.overScore.textContent = '+' + points;
    el.dialHint.textContent = points
      ? '+' + points + ' to ' + who
      : 'Nothing that time — ' + who;
    Party.advance(party);
    renderBoard();
    save();
    el.body.dataset.revealed = '';
    el.lock.textContent = 'Scores';
  }

  el.begin.addEventListener('click', () => {
    if (!Vocab.pool(settings.categories).length) return;
    syncSeats();
    deck = Vocab.deck(settings.categories);
    at = 0;
    scales = Vocab.spectrums();
    scaleAt = 0;
    save();
    renderReady();
    renderBoard();
    screen('ready');
  });

  el.setupBtn.addEventListener('click', () => {
    setup.render();
    screen('setup');
  });

  el.start.addEventListener('click', () => {
    renderReady();
    dealScale();
    screen('play');
  });
  el.next.addEventListener('click', () => {
    renderReady();
    screen('ready');
  });
  el.newScale.addEventListener('click', dealScale);
  el.peek.addEventListener('click', () => {
    el.body.dataset.peek = '';
  });
  el.lock.addEventListener('click', lockIn);

  el.track.addEventListener('pointerdown', event => {
    el.track.setPointerCapture(event.pointerId);
    drag(event);
  });
  el.track.addEventListener('pointermove', event => {
    if (event.buttons) drag(event);
  });
  el.track.addEventListener('keydown', event => {
    const by = event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0;
    if (!by) return;
    event.preventDefault();
    guess = Math.min(100, Math.max(0, guess + by));
    renderGuess();
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  setup.render();
  renderBoard();
  screen('setup');
})();
