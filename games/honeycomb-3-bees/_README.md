# Honeycomb: 3 Bees

Two players, one phone, one shared pool of bees and a comb that shrinks
under both of them.

*(This file previously held a copy of Blackjack's README, checked in by
mistake with the game. What follows is the real thing.)*

## The name

The published game this reimplements has a registered trademark for a name.
Rules are free to reimplement, names are not — so nothing here, in the slug,
in the storage key or in the commit history uses it. See *Naming a game* in
`CLAUDE.md`.

## Use case

A short abstract for two people passing one phone. There is nothing hidden,
no clock and no deck: the whole position is on screen, which is what makes
it playable across a table rather than side by side.

## The board

A hexagon of radius 3 — 37 cells — addressed in axial coordinates and keyed
`"q,r"`. `CELLS` fixes the order once, `KEYS` and `INDEX` hang off it, and
every later loop walks `KEYS` so the result never depends on object
insertion order.

`state.cells` holds only the cells that are **still on the board**: a key
that has been removed is deleted rather than set empty. So `k in state.cells`
means "there is a ring here" and `state.cells[k]` means "a bee is on it".
That distinction carries the whole game and is worth keeping straight when
changing anything here.

Cells are positioned from `--x`/`--y` custom properties as multiples of one
hex step, with a second pair for the rotated layout; the stylesheet picks.
No layout JS, no resize handler.

## Nobody owns the bees

Both players draw from one pool — 6 light, 8 mid, 10 dark — and both take
from the same board. Win by holding **3 light, 4 mid, 5 dark, or 2 of every
kind**. Since there is one pool, taking a colour is as much about denying it
as collecting it.

The three kinds differ by **lightness, not hue**, so the game reads the same
with no colour vision. They are not the site's player colours and must not
become them: these are pieces, not identities.

## A turn

1. **Jumping is compulsory.** If any bee can jump an adjacent bee into the
   empty cell beyond it, it must, and the same bee keeps jumping while it
   can (`state.chain` pins it). The jumped bee is taken.
2. Otherwise **place a bee and take a cell away** — one move, not two.
   `state.phase` goes to `'remove'` after the placement and the turn does not
   end until a cell comes off.
3. **If no cell can be removed**, the placement is the whole move. This is
   checked *before* handing over, which is why `place()` looks at
   `removableCells()` rather than assuming there is always one.
4. When the pool is empty a player places **from what they have taken**,
   which is a real cost late on — `placeable()` returns the pool, or that
   player's own stack once the pool dries up.
5. A player with **no move at all loses** (`stuck()`).

**A cell only comes off the edge.** `removable()` asks for two *consecutive*
open sides, walking `DIRS` as a cycle — anything else would have to slide
out past its neighbours. That is the whole rule, and it is why `DIRS` is in
cycle order rather than any convenient order.

### Cutting the comb

Removing a cell (or a jump landing where it does) can split the comb.
**Every group that is not the largest leaves the board, and the player who
cut it off takes any bees that were on it** — full group or not.

An earlier version only claimed a group when *every* cell in it held a bee,
and left anything else sitting there detached. That was wrong twice over: a
detached ring can never be jumped to or from again, so it is clutter that
counts towards nothing, and a player who cuts off two bees and an empty ring
had done exactly the thing the rule is meant to reward.

`claimIsolated()` therefore:

- builds the connected groups by walking `KEYS`, so the order is stable;
- keeps the **largest** as the comb, ties going to the group holding the
  earliest cell in board order — never to whatever the store happened to
  iterate first;
- deletes the rest and adds their bees to the mover's stack.

It runs after a placement that ends the turn, after a removal, and after
each jump — before `endTurn()`, so bees claimed this way can win the game on
the move that took them.

## Undo

`undoStack` is in memory only, like the other board games'. A reload keeps
the position and loses the ability to take moves back, which is the honest
trade: the alternative is persisting a history that a second player never
agreed to.

## Persisted state

`localStorage` key `games.honeycomb-3-bees.v1`:

```json
{
  "cells": "wg.b--..…",
  "pool":  { "w": 4, "g": 6, "b": 8 },
  "caps":  [{ "w": 1, "g": 1, "b": 1 }, { "w": 0, "g": 1, "b": 0 }],
  "turn": 1,
  "phase": "move",
  "chain": null,
  "winner": 0
}
```

`cells` is 37 characters in `KEYS` order: `-` removed, `.` empty, or the bee
on it.

**Bees are conserved, and `load()` checks it.** Board plus both stacks plus
the pool has to equal the supply for every colour, or the save is not a
position this game could have reached and a fresh board is started instead.
That check is the reason the encoding is worth its awkwardness: it makes a
corrupt or hand-edited save fail loudly rather than quietly hand somebody
extra bees.

## Player colours

The turn indicator uses the shared pattern from `CLAUDE.md` — the piece
carries the identity, the words carry the state, and a `.visually-hidden`
label holds the full sentence for screen readers. The hint line under it
says what the phase wants ("Now take a cell off the edge"), and that same
sentence is appended to the screen-reader label, so nothing is colour-only.
