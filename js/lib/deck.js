/*
 * A deck of cards, and a shoe made of several.
 *
 *   const shoe = Deck.shoe(6);          // six decks, shuffled together
 *   const card = shoe.draw();           // { rank, suit, code }
 *   shoe.remaining();                   // cards left before the shuffle point
 *
 * A card is a small object plus a two-character `code` — 'AS', 'TD', '7H' —
 * which is what gets persisted, logged and used as a DOM key. Ten is 'T' so
 * every code is exactly two characters and a hand is a fixed-width string.
 *
 * The shoe deals from the *end* of the array and never reshuffles itself.
 * Reshuffling mid-hand is the bug this shape prevents: a game asks
 * `needsShuffle()` between hands and calls `shuffle()` itself, so a shoe can
 * never change under a hand that is already dealt.
 *
 * No rendering here. A game that wants to draw a card owns that markup, the
 * same way each game owns its board.
 */
window.Deck = (function () {
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  const SUITS = ['S', 'H', 'D', 'C'];
  const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const RANK_NAME = {
    A: 'Ace', T: 'Ten', J: 'Jack', Q: 'Queen', K: 'King',
    2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six',
    7: 'Seven', 8: 'Eight', 9: 'Nine'
  };
  const PIPS = { S: '♠', H: '♥', D: '♦', C: '♣' };

  function card(rank, suit) {
    return { rank, suit, code: rank + suit };
  }

  function parse(code) {
    if (typeof code !== 'string' || code.length !== 2) return null;
    const rank = code[0];
    const suit = code[1];
    if (RANKS.indexOf(rank) === -1 || SUITS.indexOf(suit) === -1) return null;
    return card(rank, suit);
  }

  function single() {
    const cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push(card(rank, suit));
    }
    return cards;
  }

  function shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = cards[i];
      cards[i] = cards[j];
      cards[j] = t;
    }
    return cards;
  }

  function isRed(c) {
    return c.suit === 'H' || c.suit === 'D';
  }

  function pip(c) {
    return PIPS[c.suit] || '?';
  }

  function name(c) {
    return RANK_NAME[c.rank] + ' of ' + SUIT_NAME[c.suit];
  }

  /**
   * `decks` shuffled together. `penetration` is the fraction dealt before
   * the shoe wants reshuffling — 0.75 is the usual casino cut, and it is a
   * fraction rather than a card count so it means the same thing whether
   * the shoe is one deck or eight.
   */
  function shoe(decks, penetration) {
    const count = Math.min(8, Math.max(1, Math.floor(Number(decks)) || 1));
    const cut = penetration > 0 && penetration < 1 ? penetration : 0.75;
    let cards = [];

    function build() {
      cards = [];
      for (let d = 0; d < count; d++) cards.push(...single());
      shuffle(cards);
    }

    function draw() {
      if (!cards.length) build();
      return cards.pop();
    }

    function remaining() {
      return cards.length;
    }

    function needsShuffle() {
      return cards.length <= count * 52 * (1 - cut);
    }

    build();
    return { draw, remaining, needsShuffle, shuffle: build, decks: count, size: count * 52 };
  }

  return { RANKS, SUITS, card, parse, single, shuffle, shoe, isRed, pip, name };
})();
