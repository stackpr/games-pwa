# Blackjack

Vegas rules, one seat that matters, a bankroll that carries over.

## The table

**You always sit in the middle.** The other players are set in settings (0
to 4), and your seat is `floor(total / 2)` — so three at the table puts you
in the middle, five puts you in the middle, and an even table puts you just
right of centre. Your seat is the wide one, ringed in chip gold; theirs are
narrow.

The other players exist for **the cards they use up**, which is the whole
reason the setting is there: a shoe dealt to five is a different shoe from
one dealt heads-up. Their money is not tracked and they do not talk. They
play a fixed, simple line — stand on hard 17, stand on 13–16 against a
dealer 2–6, hit soft totals under 18 — rather than full basic strategy,
because a bot playing a *slightly* wrong hand is not something anyone at
this table can act on, and pretending otherwise would invite blame for
losses it did not cause.

## House rules

- **Blackjack pays 3 to 2**, rounded down on an odd bet. A win pays even
  money; a push returns the stake.
- **Dealer stands on all 17s**, soft ones included.
- **Double** on any two cards, including after a split. Exactly one card.
- **Split** any pair, once. Split aces get one card each, and 21 after a
  split is a plain 21 rather than a blackjack — the usual rule and the one
  that stops a split into aces paying 3:2 twice.
- **The dealer peeks** on a 21, so a dealer blackjack ends the hand before
  anybody has doubled into it.
- The dealer **does not draw at all** when every one of your hands has
  already busted. There is nothing left to resolve and drawing would only
  burn cards.

## Saying why, before saying how much

A hand that ends says what happened before it says what it cost:
*"Bust! You lose $10."* — not *"You lose $10."* on its own, which reads as
though the dealer beat you when in fact you beat yourself and the dealer
never drew a card. That is a real confusion here, because of the rule above:
bust every hand and the dealer stands on whatever it was showing, so the
board offers no explanation of its own.

The line names, in order of what a player wants to know: a blackjack, a
dealer blackjack, your bust (**Bust!**, or *One hand bust* after a split
where only one went over), then a dealer bust. The seat itself carries the
total that did it — `Bust 26` rather than a bare *Lose* — so a split shows
which half went where.

Not offered, deliberately: insurance, surrender, and resplitting past two
hands. Each is a rule most tables skip, and each costs a decision point
mid-hand for a small edge.

## Betting

Six buttons — ±1, ±5, ±25 — around the bet. That is "any number" without a
keypad, which would mean a keyboard covering the table on every hand. Each
button disables itself when it would take the bet below 1 or above the
bankroll, so the bet can never exceed what is there to lose.

**The stake leaves the bankroll the moment the hand is dealt**, and payouts
return the stake plus the winnings. That ordering matters: it means the
balance on screen is always money you actually have, and a double or a split
can be refused honestly because the bankroll has already been debited.

The bankroll starts at $500 and persists. There is a reset in settings; it
is not automatic, because a bankroll that quietly refills is not a bankroll.

## Cards

`js/lib/deck.js` and `css/cards.css` are new and shared-by-intent. A card is
a rounded rectangle with a rank and a suit pip drawn in CSS — one rule set
rather than fifty-two images, and it scales without density variants. See
Images in `CLAUDE.md`.

The shoe **never reshuffles itself.** It deals until empty and exposes
`needsShuffle()`; the game asks between hands and calls `shuffle()` itself.
That shape exists to make a mid-hand reshuffle impossible, which is the bug
a self-managing shoe invites.

Cards overlap by a negative margin so a six-card hand still fits the seat it
was dealt to, and the whole row is sized from one `font-size` on `.hand`.

## Persisted state

`localStorage` key `games.blackjack.v1`:

```json
{ "decks": 6, "others": 2, "bank": 480, "bet": 10 }
```

**The hand in play is deliberately not saved.** A shoe is rebuilt on load, so
a resumed hand would be finished against cards that had nothing to do with
the ones it was dealt from — worse than losing it. A reload returns to
betting with the bankroll intact, which is the honest resting state.
