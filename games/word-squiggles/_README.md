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

## Why the path is checked, not just the word

A found word has to be traced along **the cells the builder actually laid**,
not merely along some path spelling the same letters. On a dense board two
different squiggles can spell the same word; accepting the wrong one would
leave the real word's cells claimed by its neighbour, and the rest of the
puzzle would become unsolvable through no fault of the player. Reversed is
fine — a word read backwards is the same squiggle.

## The themes

`sets.js` holds twenty, written for this game rather than borrowed from
`js/lib/vocab.js`. The shared vocabulary exists for the describing games: its
categories are broad and its terms carry the words you would *say* while
describing them, which is a different job. Here the theme is the only clue,
so it has to be tight enough that noticing it is a moment.

Each set carries fifteen to eighteen words and a puzzle uses six to nine, and
that surplus is the point — a set of eight would deal the same board twice a
week. Twelve is the floor the loader enforces.

Two rules when adding one: four to eleven letters (shorter is noise, longer
will not lie on a small board), and no word containing another in the same
set, which would make a found word ambiguous.

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
  "solved": 4
}
```

**The board is saved, not the seed.** Regenerating from a seed would mean the
layout search had to be perfectly reproducible for ever, which quietly makes
every future improvement to it a breaking change; storing the result costs a
couple of kilobytes and nothing else.

On load the saved board is validated hard — the right number of letters, and
**every cell covered exactly once** — because that invariant is what the
whole game rests on. A board that fails it is thrown away and a new one dealt
rather than played half-broken.
