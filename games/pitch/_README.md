# Pitch

A scoresheet for four- or five-handed Pitch. It does not deal cards or know
what was played — it is the pad of paper, not the game.

## Sides, not seats

- **Four players** — two partnerships. Two sides.
- **Five players** — every player alone. Five sides.

That split is the usual one, and it is why the code counts *sides* rather
than seats: a side is whatever thing scores, and everything downstream —
the sheet columns, the totals, the point buttons — counts sides.

## The point sets

Two versions, chosen in settings. **Pitch point sets vary a great deal from
table to table**, so these are one common pair rather than the definitive
ones, and the rules modal is generated from the same table the scoring reads
so the two cannot drift apart.

| | 10 point | 13 point |
| --- | --- | --- |
| High | 1 | 1 |
| Low | 1 | 1 |
| Jack | 1 | 1 |
| Off-Jack | 1 | 1 |
| High Joker | 1 | 1 |
| Low Joker | 1 | 1 |
| Three of trump | 3 | 3 |
| Five of trump (Pedro) | — | 3 |
| Game | 1 | 1 |
| **Total** | **10** | **13** |

If your table plays a different set, it is one edit: `POINT_SETS` at the top
of `pitch.js`. Add or remove an entry and the hand total, the maximum bid and
the rules modal all follow, because all three read the same table.

Note that the totals here are the two the settings screen offers, 10 and 13.
A set whose values sum to something else is fine, but the version it is
filed under is what the entry panel counts to — keep the two in step.

## Two phases, like Spades

A hand runs in the order the table plays it, and the panel only ever shows
the half that is live:

1. **Bidding** — tap who bid, step the bid, press **Lock bid**.
2. **Playing** — count each side's points, press **Score the hand**.

**Edit bid** goes back to the first phase without losing the counts already
entered. This is the same shape as the Spades sheet next door, deliberately:
the two games sit beside each other on the home page and a table that has
used one should not have to learn the other.

### The panel does not name individual points

An earlier version had a row per point at stake — High, Low, Jack, the
Three — and asked which side took each one. That is more bookkeeping than a
Pitch table wants from a scorepad: **players can count their own tricks**,
and a phone that makes them re-declare each card is slower than the paper it
replaced. So the entry is one number per side and the point list moved to
the **Points** modal, where it is reference rather than data entry.

`POINT_SETS` still drives that modal and still decides the hand total, which
is the only thing the scoring needs from it.

## Scoring a hand

- Every side keeps the points it actually took.
- The bidder is the exception: **take at least the bid or lose it**. Falling
  short scores `−bid` rather than what was taken.
- The bidder's number is ringed on the sheet, so a set hand reads at a
  glance months later.

Bids run from 2 to the version total. No minimum-bid rule, no shoot-the-moon
bonus, no game-end target — the sheet records what happened rather than
refereeing it, which is the same call Spades makes next door.

**The points have to add up before a hand will score.** Every point in a
Pitch hand is taken by somebody, so a sheet that accepts nine of ten is
recording an arithmetic slip rather than a game. Two things enforce it
without an error message ever appearing:

- The **+** steppers stop at the hand total, so a side can never be given a
  point that does not exist. An entry is therefore either short or exactly
  right, never over.
- **Score the hand** is disabled while it is short, and the panel says how
  many are still to place.

That is a deliberate reversal of the earlier behaviour, which let unassigned
points score for nobody. Being told the count is wrong the moment it is wrong
beats finding a hand worth 9 three rounds later.

A saved hand that does not add up — from a half-finished entry, or from a
point version changed underneath it — is **kept, not zeroed**. The Score
button stays off until the table fixes it, which is a repair they can see.

## The buttons take the screen

The entry panel is the half of the page that gets tapped, so it is the
greedy one: it claims what the sheet can spare up to `max-height: 64dvh`,
and everything inside it stretches to fill what it gets. The bidder buttons,
the bid stepper and the point steppers have no fixed height at all — they
divide the panel. Five sides on a phone still leaves each column a full-height
**+** and **−**.

## Persisted state

`localStorage` key `games.pitch.v2`. The `v1` key held the per-point map the
entry panel no longer collects; there is no migration, because a `taken` map
cannot be turned into per-side counts without knowing the point set it was
recorded under, and a half-played hand is not worth that.

```json
{
  "players": 4,
  "points": 10,
  "rounds": [ { "bidder": 0, "bid": 6, "took": [7, 3] } ],
  "draft": { "phase": "playing", "bidder": 0, "bid": 4, "took": [2, 1] }
}
```

`draft` is the hand in progress and is saved on **every tap**, because the
gap between locking the bid and scoring the hand is the hand itself: the
phone goes down, the screen locks, and coming back to a lost bid would be
the app failing at its one job. `phase` is part of it for the same reason.

Round scores and totals are **derived**, never stored, so the sheet cannot
disagree with itself. A round whose shape does not check out is repaired
field by field rather than dropped.

Changing the player count or the point version **clears the sheet**, behind
a confirm when there is anything to lose. A half-played four-handed game is
not a five-handed game, and a 10-point hand is not a 13-point one.
