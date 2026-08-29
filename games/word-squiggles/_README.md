# Word Squiggles

A grid of letters where **every letter belongs to exactly one themed word**.
The words snake in any direction. Find them all and the board is spent.

## The name

Not the trademarked one. The mechanic — themed words tiling a grid, one of
them spanning it — is free to reimplement; the name of the famous version is
a New York Times mark and would end up in the slug, the storage key, the
precache list and the commit history. `Word Squiggles` names the thing that
is actually ours: the shape you draw. See Naming a game in CLAUDE.md.

## The grid is never predetermined

This is the design decision everything else follows from, and it was the
explicit ask: **no stored boards.** Every puzzle is built when you open it.

The obvious way round — fix the board at, say, 6×8 and hunt for words
totalling exactly 48 letters — was tried and is bad on both counts. It is
slow (a first prototype solved 21 of 60 attempts, median 2.4 seconds) and it
is *repetitive*, because only a few subsets of a themed set hit one exact
number.

So it works the other way up: **pick the words, and let them choose the
board.** Take six to nine words from the set, add up their letters, and use
any factorisation that gives a sensible shape — 5–7 columns, 6–9 rows. Almost
every subset fits *some* board, so the search almost never has to reject one.

That single inversion is why the same twenty themes stay worth playing.
Measured over 300 puzzles: **298 distinct word-sets, ten different board
shapes, every one solved, median 21ms and 262ms at worst.** A theme that
comes round again is a new board, a different subset and a different shape.

### The pruning that makes it fast

Placing words is a backtracking search: longest word first, from every empty
cell, snaking eight ways without reuse. On its own that is far too slow.

**After each word, the empty cells are grouped into connected blobs, and any
blob smaller than the shortest word still to place kills the branch.** A
three-cell pocket that no remaining word can fill is a dead end however much
searching is done inside it, and without this check the search spends its
life discovering that one cell at a time. This is the whole difference
between 2.4 seconds and 21 milliseconds.

Two smaller guards matter too:

- **A step budget** per attempt, so a pathological set fails fast and the
  next attempt gets a turn, rather than one search grinding for ever. Retries
  are cheap; long searches are not.
- **The spanner is claimed during the search, not after.** A word touching
  two opposite edges takes the role provisionally, and gives it back if the
  branch is later abandoned — otherwise a completed board could have no
  spanner and the whole thing would need rebuilding.

## Ambiguity, and why boards are auditioned

A squiggle is matched by **the path the builder laid** (see below), which
makes a word that can be spelled along a second path the worst moment the
game has: the player traces it correctly and is told it is wrong.

Two ways to attack that were built and measured over 200 boards:

Only one kind of ambiguity counts: a word spellable over a **different set
of squares**. A path over a word's own cells in another order is accepted
(see above), so it is not ambiguity and is not scored as any.

| Approach | Words spellable off their own squares | Build time |
| --- | --- | --- |
| Nothing | 53.1% | 36ms |
| Steer the search away from a letter next to its own copy | ~49% | 60ms |
| **Build six boards, keep the least murky** | **27.0%** | 229ms |

The first idea is the intuitive one and it barely moves: by the time a
letter is being placed, the search cannot see what the finished board will
allow. Scoring whole boards can, because it asks the actual question — how
many of these words can be traced two ways? — and answers it by counting.

So `deal()` builds `BOARD_TRIES` boards and keeps the best, stopping early
if one comes out clean. **Avoided, never prohibited:** a board with no
ambiguity at all may not exist for a given set of words, so this takes the
best of what it built rather than searching until it finds perfection.
There is no loop that can fail to end.

## What counts as tracing a word

Two tests, and a squiggle takes both.

**The same squares.** A word must be drawn over the cells the builder gave
it. On a dense board two different squiggles can spell the same word, and
accepting one that borrowed a neighbour's cell would leave the real word
unsolvable through no fault of the player. This is the invariant the whole
game rests on: a word owns its cells.

**Spelling the word, from either end.** Reversed is fine — a word read
backwards is the same squiggle.

**The order within those cells is not checked**, and that matters more than
it sounds. DRESS puts its two S's on two particular squares; a player who
traces them in the other order has drawn something nobody could tell from
the intended squiggle — same squares, same letters, same word. Refusing it
refuses a correct answer. What the letters still rule out is a scramble of
the right cells that spells nothing.

Order was once the entire test, and it had two bugs in it. It rejected every
backwards trace, because reading `discard` from the far end gives `dracsid`;
and it rejected the duplicate-letter case above. Matching on the cell *set*
plus the reading is what the rule was always trying to say.

## The themes

`sets.js` holds twenty, written for this game rather than borrowed from
`js/lib/vocab.js`. The shared vocabulary exists for the describing games: its
categories are broad and its terms carry the words you would *say* while
describing them, which is a different job. Here the theme is the only clue,
so it has to be tight enough that noticing it is a moment.

Each set carries **thirty-odd** words and a puzzle uses six to nine, and that
surplus is the whole point: the pool is what decides whether a theme is worth
meeting again. 675 words across the twenty. Twenty is the floor the loader
enforces.

Two rules when adding one: four to eleven letters (shorter is noise, longer
will not lie on a small board), and no word containing another in the same
set, which would make a found word ambiguous.

## The clock, and what a hint costs

A solve is timed, and the times are kept **per board size**. A 7×9 is more
than twice the work of a 5×7, so one list would only ever show the small
boards; separate lists make a size's difficulty legible from the order.

- **The clock starts on your first squiggle**, not on load. Reading the
  theme costs nothing.
- **Each hint adds more than the last** — 15s, then 30s, then 45s. The
  first is a nudge and the fourth is being carried, so they should not cost
  the same. Arithmetic rather than doubling, because a player who wants four
  hints should not be looking at a nonsense number.
- **The price is said when the hint is taken**, not discovered on the finish
  screen. A cost you find out about afterwards is a trap.
- A reload keeps the time banked so far but **never leaves the clock
  running** — the page was not open, so that stretch cannot be timed
  honestly. It starts again on the next squiggle.

## Hints

A hint marks **where a word begins**, and nothing else. That is the part that
is genuinely hard to see on a board with no gaps; revealing the shape would
just be handing over the answer. Hints are unlimited but each one is spent on
a different word, so there is a floor under how much they can give away.

## Persisted state

`localStorage`, key `games.word-squiggles.v1`:

```json
{
  "puzzle": { "title": "In the kitchen", "cols": 6, "rows": 7,
              "letters": ["k", "e", "…"],
              "words": [{ "word": "kettle", "cells": [0, 1, 7], "spanner": false }] },
  "found": ["kettle"],
  "hinted": [12],
  "elapsed": 41200,
  "solved": 4,
  "times": { "6×7": [{ "total": 56200, "raw": 41200, "hints": 1,
                       "title": "In the kitchen", "at": 1754600000000 }] }
}
```

`total` is what ranks (the clock plus the hint penalties) and `raw` is what
the clock actually said; both are shown, because "2:10, of which 45 seconds
were hints" is a more interesting line than either number alone.

**The board is saved, not the seed.** Regenerating from a seed would mean the
layout search had to be perfectly reproducible for ever, which quietly makes
every future improvement to it a breaking change; storing the result costs a
couple of kilobytes and nothing else.

On load the saved board is validated hard — the right number of letters, and
**every cell covered exactly once** — because that invariant is what the
whole game rests on. A board that fails it is thrown away and a new one dealt
rather than played half-broken.
