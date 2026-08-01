// Blackjack, Vegas rules. See _README.md for the house rules and the seating.
(function () {
  const STORAGE_KEY = 'games.blackjack.v1';
  const START_BANK = 500;
  const MIN_BET = 1;
  const DECK_COUNTS = [1, 2, 4, 6, 8];
  const OTHER_COUNTS = [0, 1, 2, 3, 4];
  const DEALER_STANDS = 17;

  function pick(id, tag) {
    const node = document.getElementById(id);
    if (node) return node;
    console.warn('Missing element #' + id);
    return document.createElement(tag || 'span');
  }

  const el = {
    body: document.body,
    balance: pick('balance'),
    dealerLabel: pick('dealer-label'),
    dealerHand: pick('dealer-hand'),
    seats: pick('seats'),
    status: pick('status'),
    betValue: pick('bet-value'),
    betLine: pick('bet-line'),
    actions: pick('actions'),
    deal: pick('deal', 'button'),
    hit: pick('hit', 'button'),
    stand: pick('stand', 'button'),
    double: pick('double', 'button'),
    split: pick('split', 'button'),
    next: pick('next', 'button'),
    settings: pick('settings'),
    settingsBtn: pick('settings-btn', 'button'),
    decksRow: pick('decks-row'),
    othersRow: pick('others-row'),
    rebuy: pick('rebuy', 'button'),
    rules: pick('rules'),
    rulesBtn: pick('rules-btn', 'button')
  };

  let state = load();
  let shoe = Deck.shoe(state.decks);
  // The hand in play. Not persisted: a half-dealt hand cannot be resumed
  // honestly once the shoe has been rebuilt, so a reload returns the bet.
  let round = null;

  function load() {
    const p = Store.load(STORAGE_KEY) || {};
    const decks = DECK_COUNTS.indexOf(p.decks) !== -1 ? p.decks : 6;
    const others = OTHER_COUNTS.indexOf(p.others) !== -1 ? p.others : 2;
    const bank = Number.isFinite(p.bank) && p.bank >= 0 ? Math.floor(p.bank) : START_BANK;
    const bet = Number.isInteger(p.bet) && p.bet >= MIN_BET ? p.bet : 10;
    return { decks, others, bank, bet: Math.min(bet, Math.max(MIN_BET, bank)) };
  }

  function save() {
    Store.save(STORAGE_KEY, state);
  }

  /** We always sit in the middle of however many seats are in play. */
  function seatCount() {
    return state.others + 1;
  }

  function mySeat() {
    return Math.floor(seatCount() / 2);
  }

  /**
   * Blackjack's one piece of arithmetic. Aces count eleven until that busts,
   * then one at a time drop to one — which is why `soft` is "an ace is still
   * counting eleven" rather than "the hand contains an ace".
   */
  function value(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
      if (c.rank === 'A') { aces++; total += 11; }
      else if (c.rank === 'T' || c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') total += 10;
      else total += Number(c.rank);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
  }

  function isBlackjack(hand) {
    return hand.cards.length === 2 && !hand.fromSplit && value(hand.cards).total === 21;
  }

  function newHand(bet, fromSplit) {
    return { cards: [], bet, done: false, doubled: false, fromSplit: !!fromSplit, result: null };
  }

  function newRound() {
    const seats = [];
    for (let i = 0; i < seatCount(); i++) {
      const bet = i === mySeat() ? state.bet : 10;
      seats.push({ hands: [newHand(bet, false)], me: i === mySeat() });
    }
    return { seats, dealer: [], hole: true, active: 0, phase: 'deal' };
  }

  function pips(hand) {
    return value(hand.cards).total;
  }

  /**
   * What the other players do. A fixed, simple line rather than full basic
   * strategy: they exist to eat cards out of the shoe, and a wrong-looking
   * decision from a bot is not a bug anyone can act on. See _README.md.
   */
  function botWants(hand, upCard) {
    const v = value(hand.cards);
    if (v.total >= DEALER_STANDS) return false;
    if (v.soft) return v.total < 18;
    const up = value([upCard]).total;
    if (v.total >= 13 && up >= 2 && up <= 6) return false;
    return v.total < 17;
  }

  function cardEl(card, down) {
    const div = document.createElement('div');
    div.className = 'card';
    if (down) {
      div.dataset.down = '';
      div.setAttribute('aria-label', 'Face down');
    } else {
      if (Deck.isRed(card)) div.dataset.red = '';
      div.dataset.code = card.code;
      div.setAttribute('aria-label', Deck.name(card));
    }
    const rank = document.createElement('span');
    rank.className = 'card-rank';
    rank.textContent = card ? card.rank : '';
    const pip = document.createElement('span');
    pip.className = 'card-pip';
    pip.textContent = card ? Deck.pip(card) : '';
    div.append(rank, pip);
    return div;
  }

  function handEl(hand, opts) {
    const wrap = document.createElement('div');
    wrap.className = 'hand-block';
    const row = document.createElement('div');
    row.className = 'hand';
    for (let i = 0; i < hand.cards.length; i++) {
      row.append(cardEl(hand.cards[i], opts && opts.hideFrom === i));
    }
    const total = document.createElement('div');
    total.className = 'hand-total';
    const shown = opts && opts.hideFrom != null
      ? value(hand.cards.slice(0, opts.hideFrom)).total
      : pips(hand);
    total.textContent = String(shown);
    if (shown > 21) total.dataset.bust = '';
    if (isBlackjack(hand) && !(opts && opts.hideFrom != null)) total.dataset.blackjack = '';
    wrap.append(row, total);
    return wrap;
  }

  function renderDealer() {
    el.dealerHand.textContent = '';
    if (!round) return;
    const hand = { cards: round.dealer, fromSplit: false };
    el.dealerHand.append(handEl(hand, round.hole ? { hideFrom: 1 } : null));
    el.dealerLabel.textContent = round.hole ? 'Dealer shows' : 'Dealer';
  }

  function renderSeats() {
    el.seats.textContent = '';
    if (!round) return;
    for (let i = 0; i < round.seats.length; i++) {
      const seat = round.seats[i];
      const box = document.createElement('section');
      box.className = 'seat';
      box.dataset.seat = String(i);
      if (seat.me) box.dataset.me = '';
      if (round.phase === 'player' && i === round.active && seat.me) box.dataset.active = '';

      const label = document.createElement('span');
      label.className = 'seat-label';
      label.textContent = seat.me ? 'You' : 'Player ' + (i + 1);
      box.append(label);

      for (const hand of seat.hands) {
        box.append(handEl(hand));
        if (seat.me) {
          const bet = document.createElement('span');
          bet.className = 'seat-bet';
          bet.textContent = '$' + hand.bet;
          box.append(bet);
          if (hand.result) {
            const out = document.createElement('span');
            out.className = 'seat-out';
            out.dataset.r = hand.result.kind;
            out.textContent = hand.result.text;
            box.append(out);
          }
        }
      }
      el.seats.append(box);
    }
  }

  function myHands() {
    return round ? round.seats[mySeat()].hands : [];
  }

  function activeHand() {
    const hands = myHands();
    return hands.find(h => !h.done) || null;
  }

  function canDouble(hand) {
    return hand.cards.length === 2 && state.bank >= hand.bet;
  }

  function canSplit(hand) {
    const hands = myHands();
    if (hands.length > 1 || hand.cards.length !== 2) return false;
    if (value([hand.cards[0]]).total !== value([hand.cards[1]]).total) return false;
    return state.bank >= hand.bet;
  }

  function render() {
    el.balance.textContent = '$' + state.bank;
    el.betValue.textContent = '$' + state.bet;
    renderDealer();
    renderSeats();

    const betting = el.body.dataset.phase === 'betting';
    const playing = el.body.dataset.phase === 'player';
    const over = el.body.dataset.phase === 'over';

    el.betLine.hidden = !betting;
    el.deal.hidden = !betting;
    el.deal.disabled = state.bank < state.bet || state.bet < MIN_BET;
    el.next.hidden = !over;
    for (const b of [el.hit, el.stand, el.double, el.split]) b.hidden = !playing;

    if (playing) {
      const hand = activeHand();
      el.double.disabled = !hand || !canDouble(hand);
      el.split.disabled = !hand || !canSplit(hand);
    }
    for (const b of el.betLine.querySelectorAll('.step')) {
      const by = Number(b.dataset.by);
      b.disabled = state.bet + by < MIN_BET || state.bet + by > state.bank;
    }
  }

  function phase(name) {
    el.body.dataset.phase = name;
    if (round) round.phase = name;
  }

  function say(text) {
    el.status.textContent = text;
  }

  function deal() {
    if (state.bank < state.bet) return;
    if (shoe.needsShuffle()) shoe.shuffle();
    round = newRound();

    // Two rounds of one card each, the way it is actually dealt, so the
    // dealer's hole card is the last thing off the shoe.
    for (let pass = 0; pass < 2; pass++) {
      for (const seat of round.seats) seat.hands[0].cards.push(shoe.draw());
      round.dealer.push(shoe.draw());
    }

    // The bet leaves the bankroll the moment it is on the table.
    state.bank -= state.bet;
    save();

    // The dealer peeks, so a dealer blackjack ends it before anyone doubles.
    if (value(round.dealer).total === 21) {
      round.hole = false;
      phase('over');
      settle('Dealer has blackjack.');
      return;
    }
    if (isBlackjack(myHands()[0])) {
      round.hole = false;
      phase('over');
      settle('Blackjack!');
      return;
    }

    phase('player');
    say('Your move.');
    render();
  }

  function nextHandOrDealer() {
    if (activeHand()) {
      render();
      return;
    }
    playOthers();
  }

  function playOthers() {
    const up = round.dealer[0];
    for (let i = 0; i < round.seats.length; i++) {
      const seat = round.seats[i];
      if (seat.me) continue;
      const hand = seat.hands[0];
      while (value(hand.cards).total <= 21 && botWants(hand, up)) {
        hand.cards.push(shoe.draw());
      }
      hand.done = true;
    }
    playDealer();
  }

  function playDealer() {
    round.hole = false;
    // No point drawing if every one of our hands has already busted.
    const live = myHands().some(h => value(h.cards).total <= 21);
    if (live) {
      while (value(round.dealer).total < DEALER_STANDS) {
        round.dealer.push(shoe.draw());
      }
    }
    phase('over');
    settle('');
  }

  /** Pays every one of our hands and writes the outcome onto it. */
  function settle(prefix) {
    const dealer = value(round.dealer).total;
    const dealerBJ = round.dealer.length === 2 && dealer === 21;
    let net = 0;

    for (const hand of myHands()) {
      const mine = value(hand.cards).total;
      let payout = 0;
      let kind = 'lose';
      let text = 'Lose';

      if (mine > 21) {
        payout = 0;
        text = 'Bust ' + mine;
      } else if (isBlackjack(hand) && !dealerBJ) {
        // 3:2, plus the stake back.
        payout = hand.bet + Math.floor(hand.bet * 3 / 2);
        kind = 'win';
        text = 'Blackjack +' + Math.floor(hand.bet * 3 / 2);
      } else if (dealerBJ && !isBlackjack(hand)) {
        payout = 0;
      } else if (dealer > 21 || mine > dealer) {
        payout = hand.bet * 2;
        kind = 'win';
        text = 'Win +' + hand.bet;
      } else if (mine === dealer) {
        payout = hand.bet;
        kind = 'push';
        text = 'Push';
      }

      hand.done = true;
      hand.result = { kind, text };
      state.bank += payout;
      net += payout - hand.bet;
    }

    save();
    // Why the hand went the way it did, before the money. A bust is the one
    // outcome a player wants named: "you lose $10" reads like the dealer
    // beat you, when in fact you beat yourself and the dealer never drew.
    const hands = myHands();
    const busted = hands.filter(h => value(h.cards).total > 21).length;
    let why = prefix || '';
    if (!why && busted) {
      why = busted === hands.length
        ? (hands.length > 1 ? 'Both hands bust.' : 'Bust!')
        : 'One hand bust.';
    }
    if (!why && dealer > 21) why = 'Dealer busts.';

    const tail = net > 0 ? 'You win $' + net + '.'
      : net < 0 ? 'You lose $' + (-net) + '.' : 'Push.';
    say((why ? why + ' ' : '') + tail);
    render();
  }

  function hit() {
    const hand = activeHand();
    if (!hand) return;
    hand.cards.push(shoe.draw());
    if (value(hand.cards).total >= 21) hand.done = true;
    nextHandOrDealer();
  }

  function stand() {
    const hand = activeHand();
    if (!hand) return;
    hand.done = true;
    nextHandOrDealer();
  }

  function double() {
    const hand = activeHand();
    if (!hand || !canDouble(hand)) return;
    state.bank -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(shoe.draw());
    hand.done = true;
    save();
    nextHandOrDealer();
  }

  function split() {
    const hand = activeHand();
    if (!hand || !canSplit(hand)) return;
    const hands = myHands();
    const moved = hand.cards.pop();
    const second = newHand(hand.bet, true);
    second.cards.push(moved);
    hand.fromSplit = true;
    state.bank -= hand.bet;

    hand.cards.push(shoe.draw());
    second.cards.push(shoe.draw());
    hands.push(second);

    // Split aces get one card each and that is the hand.
    if (moved.rank === 'A') {
      hand.done = true;
      second.done = true;
    }
    save();
    nextHandOrDealer();
  }

  function bumpBet(by) {
    const next = state.bet + by;
    if (next < MIN_BET || next > state.bank) return;
    state.bet = next;
    save();
    render();
  }

  function buildSettings() {
    el.decksRow.textContent = '';
    for (const n of DECK_COUNTS) {
      const b = document.createElement('button');
      b.className = 'count';
      b.type = 'button';
      b.dataset.decks = String(n);
      b.textContent = String(n);
      b.addEventListener('click', () => {
        state.decks = n;
        shoe = Deck.shoe(n);
        save();
        reset('Shuffled ' + n + (n === 1 ? ' deck.' : ' decks.'));
      });
      el.decksRow.append(b);
    }
    el.othersRow.textContent = '';
    for (const n of OTHER_COUNTS) {
      const b = document.createElement('button');
      b.className = 'count';
      b.type = 'button';
      b.dataset.others = String(n);
      b.textContent = String(n);
      b.addEventListener('click', () => {
        state.others = n;
        save();
        reset(n === 0 ? 'Heads up with the dealer.' : 'Table of ' + (n + 1) + '.');
      });
      el.othersRow.append(b);
    }
  }

  function renderSettings() {
    for (const b of el.decksRow.children) {
      b.setAttribute('aria-pressed', Number(b.dataset.decks) === state.decks ? 'true' : 'false');
    }
    for (const b of el.othersRow.children) {
      b.setAttribute('aria-pressed', Number(b.dataset.others) === state.others ? 'true' : 'false');
    }
  }

  /** Back to betting with nothing on the table. */
  function reset(message) {
    round = null;
    el.dealerHand.textContent = '';
    el.seats.textContent = '';
    el.dealerLabel.textContent = 'Dealer';
    phase('betting');
    say(message || 'Place your bet.');
    state.bet = Math.min(state.bet, Math.max(MIN_BET, state.bank));
    save();
    render();
    renderSettings();
  }

  for (const b of el.betLine.querySelectorAll('.step')) {
    b.addEventListener('click', () => bumpBet(Number(b.dataset.by)));
  }
  el.deal.addEventListener('click', deal);
  el.hit.addEventListener('click', hit);
  el.stand.addEventListener('click', stand);
  el.double.addEventListener('click', double);
  el.split.addEventListener('click', split);
  el.next.addEventListener('click', () => reset(
    state.bank < MIN_BET ? 'Out of chips — reset the bankroll in settings.' : ''));
  el.rebuy.addEventListener('click', () => {
    state.bank = START_BANK;
    save();
    reset('Bankroll reset.');
  });

  Modal.create(el.settings, { trigger: el.settingsBtn });
  Modal.create(el.rules, { trigger: el.rulesBtn });

  buildSettings();
  reset();
})();
