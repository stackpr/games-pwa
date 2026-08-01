# Honeycomb: 3 Bees

Two players, one shared pool of bees, and a comb that gets smaller every
turn. Take three light, four mid, five dark, or two of each, and you win.

## The name

This is a fresh build of a published game whose **own name is a registered
trademark**. Game rules are not copyrightable and this implementation is
original; the name is the owned part, so it appears nowhere — not in the
slug, the storage key, the precache list, the specs or the commits.
*Honeycomb: 3 Bees* was chosen by the repo owner. See "Naming a game" in
`CLAUDE.md`.

The theme is not decoration: the board really is a hex comb of cells, and
the win condition really is three of a kind, so the name says what the game
is. The code uses the same words as the rules — cells and bees, never rings
and marbles — because a file whose comments disagree with its UI is a file
that gets half-edited later.

## Nobody owns the bees

That is the thing to understand before anything else, and it is why the two
players' colours never touch the pieces. There are no white bees and black
bees here: there are **thirty-seven cells and twenty-four bees**, and both
players take from the same pile. `--player-1` and `--player-2` mark whose
turn it is and whose tray is whose; the bees get their own scale.

**The three bees differ by value, not hue** — light, mid, dark. That is
deliberate: a lightness ramp survives any colour vision, where three hues
would not. It is also why the rules modal calls them light/mid/dark rather
than naming colours.

An **empty cell sits below the darkest bee** on that same ramp. Get that
ordering wrong — make the empty cell lighter than the dark bee — and a dark
bee reads as an empty cell, which is the one confusion that would make the
board unplayable.

## A turn

**Jumping is compulsory.** If any bee on the comb can jump an adjacent bee
into the empty cell directly beyond it, the player must jump, and must keep
jumping with that same bee while it can. The jumped bee goes to the jumper.
Mid-chain the bee is locked — `state.chain` holds it, and tapping anything
else does nothing.

Otherwise the turn is **put a bee in a cell and take a cell away**, in that
order, as one move:

1. Pick a bee from the pool, then tap an empty cell.
2. Tap a cell to remove. Only cells at the **edge** come off.

If no cell can be removed, the placement is the whole move. The turn does
not end between the two halves, which is why `phase` is `'remove'` rather
than the turn having already passed — an undo takes back the pair.

### What "at the edge" means

A cell comes off if it is empty and has **two neighbouring positions next to
each other** with no cell in them. Two *consecutive* open sides, not two
anywhere: a cell with gaps on opposite sides is wedged and would have to
slide past its neighbours to get out. That is the one rule most likely to be
misread, and it is why `DIRS` is written as a cycle — the check walks the
six directions round and looks for an adjacent pair.

### Cutting a piece of comb off

Remove a cell and the comb can fall into pieces. **Any piece that comes away
from the rest and is full of bees is claimed whole** by the player who cut
it off, and those cells leave the board with it. A piece that still has an
empty cell in it stays put and is played on normally.

The check skips the case where the "piece" is the entire remaining comb,
because a full comb is a finished game rather than an isolation.

### When the pool runs out

You place from **what you have taken**. This is not a footnote: late on, the
only way to keep playing is to spend the bees you are trying to collect, and
a player one bee from winning may have nothing safe to put down. A player
with no jump, no bee and no empty cell **loses**.

## The comb, in percentages

Thirty-seven cells on an axial hex grid, radius 3. Each cell is placed with

```css
left: calc(50% + var(--x) * 14.286%);
top:  calc(50% + var(--y) * 13.977%);
```

where `--x` is `q + r/2` and `--y` is `r * 0.866` — the axial-to-pixel
conversion, in units of one step. **No JavaScript measures anything and
there is no resize handler**, which is the point: the comb is correct at
every width for free.

The two percentages differ because one resolves against the board's width
and the other against its height. `aspect-ratio: 7 / 6.196` is what makes
them describe the same physical distance — 7 steps across, 6.196 down for a
hexagon of radius 3 with half a cell of padding. **Change the aspect and
both numbers have to change with it.**

### Turned thirty degrees in portrait

A hex comb laid out flat across is wider than it is tall, which leaves most
of a phone empty. Turning the whole grid **30°** stands it on a vertex:
same comb, now 6.196 steps across and 7 down, and about a quarter more area
on a 390px phone.

Every cell therefore carries a second pair of coordinates — `--fx` =
`q * 0.866`, `--fy` = `r + q/2` — and a media query swaps which pair is
used, along with the aspect ratio and both step percentages. Both sets are
written by the same loop in `build()`, so **nothing runs on a rotation**:
the stylesheet picks. The media query sits *after* the base rules, because a
media query adds no specificity and source order is what decides.

Thirty degrees turns the comb's rows into columns: the seven ranks of
4-5-6-7-6-5-4 run down `--y` in landscape and across `--fx` in portrait,
which is what the geometry spec checks. A spec also asserts that neighbours
are exactly one step apart under *both* coordinate sets — the cheap way to
catch a squashed board, since a typo in either conversion still renders
something that looks roughly like a comb.

A removed cell is `display: none`, so the comb really does develop holes
rather than showing a ghost.

## Persisted state

`localStorage` key `games.honeycomb-3-bees.v1`:

```json
{ "cells": "----...www.-...", "pool": { "w": 4, "g": 8, "b": 9 },
  "caps": [{ "w": 1, "g": 0, "b": 1 }, { "w": 1, "g": 0, "b": 0 }],
  "turn": 2, "phase": "move", "chain": null, "winner": 0 }
```

`cells` is 37 characters in a fixed order — `-` removed, `.` an empty cell,
or the bee in it.

A restored game is rejected unless **the bees add up**: comb plus both trays
plus the pool must equal 6 light, 8 mid, 10 dark. Every legal move conserves
them, so a save that does not balance is not a position this game could have
reached, and starting fresh beats resuming an impossible one.

Undo is in memory only, like the other board games here.
