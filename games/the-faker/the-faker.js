// The Faker: everyone sees sixteen words, all but one are told which one is
// the word. See _README.md.
(function () {
  const STORAGE_KEY = 'games.the-faker.v1';
  const GRID = 16;
  // Below this the second hidden player is more than the table can carry:
  // two of five in the dark is a coin toss, not a read.
  const UNDERSTUDY_FROM = 6;

  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'span');
  }

  const el = {
    body: document.body,
    setupBtn: pick('setup-btn', 'button'),
    countRow: pick('count-row'),
    catGrid: pick('cat-grid'),
    catCount: pick('cat-count'),
    catAll: pick('cat-all', 'button'),
    catNone: pick('cat-none', 'button'),
    begin: pick('begin', 'button'),
    nameModeRow: pick('name-mode-row'),
    nameInputs: pick('name-inputs'),
    recentList: pick('recent-list'),
    understudyRow: pick('understudy-row'),
    understudyNote: pick('understudy-note', 'p'),

    readyWho: pick('ready-who'),
    show: pick('show', 'button'),
    topic: pick('topic'),
    whose: pick('whose'),
    grid: pick('grid'),
    role: pick('role', 'p'),
    hide: pick('hide', 'button'),

    talk: pick('talk'),
    talkTopic: pick('talk-topic'),
    talkGrid: pick('talk-grid'),
    reveal: pick('reveal', 'button'),
    answer: pick('answer'),
    answerWord: pick('answer-word'),
    answerWho: pick('answer-who', 'p'),
    again: pick('again', 'button'),

    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  const saved = Store.load(STORAGE_KEY) || {};

  /*
   * PartySetup carries a scoring mode this game has no use for. 'solo' is
   * the one that shows the players and names fields (css/party.css keys them
   * off body[data-mode]), and it is the honest one of the two here: there
   * are no teams.
   */
  const settings = PartySetup.shape(saved.settings);
  settings.mode = 'solo';
  const names = Array.isArray(saved.names)
    ? saved.names.slice(0, Party.MAX_PLAYERS).map(n => (typeof n === 'string' ? n : ''))
    : [];
  let useUnderstudy = saved.useUnderstudy !== false;

  // The dealt round: the grid, the word, and who is in the dark.
  let round = null;
  let seat = 0;

  function screen(name) {
    el.body.dataset.screen = name;
  }

  function nameAt(i) {
    const given = names[i];
    return typeof given === 'string' && given.trim()
      ? given.trim() : 'Player ' + (i + 1);
  }

  function save() {
    Store.save(STORAGE_KEY, {
      settings: settings,
      names: names,
      useUnderstudy: useUnderstudy
    });
  }

  /* ---- dealing ---------------------------------------------------------- */

  function shuffled(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  /**
   * A category with at least a grid's worth of terms, from the ones picked.
   * The board has to be sixteen words that plausibly sit together — which is
   * what a Vocab category already is.
   */
  function dealGrid() {
    const picked = Vocab.known(settings.categories);
    const usable = (picked.length ? picked : Vocab.categories())
      .filter(c => Vocab.terms(c).length >= GRID);
    if (!usable.length) return null;
    const category = usable[Math.floor(Math.random() * usable.length)];
    return { category: category, words: shuffled(Vocab.terms(category)).slice(0, GRID) };
  }

  function deal() {
    const board = dealGrid();
    if (!board) return false;

    const seats = settings.players;
    const secret = Math.floor(Math.random() * board.words.length);
    // Seats come from the player count, never from the names array — an
    // unnamed table has no names at all, and dealing off that would leave
    // the round with nobody in the dark.
    const chairs = [];
    for (let i = 0; i < seats; i++) chairs.push(i);
    const roles = shuffled(chairs);

    round = {
      category: board.category,
      words: board.words,
      secret: secret,
      faker: roles[0],
      // The second hidden player only joins a table big enough to hide in.
      understudy: useUnderstudy && seats >= UNDERSTUDY_FROM ? roles[1] : -1
    };
    seat = 0;
    return true;
  }

  /* ---- rendering -------------------------------------------------------- */

  function fillGrid(target, showSecret) {
    target.textContent = '';
    for (let i = 0; i < round.words.length; i++) {
      const tile = document.createElement('span');
      tile.className = 'tile';
      tile.dataset.i = String(i);
      tile.textContent = round.words[i].word;
      if (showSecret && i === round.secret) tile.dataset.secret = '';
      target.append(tile);
    }
  }

  function showReady() {
    el.readyWho.textContent = nameAt(seat);
    screen('ready');
  }

  function showCard() {
    const isFaker = seat === round.faker;
    const isUnderstudy = seat === round.understudy;
    el.topic.textContent = round.category;
    el.whose.textContent = nameAt(seat);
    fillGrid(el.grid, !isFaker && !isUnderstudy);

    el.role.textContent = '';
    delete el.role.dataset.role;
    if (isFaker) {
      el.role.dataset.role = 'faker';
      const lead = document.createElement('strong');
      lead.textContent = 'You are the Faker.';
      el.role.append(lead, document.createTextNode(
        ' You are not told the word. Listen, then say something that fits.'));
    } else if (isUnderstudy) {
      el.role.dataset.role = 'understudy';
      const lead = document.createElement('strong');
      lead.textContent = 'You are the Understudy.';
      el.role.append(lead, document.createTextNode(' Not the word — five words about it:'));
      const clues = document.createElement('span');
      clues.className = 'clues';
      clues.textContent = round.words[round.secret].related.join(' · ');
      el.role.append(clues);
    } else {
      el.role.dataset.role = 'knows';
      el.role.append(document.createTextNode('The word is '));
      const word = document.createElement('strong');
      word.textContent = round.words[round.secret].word;
      el.role.append(word);
    }

    el.hide.textContent = seat === settings.players - 1
      ? 'Hide — everyone talk' : 'Hide and pass on';
    screen('play');
  }

  function showTalk() {
    el.talkTopic.textContent = round.category;
    fillGrid(el.talkGrid, false);
    el.talk.hidden = false;
    el.answer.hidden = true;
    screen('over');
  }

  function showAnswer() {
    el.answerWord.textContent = round.words[round.secret].word;
    el.answerWho.textContent = '';
    el.answerWho.append(document.createTextNode('The Faker was '));
    const faker = document.createElement('b');
    faker.textContent = nameAt(round.faker);
    el.answerWho.append(faker, document.createTextNode('.'));
    if (round.understudy >= 0) {
      el.answerWho.append(document.createElement('br'));
      el.answerWho.append(document.createTextNode('The Understudy was '));
      const under = document.createElement('i');
      under.textContent = nameAt(round.understudy);
      el.answerWho.append(under, document.createTextNode('.'));
    }
    el.talk.hidden = true;
    el.answer.hidden = false;
  }

  function renderUnderstudy() {
    for (const b of el.understudyRow.querySelectorAll('.pick')) {
      const on = b.dataset.understudy === 'on';
      b.setAttribute('aria-pressed', on === useUnderstudy ? 'true' : 'false');
    }
    if (!useUnderstudy) {
      el.understudyNote.textContent =
        'One player in the dark, however many are playing.';
    } else if (settings.players >= UNDERSTUDY_FROM) {
      el.understudyNote.textContent =
        'In. A second player gets five words about the word, but not the word.';
    } else {
      el.understudyNote.textContent =
        'Waiting for ' + UNDERSTUDY_FROM + ' players — there is nowhere to hide in ' +
        settings.players + '.';
    }
  }

  /* ---- wiring ----------------------------------------------------------- */

  const setup = PartySetup.create({
    el: {
      countRow: el.countRow,
      catGrid: el.catGrid,
      catCount: el.catCount,
      all: el.catAll,
      none: el.catNone,
      begin: el.begin,
      nameModeRow: el.nameModeRow,
      nameInputs: el.nameInputs,
      recentList: el.recentList
    },
    settings: settings,
    names: () => names,
    onChange: () => {
      renderUnderstudy();
      save();
    }
  });

  Modal.create(el.rules, { trigger: el.rulesBtn });

  el.begin.addEventListener('click', () => {
    if (!deal()) return;
    save();
    showReady();
  });

  el.show.addEventListener('click', showCard);

  el.hide.addEventListener('click', () => {
    seat++;
    if (seat >= settings.players) showTalk();
    else showReady();
  });

  el.reveal.addEventListener('click', showAnswer);

  el.again.addEventListener('click', () => {
    if (!deal()) return;
    showReady();
  });

  el.setupBtn.addEventListener('click', () => {
    setup.render();
    renderUnderstudy();
    screen('setup');
  });

  for (const b of el.understudyRow.querySelectorAll('.pick')) {
    b.addEventListener('click', () => {
      useUnderstudy = b.dataset.understudy === 'on';
      renderUnderstudy();
      save();
    });
  }

  setup.render();
  renderUnderstudy();
  screen('setup');
})();
