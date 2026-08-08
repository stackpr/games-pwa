# Maze

A race. Everyone opens the game on their own phone, one person reads out a
five-letter code, everyone types it in, and they all get **the same maze**.
Someone counts down, everybody starts, and the first one out wins.

Nothing here connects the phones. There is no lobby, no timer sync, no
"players ready" — the code is the whole protocol, and the countdown is done
out loud in the room. That is deliberate: the site is 100% static with no
backend (see CLAUDE.md), and a shared seed buys the one thing that actually
matters, which is that everyone is solving an identical maze.

## The code

Five letters, A–Z, in a consonant–vowel–consonant–vowel–consonant pattern
(`MOKAT`, `RUDEB`) so it can be shouted across a room and typed without
ambiguity. Two things come out of it:

- **The maze itself.** The code is hashed (FNV-1a) into a seed for a
  `mulberry32` PRNG, which drives the carve. Same code, same maze, on every
  device and every release — the generator must therefore never change
  behaviour without being treated as a breaking change, because a phone on
  the old code and a phone on the new one would silently be running
  different mazes under the same name.
- **The maze size.** The *last* letter selects it:
  `MAZE_SIZES[letterIndex(last) % 4]` over `[15, 21, 25, 31]`. The size has
  to travel with the code — two people on different grid sizes are not
  racing the same thing — and there is nowhere else to put it.

A useful side effect: **any five letters is a valid code.** Type `HELLO` or
someone's name and you get a real, solvable maze. Generated codes just
happen to pick a final consonant that lands on the size you asked for.

## Generating the maze

An odd-sized grid of tiles, every tile a wall to start, carved by an
iterative recursive-backtracker over the tiles at odd coordinates: from the
centre tile, knock down the wall between the current cell and a random
unvisited neighbour two away, and back up when there is nowhere to go.

That yields a **perfect maze** — a spanning tree over the cells, exactly one
route between any two of them, no loops. This is why *"ensure there is a
path out"* needs no check and no retry loop: every carved cell is connected
to every other by construction, and the exit is opened next to a carved
cell, so it is reachable from the start by definition. A spec asserts it
anyway, by breadth-first search over a handful of codes at every size.

The exit is a single opening in the border. Candidates are every border tile
next to a cell on the outer ring; the winner is the one whose neighbouring
cell is **furthest from the start** by BFS distance, with the seeded PRNG
breaking ties. Picking the furthest is what stops a maze occasionally
handing out an exit four steps from the start.

The player starts on the centre-most odd tile, so the middle of the maze is
the middle of the first view.

## What you can see

A `view × view` window (3, 5, 7 or 9 — 5 by default) centred on you, always.
You move, the world moves; your marker never leaves the middle square. What
falls outside the maze is drawn as wall, so the border reads as solid.

**The trail** is the last *n* squares you stood on, shaded and fading with
age — newest at 0.5 alpha down to 0.06 for the oldest. `n` is a setting
(none / 5 / 10 / 20, default 10) because it is the difficulty dial: with no
trail you will re-walk corridors you have already exhausted, and with 20 the
25×25 maze is mostly bookkeeping. A square walked twice shows its most
recent visit rather than its oldest, so a fresh pass through an old corridor
brightens it. `PATH_CAP` (32) is how many positions are kept regardless, so
turning the setting up later still has something to show.

Settings are offered as a fixed set of buttons rather than a slider: a
slider on a phone is a fiddly way to pick one of four numbers, and the
options are discrete anyway.

## Settings, and which of them are shared

| Setting | Shared? | Why |
| --- | --- | --- |
| Maze size | **Yes** — carried in the code | Two sizes are two different races. Changing it draws a new maze and a new code, and the sheet says so. |
| How much you can see | No | A personal comfort setting; it changes how hard *your* run is, and the room can agree to match it if they care. |
| Squares remembered | No | Same. |

Only the first person needs to touch the size — everyone else gets it by
typing the code.

## Layout

Full-height page in the site's usual shape: top bar, board, then status and
D-pad. Portrait stacks them; landscape puts the pad beside the board. The
board is square and sized against `var(--app-height) - var(--chrome)`, with
`--chrome` reserving the vertical space the bar and pad need, so growing
either cannot push the board off the bottom of the screen. `--app-height`
comes from `js/lib/viewport.js`; see The Android bottom-bar bug in
CLAUDE.md.

Movement is the D-pad, arrow keys, WASD, or a swipe on the board itself
(24px threshold). Directions that face a wall are dimmed rather than
disabled — a disabled control reads as broken, and the wall is already
visible in the view.

The player marker is amber and the exit is green: **local, semantic colours,
not `css/players.css`.** Maze has no sides, so `--player-1` / `--player-2`
would be borrowing tokens that mean "first player" and "second player"
everywhere else on the site. Same reasoning as Counter's `--up` / `--down`.

The win panel sits over the board rather than behind a modal scrim, so the
route out stays visible while the room compares times.

## Persisted state

`localStorage`, key `games.maze.v1`, one object:

```json
{
  "code": "MOKAT",
  "view": 5,
  "trail": 10,
  "x": 11,
  "y": 11,
  "path": [[11, 12], [11, 13]],
  "steps": 2,
  "startedAt": 1754600000000,
  "finishedAt": null,
  "pending": false
}
```

The maze is **not** stored — it is rebuilt from `code` on every load, which
is the same guarantee the other players rely on. `startedAt` is stamped on
the *first move*, not on load, so opening the page early costs nothing;
`finishedAt` stops the clock. `pending` is whether the start sheet has been
dismissed yet, which is what makes a reload mid-run resume straight into the
maze instead of re-opening the sheet.

Everything is validated on load: a bad code, an out-of-bounds position or a
position inside a wall falls back to a fresh run rather than to a corrupt
one. A saved position sitting on the exit is treated as a finished run even
if `finishedAt` went missing.

## Edge cases

- **Reload mid-run** keeps your position, steps and clock (the clock runs on
  wall time, so it keeps counting while the page is closed — this is a race
  timed by the room, not a stopwatch you can pause).
- **Stepping onto the exit ends it**; the pad dims and the panel shows your
  time and step count.
- **Changing the view size mid-run** is allowed and only changes what you
  can see; it does not reset anything.
- **A code typed in lower case, or with spaces or punctuation**, is upper-cased
  and stripped before validation; anything that is not then exactly five
  letters is refused with a message rather than silently accepted.
