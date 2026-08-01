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
of `pitch.js`. Add or remove an entry and the entry panel, the maximum bid
and the rules modal all follow. That was the point of driving the whole game
off a table rather than hard-coding eight checkboxes.

## Scoring a hand

Tap the bidder, step the bid, then tap a side for each point that was taken.

- Every side keeps the points it actually took.
- The bidder is the exception: **take at least the bid or lose it**. Falling
  short scores `−bid` rather than what was taken.
- The bidder's number is ringed on the sheet, so a set hand reads at a
  glance months later.

Bids run from 2 to the version total. No minimum-bid rule, no shoot-the-moon
bonus, no game-end target — the sheet records what happened rather than
refereeing it, which is the same call Spades makes next door.

**Unassigned points score for nobody.** A half-filled hand is worth less
rather than being rejected, and the entry panel says how many points are
still to place instead of blocking the button. A table that forgets to
record Game should get a slightly wrong number, not a locked app.

Tapping the side already chosen for a point **clears it**, so a mis-tap costs
one more tap rather than a reset.

## Persisted state

`localStorage` key `games.pitch.v1`:

```json
{
  "players": 4,
  "points": 10,
  "rounds": [ { "bidder": 0, "bid": 6,
                "taken": { "high": 0, "low": 1, "jack": 0, "offjack": null,
                           "hijoker": 0, "lojoker": 1, "three": 0, "game": 1 } } ],
  "draft": { "bidder": 0, "bid": 4, "taken": { "high": null } }
}
```

`draft` is the hand in progress and is saved on **every tap**, because the
gap between setting the bid and scoring the hand is the hand itself: the
phone goes down, the screen locks, and coming back to a lost bid would be
the app failing at its one job.

Round scores and totals are **derived**, never stored, so the sheet cannot
disagree with itself. A round whose shape does not check out is repaired
field by field against the current point set rather than dropped — a saved
`taken` key that no longer exists simply goes unread.

Changing the player count or the point version **clears the sheet**, behind
a confirm when there is anything to lose. A half-played four-handed game is
not a five-handed game, and a 10-point hand is not a 13-point one.
