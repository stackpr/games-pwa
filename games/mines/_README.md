# Mines

The classic clear-the-minefield puzzle. Tap a square to open it, the number
tells you how many of the eight squares around it are mined, and you win by
opening every square that is not.

## The name

Not the trademarked one. Game rules are free to reimplement and this one is
thirty years old, but the obvious name is a Microsoft product and would end
up in the slug, the storage key, the precache list and the commit history.
`Mines` is the traditional descriptive name — the same route GNOME took for
its own version. See Naming a game in CLAUDE.md.

## The board is cut to fit the screen

There are no fixed 9×9 / 16×16 / 30×16 boards here. **Difficulty sets how big
a square is and how thick the mines are; the columns and rows fall out of the
screen you are holding.** So a phone in portrait gets a tall board, a phone
in landscape gets a wide one, and the board is only square by coincidence.

| Level | Square | Mines |
| --- | --- | --- |
| Easy | 48px | 12% |
| Medium | 40px | 16% |
| Hard | 34px | 21% |

Two limits shape the result, and they pull in opposite directions on purpose:

- **A square never gets smaller than its level's size**, because a square you
  cannot reliably hit with a thumb is not a square you can play. The level's
  size is a *floor*, not a target: once the columns and rows are fixed, the
  squares take whatever room is left over, so the board fills the screen
  instead of sitting in the middle of it.
- **The whole board is capped at `MAX_CELLS` (400).** A desktop window would
  otherwise produce a 30×15 field of 40px squares and turn a two-minute game
  into a ten-minute one. When the cap is hit, `fit()` grows the square by 2px
  and measures again — so a big screen gets **bigger squares, not more of
  them**. That loop is the whole of the "enforce max squares" rule; there is
  no separate column or row limit to keep in step with it.

`MIN_COLS` / `MIN_ROWS` (5) stop a very short landscape window from producing
a board two rows tall.

Mines are `round(cols × rows × density)`, clamped to leave at least ten
squares free so the opening click's safe patch always fits.

### Measuring, and when a resize re-cuts the board

The fit is computed from the **stage element's own box**, not from
`window.innerHeight` minus a guess at the chrome. That is why this page has
no `--chrome` token: the number that matters is measured rather than
declared, so the top bar or the footer can grow without anyone remembering to
update a reserve. A `ResizeObserver` on the stage drives it, which also
catches `js/lib/viewport.js` publishing a shorter `--measured-height` a beat
after load.

What a resize does depends on whether the game has begun:

- **Before the first click** (`status: 'ready'`) the board is **re-cut** —
  new columns, rows and mine count for the new shape. Rotating the phone
  before you start gives you a board that fits the way you are holding it.
- **After the first click** the board is only **rescaled**: the columns and
  rows stay, and the squares shrink to fit. Re-cutting would throw away the
  game in progress, which is a much worse outcome than small squares for as
  long as the phone is sideways.

## Rules, and the edges of them

- **The first click is always safe.** Mines are not laid until you have
  clicked, and then they avoid the clicked square *and its eight neighbours*,
  so an opening click always opens a patch rather than a lone `1`. If the
  board is too small for a 9-square exclusion the safe zone shrinks to the
  clicked square alone, which cannot happen at any shipped density but is
  cheap to guarantee.
- **Zero cascades.** Opening a square with no mines around it opens its
  neighbours, iteratively (an explicit stack, not recursion — a 400-square
  cascade is deep enough to be worth not putting on the call stack).
- **Chording**: tapping an already-open number that has exactly that many
  flags around it opens the rest of its neighbours. On a phone this is the
  difference between playable and tedious. It can lose you the game if your
  flags are wrong, which is the standard bargain.
- **A flagged square is never opened by a tap**, only by unflagging it first.
  This also means flagging a *safe* square makes the win unreachable until
  you take the flag off — correct, and the same as everywhere else.
- **Winning auto-flags** whatever mines are left, so the counter lands on
  zero and the found mines carry the win ring.
- **Losing** shows every mine and greys the flags you got wrong.

## Flagging

Three ways in, because one is never enough across touch and desktop:

- **Flag mode** — the big toggle in the footer. While it is on, a tap flags.
- **Press and hold** (400ms) — always flags, whatever the mode says.
- **Right-click** — desktop.

The long-press and the tap share one square, so a fired long-press sets a
`swallow` flag that eats the click behind it. That flag is cleared on the
next `pointerdown` rather than trusted to be consumed: a long press on touch
does not reliably produce a click afterwards, and a stale `swallow` would eat
someone's next real tap.

## Best times

Kept per **board**, not per difficulty, because on this site the two are not
the same thing — the same "Medium" is 9×11 on a phone and 27×14 on a laptop,
and one time list holding both would be meaningless. The key is
`level:colsXrowsXmines`, the top 5 times are kept for each, and the list is
capped at 12 boards with the least recently used dropped first, so a phone
that has seen a few window sizes does not accumulate them forever.

A time is wall-clock from the first click to the last safe square.

## The clock, and reloads

`elapsed` accumulates while the game is running and is saved on every action.
A reload **resumes from the saved value** rather than counting the time the
page was closed — the alternative punishes a phone call in the middle of a
game. The cost is that up to a few seconds of the current run can be lost on
a reload with no action in between, which favours the player slightly and is
the right way round for a score list nobody is auditing.

## Persisted state

`localStorage`, key `games.mines.v1`, one object:

```json
{
  "level": "medium",
  "cols": 9, "rows": 11, "mineCount": 16,
  "mines": "0100100…",
  "mask": "0012000…",
  "status": "playing",
  "elapsed": 41200,
  "boom": -1,
  "flagMode": false,
  "scores": {
    "medium:9x11x16": { "level": "medium", "cols": 9, "rows": 11,
                        "mines": 16, "at": 1754600000000, "times": [41200] }
  }
}
```

`mines` and `mask` are packed as digit strings (`0`/`1`, and `0` hidden /
`1` open / `2` flag) rather than arrays, which keeps a 400-square board at a
few hundred bytes instead of a few kilobytes of JSON commas.

Everything is validated on load: wrong string lengths, out-of-range digits, a
board over the cap, or a game claiming to be under way with no mines laid all
fall back to a fresh board. The scores survive that fallback, since they are
parsed separately.

## Layout notes

- The mine and flag glyphs are inline SVG `<symbol>`s used by reference, not
  emoji: emoji size and colour differently on every platform, and these have
  to line up inside a 34px square. The face button is an emoji, because it is
  a piece of UI rather than board art.
- Numbers use the classic 1–8 colour set, adjusted for a dark board. They are
  never the only signal — the number itself is the information.
- No `css/players.css`: one player, no sides, so `--player-1` and
  `--player-2` would be borrowing tokens that mean something else everywhere
  on the site. Same reasoning as Counter.
