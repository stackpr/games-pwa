# Mancala

Two-player Mancala on one device, with the house rules set one at a time.

## The name

*Mancala* is the generic name for the whole family of sowing games — it is
not a brand and not a trademark. The settings are named for what they do
rather than after any product, which is the same reason this game is not
called after the boxed version most people learned it from. See "Naming a
game" in `CLAUDE.md`.

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

## The rules are independent choices

Every house rule worth arguing about fires on the same event — **where the
last seed landed** — and there are only three kinds of cell it can land in.
So rather than bundled, named rule sets, the game asks one question per kind
of cell, and any combination of the answers is a legal way to play:

| Your last seed lands… | Options | Default |
| --- | --- | --- |
| in **your own store** | Go again / Turn ends | Go again |
| in an **empty pit of yours** | Capture it and the pit facing it / Nothing | Capture |
| …and take another turn? | No / Yes | No |
| in a pit that **already had seeds** | Turn ends / Scoop it up and keep sowing | Turn ends |

Sixteen combinations from four toggles, and they cover the two sets this
game shipped with: *Capture* is `again / capture / no / end`, and
*Avalanche* is `end / none / no / sow`. Bundling them hid the fact that a
table usually disagrees about **one** of these, not all of them — someone
wants the extra turn but no captures, and a named pair cannot express that.

### Why the extra turn is its own axis

The empty-pit rule really asks two questions, and a table can answer them
independently: *do I take the seeds*, and *do I go again*. A three-way
setting (`capture / go again / nothing`) would have made them exclusive and
quietly ruled out the two combinations people actually argue about — capture
without another turn, and another turn without a capture. So the follow-up
is a fourth axis, shown indented under the question it belongs to so it
reads as one rule with two parts rather than as a fourth question.

Both halves are settled on the **same test**: the pit has to be on your own
side. Landing in one of the opponent's empty pits has never earned anything,
and the extra turn does not change that.

A capture takes nothing when the facing pit is already empty. Some houses
let you take the lone seed anyway; this one does not, which is the more
common reading, and it is the one edge case the modal spells out.

Because they all fire on the landing cell, `play()` reads as one loop: sow,
look at where the last seed landed, ask the axes that own that kind of cell
what happens next. Adding another axis means adding a branch there and an
entry in `AXES` — nowhere else, which is exactly what adding the extra-turn
follow-up came to.

**Scoop-and-keep-sowing always terminates**, which is not obvious. Count the
total distance every seed still has to travel to reach the mover's store.
Every dropped seed reduces that by one, and a seed never passes the mover's
store without being deposited in it — so the count strictly falls and the
chain cannot cycle. The note line reports the lap count when it took more
than one.

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
  "rules": { "store": "again", "empty": "capture", "emptyAgain": "no",
             "full": "end" } }
```

A restored board is rejected unless the seeds still total 48, because every
legal move conserves them — a save that does not add up is corrupt, and
starting fresh beats resuming a position that cannot have happened. Undo is
in memory only, like the other board games here.

Each rule axis is validated **on its own** when a save is read, so one
unrecognised value falls back to its own default rather than resetting the
rest. That is also what let the extra-turn follow-up be added without a
storage version bump: an older save simply has no `emptyAgain` key, and it
takes the default like any other unreadable value.

Changing any axis **starts a new game**: a position halfway through one set
of rules is not a meaningful position under another, and quietly carrying it
over would let a player change the rules to escape a bad board.
