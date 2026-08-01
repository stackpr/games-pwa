# Somewhere Between

A hidden target sits on a scale between two opposites. One player sees it,
**types a clue**, and passes the phone on. Everyone else drags a marker to
where they think the target is, one at a time, and each of them scores
their own guess.

## The name

The game this clones is sold under a **registered trademark**, so that name
appears nowhere. *Somewhere Between* was chosen with the repo owner before
anything was written — it names the puzzle rather than the control, which
is what the owner picked it for.

## The round

Three phases, tracked on `body[data-phase]`, all on the same screen so the
phone never has to be handed back and forth more than once:

| Phase | Who is holding the phone | What they see |
| --- | --- | --- |
| `clue` | the clue-giver | the target, the scoring bands, a text box |
| `guess` | each responder in turn | the clue, a bare scale, a draggable marker |
| `reveal` | everybody | the target, the bands, every marker, the tally |

**The clue is typed, not dealt.** An earlier version handed the clue-giver a
word out of `js/lib/vocab.js` and asked the table to judge *that* against
the scale. It made the giver a bystander — they had no decision to make and
no way to be good at it. Typing the clue is the whole game: the giver is
looking at the target and choosing words that aim at it.

Because the clue is typed, this game **has no category picker**. Nothing in
setup limits what can be said, so there is nothing to pick. A spec asserts
the picker is absent, since re-adding one would be a silent regression from
the first version.

**Responders answer in seat order**, skipping the giver — seats `0, 1, 2…`
with the giver's index removed. So the first responder is not necessarily
the seat after the giver; with three players and seat 1 giving, seat 0 goes
first. `responderSeats()` is written that way on purpose: the order is
stable and readable off the score list, which matters when the phone is
being passed around a table.

**The marker resets to the middle between responders.** Leaving it where the
last player put it would hand every later player the earlier answer, which
is the entire secret. There is a spec for it.

Nobody's marker is drawn until every responder has locked in — the `.said`
markers are built in `renderAnswers()` and it returns immediately unless the
phase is `reveal`.

### One button, three meanings

`#lock` reads **Pass it on** → **Lock in** → **Lock in and reveal** (for the
last responder) → **Scores**. A separate button per step would leave two of
them dead at any moment, in the part of the screen a thumb is already
resting on. `advance()` branches on the phase and is the only handler.

It is **disabled while the clue box is empty**, which is the one place the
game refuses to move on: a blank clue is not a round.

## Where the content comes from

**80 spectrums** in `js/lib/vocab.js` — `Cold ↔ Hot`, `Trash ↔ Treasure`,
`Guilty pleasure ↔ Something to brag about`. Written at the same
sixth-grade bar as the term library, because a scale nobody can place things
on is a dead round.

Spectrum order is not arbitrary: **the left end is always the one that reads
as "less" or "smaller"**, so a player who has not read the labels closely
still guesses the right way round.

`Vocab.spectrums()` deals a shuffled run holding every pair once; the game
walks it and reshuffles at the end, so a table does not see the same scale
twice in a sitting.

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
- The **target and the bands are CSS-gated on the phase**, not toggled in
  JS: `body[data-phase="clue"] #target, body[data-phase="reveal"] #target`.
  One rule decides who can see the answer, and it cannot drift out of sync
  with the logic the way a `hidden` flag set in three places would.

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

**Every responder scores their own guess, and the clue-giver scores the sum
of all of them.** That is the rule that makes a clue good or bad: one that
lands for a single player and loses everybody else is worth less than one
that gets the whole table into the 3-point band. A clue nobody finds pays
its author nothing, and the hint line says so — *"Nobody found it."*

Scoring writes into `party.scores` directly rather than going through
`Party.award()`, because that helper credits one seat per call and this
round pays out every seat at once.

The two modes come from `js/lib/party.js` and match the other party games:

- **Two teams** — the other team is the only responder, so the giving team
  banks exactly what the guessing team scored. Both rows move by the same
  amount every round, which is the point of the mode: it is a co-op score.
- **Each player scores** — every other seat guesses separately and keeps
  their own points, and the giver's total is the sum.

Unlike the other party games this one scores **once a round** rather than
once a card, so it keeps its own action row in solo mode instead of swapping
it for per-player name buttons. That is what the `.keeps-actions` opt-out in
`css/party.css` is for.

See `games/forbidden-words/_README.md` for the name editor and the shared
recent list.

**New scale** deals a fresh spectrum and target without passing the turn,
and clears whatever was typed — for the round where the pairing is plainly
unplayable, which happens often enough that making the table sit through it
would be worse than allowing a redeal. It is hidden once the clue has been
passed on, since redealing then would throw away answers already locked in.

## Who gave the clue, and why it is stored

`clueGiver` is captured in `renderReady()` rather than derived from
`Party.roles()` at the moment it is needed. The round counter advances the
instant the round pays out, so anything the reveal draws — the tally row,
the scores heading, the hint — would otherwise be credited to the *next*
player. Read the giver through `giver()`, never through `Party.roles()`.

## Persisted state

`localStorage` key `games.somewhere-between.v1` — a `settings` object and a
`party` object, the same shape as the other party games. See
`games/forbidden-words/_README.md` for the field-level notes.

The target, the current scale, the typed clue and the locked-in answers are
**not** saved. They are one round's worth of state, and a round caught
halfway has a clue somebody has already read out and markers half the table
has placed — there is nothing honest to resume.
