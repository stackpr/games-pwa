# Mancala

Two-player Mancala on one device, with **two rule sets to choose between**.

## The name

*Mancala* is the generic name for the whole family of sowing games — it is
not a brand and not a trademark. The two rule sets are named for what they
do (**Capture**, **Avalanche**) rather than after any product, which is the
same reason this game is not called after the boxed version most people
learned it from. See "Naming a game" in `CLAUDE.md`.

## The board

Fourteen cells, indexed the way the seeds travel:

```
 0-5   player 1's six pits
 6     player 1's store
 7-12  player 2's six pits
 13    player 2's store
```

Sowing is always `i + 1` modulo 14, skipping the *opponent's* store. That
one line of arithmetic is why the indices are laid out this way; the pit
facing `i` is `12 - i`, which falls out of the same ordering.

Four seeds per pit, stores empty. **Player 1 moves first**, the site-wide
rule.

## The two rule sets

Both share the sowing direction, the skipped store, the end condition and
the win condition. Everything that differs happens when the *last* seed
lands, and lives in `play()` and nowhere else.

**Capture**

- Last seed in your own store → **you go again**.
- Last seed in an **empty pit on your own side** → you take it and the
  contents of the facing pit into your store. If the facing pit is already
  empty nothing is captured, and the turn simply passes. (Some houses let
  you capture the lone seed anyway; this one does not, which is the more
  common reading.)
- Anything else → the turn passes.

**Avalanche**

- Last seed in an **occupied** pit → scoop that pit up and keep sowing from
  there. Repeat until it stops.
- Last seed in your store, or in a pit that was empty → the turn passes.
- No captures, and never an extra turn.

Avalanche always terminates, which is not obvious. Count the total distance
every seed still has to travel to reach the mover's store. Every dropped
seed reduces that by one, and a seed never passes the mover's store without
being deposited in it — so the count strictly falls and the chain cannot
cycle. The note line reports the lap count when it took more than one.

## Ending

The game ends **the moment either side's six pits are empty**, checked after
every move — including one that would otherwise have earned an extra turn.
The other player sweeps whatever is left in their own pits into their own
store. Most seeds wins; equal is a draw.

Choosing "either side empties" rather than "the player to move has nothing"
keeps a single check and avoids the mid-turn limbo where one side is empty
but play continues. It is the usual rule for both sets.

## Layout

The board is one grid with `grid-template-areas`, laid out two ways:

- **Landscape** is the physical board — stores at the ends, player 2's row
  on top running right to left, player 1's along the bottom.
- **Portrait** is that board rotated a quarter turn: player 2's store at the
  top, player 1's at the bottom, the two rows becoming the left and right
  columns. Player 1's pits read `0-5` down the left, player 2's `12-7` down
  the right, so the seeds still travel one continuous loop — down the left,
  through the bottom store, up the right, through the top store.

Named areas do the work because each pit gets one `grid-area: p7` rule that
serves both layouts; the alternative is fourteen coordinate pairs written
twice. The board reserves vertical space with `--chrome` and sizes its
*width* from the height budget, since `max-height` plus `aspect-ratio`
silently breaks the ratio rather than the height.

Seeds show as pips up to twelve, then as a number — past a dozen the pips
stop being countable at a glance and only take up room. Stores are always a
number, because the store total is the score and that is what gets read.

## Persisted state

`localStorage` key `games.mancala.v1`:

```json
{ "board": [4,4,4,4,4,4,0,4,4,4,4,4,4,0], "turn": 1, "over": false,
  "rules": "capture" }
```

A restored board is rejected unless the seeds still total 48, because every
legal move conserves them — a save that does not add up is corrupt, and
starting fresh beats resuming a position that cannot have happened. Undo is
in memory only, like the other board games here.

Changing the rule set **starts a new game**: the two sets diverge enough
that a position halfway through one is not a meaningful position in the
other.
