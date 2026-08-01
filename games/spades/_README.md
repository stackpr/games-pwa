# Spades

A scoresheet for four-handed partners. It does not deal cards or know what
was played — it is the pad of paper, not the game.

## Use case

Four people, two partnerships, one phone on the table between them. Spades
is played with physical cards; what nobody wants to do is the arithmetic,
especially once nil bonuses land on top of a contract. So this tracks bids,
tricks and running totals, and nothing else.

The scorekeeper next door already does "two teams, tap to add a point".
This exists because Spades scoring is not a running tally: a round's value
depends on bids made before the hand was played, and a nil is settled per
player rather than per team.

## Seats and partners

Four seats, `P1` to `P4`, partners sitting across:

- **Team 1** — P1 and P3
- **Team 2** — P2 and P4

`P1` deals the first hand and the deal rotates one seat per round, which is
the only thing the app tracks about the deal. The current dealer is marked
under their name in the entry panel; past dealers are not stored, because
round *n* was dealt by seat `(n − 1) mod 4` and that is not worth a column.

## Entering a round

Two rows of steppers, one column per seat — no keypad. A keypad means
typing a number, dismissing a keyboard and repeating it eight times a hand;
stepping is a tap per increment and never covers the screen.

- **Bid** runs `13` down to `1`, then **Nil**, then **Blind** at the floor.
  Nil replaces zero rather than sitting beside it, because a bid of zero
  *is* nil — there is no way to bid zero and not be playing a nil.
- **Took** runs `0` to `13`.
- The steppers disable at both ends rather than wrapping, so holding one
  down cannot roll `13` around to `Blind`.

Both arrows are always visible for every seat, so a bid can be corrected
before the round is scored. After scoring, **Undo** takes the last round
back off the sheet.

## Scoring

| Outcome | Value |
| --- | --- |
| Contract made | 10 per bid trick, +1 per overtrick |
| Set | &minus;10 per bid trick |
| Nil made / failed | +100 / &minus;100 |
| Blind nil made / failed | +200 / &minus;200 |

A team's contract is the sum of its two **numeric** bids; nil bids
contribute nothing to it. Nil is then settled per player and added on top,
so a hand can be both set and carrying a made nil.

**A nil bidder's tricks still count toward their partner's contract.** That
is the common house rule and the more forgiving one — a failed nil at least
helps fill the bid rather than being wasted twice. It is also why a failed
nil beside a made contract is a smaller loss than it first looks.

## What this deliberately does not do

The request was to keep it unrestricted at first, and these are the rules
left out on purpose:

- **No bag penalty.** Overtricks accumulate as points and never cost 100.
  Adding it later means tracking a bag count per team across rounds, which
  is state this file's shape does not currently carry.
- **Bids are not forced to total anything**, and tricks are not forced to
  total 13. The sheet records what happened rather than refereeing it, so a
  misdeal or a house variant does not fight the app.
- No game-end target, no set-back rules, no partner-passing on blind nil.

If any of these arrive, they belong behind the same reasoning: enforce only
what a player would otherwise have to remember.

## Persisted state

One JSON object under `games.spades.v1`:

```json
{ "rounds": [ { "bids": [4, -1, 3, 5], "tricks": [4, 0, 3, 6] } ] }
```

Bids are stored as numbers, with **&minus;1 for nil and &minus;2 for blind
nil**. Sentinels rather than a separate flag, because a bid is exactly one
value and splitting it into `{ n, isNil }` invites states where both are
set.

Everything else — round scores, totals, the dealer — is derived. Nothing
that can be recomputed is stored, so the sheet cannot disagree with itself.
Rounds whose arrays are the wrong shape are dropped on load rather than
patched.
