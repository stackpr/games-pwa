# Somewhere Between

A hidden target sits on a scale between two opposites. One player sees it
and gives a one-word clue; everyone else drags a marker to where they think
it is.

## The name

The game this clones is sold under a **registered trademark**, so that name
appears nowhere. *Somewhere Between* was chosen with the repo owner before
anything was written — it names the puzzle rather than the control, which
is what the owner picked it for.

## Where the content comes from

Two halves, both in `js/lib/vocab.js`:

- **80 spectrums** — `Cold ↔ Hot`, `Trash ↔ Treasure`, `Guilty pleasure ↔
  Something to brag about`. Written at the same sixth-grade bar as the
  terms, because a scale nobody can place things on is a dead round.
- **The clue word** comes from the term library, so the categories picked in
  setup decide what gets judged. *Elephant* on `Tiny ↔ Huge` is an easy
  round; *Elephant* on `Boring ↔ Exciting` is an argument, which is the
  point.

Spectrum order is not arbitrary: **the left end is always the one that reads
as "less" or "smaller"**, so a player who has not read the labels closely
still guesses the right way round.

## The dial, and why it has no number

The marker carries **no percentage**, and that is the design rather than an
omission. A number turns the argument into arithmetic — *"sixty-two, not
sixty-five"* — when the interesting part is *more that way, less that way*.
Take the number away and the table has to argue in the language of the
scale itself.

Consequences worth knowing:

- `aria-valuetext` carries a **phrase**, not a figure: *"a little towards
  Hot"*. Setting only `aria-valuenow` would have a screen reader announce
  the exact number the sighted players deliberately do not get, which would
  make the game easier for one player and harder to run for everybody.
- The **scoring bands stay hidden until the guess is locked in.** Showing
  them is showing the answer.

## Scoring

| Distance from the target | Points |
| --- | --- |
| within 4% | 4 |
| within 9% | 3 |
| within 16% | 2 |
| further | 0 |

The target is never placed within 18% of either end, so no band ever falls
half off the scale and every round is winnable at full marks. That is the
one arbitrary-looking constant in the file and it is why.

The two modes come from `js/lib/party.js` and match the other party games:
two teams alternating, or a clue-giver paired with a guesser where both take
the points.

**New scale** deals a fresh spectrum and clue without passing the turn —
for the round where the pairing is plainly unplayable, which happens often
enough that making the table sit through it would be worse than allowing a
redeal.

## Persisted state

`localStorage` key `games.somewhere-between.v1` — a `settings` object and a
`party` object, the same shape as the other party games. See
`games/forbidden-words/_README.md` for the field-level notes.

The target, the current scale and the current clue are **not** saved. They
are one round's worth of state, and a round interrupted mid-argument has
nothing worth resuming.
