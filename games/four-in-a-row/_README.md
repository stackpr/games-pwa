# Four in a Row

Two players, one phone, passed back and forth. Seven columns, six rows,
four in a row wins.

## The name

The generic name for the game. It was originally built here under a brand
name, which is a trademark — rules are free to reimplement, names are not.
See Naming a game in CLAUDE.md.

The rename changed the slug and therefore the storage key, from
`games.connect-four.v1` to `games.four-in-a-row.v1`. **Saved games from
before the rename are not migrated and simply do not load**, which was a
deliberate call: this is a two-player game finished in a couple of minutes,
and carrying a compatibility shim for a half-finished board forever costs
more than the board is worth. The old key is left in place rather than
deleted, since a page that has been renamed has no business reaching for
storage under its old name.

## Use case

The classic game with no AI opponent — this is a shared-screen game for two
people sitting together, the same posture as the scorekeeper. There is
deliberately no single-player mode: an opponent would need a search routine
and a difficulty setting, which is a much larger thing than this page.

## Interaction

- **Touch a column to drop.** The touch target is the whole column, full
  height, not the individual cell. On a phone that is a target roughly
  6× taller than a single cell, which is what makes the game playable with
  a thumb. Where the finger lands vertically is irrelevant; gravity decides
  the row.
- **Number keys 1–7** drop in that column, so the game can be driven from a
  desktop keyboard.
- **Undo** takes back one move, repeatedly, all the way to an empty board.
  It works after a win too — undoing the winning move resumes the game,
  which falls out of deriving everything from the move list rather than
  storing a "game over" flag.
- **New game** clears the board. No confirm: Undo can rebuild a position,
  and a mis-tap costs one tap to fix.

A full column is disabled rather than silently ignoring the touch, so the
board tells you where you can still play.

## Rules and edge cases

- Player 1 drops first and the players alternate strictly; the turn is
  simply `moves.length % 2`.
- A win is any four in a row horizontally, vertically, or on either
  diagonal. The four winning pieces are ringed in `--player-ink` and pulse
  — the site-wide win marker, shared with tic-tac-toe. See Marking the
  winning line in CLAUDE.md. The ring carries the highlight on its own, so
  it still reads with the animation at its dimmest or switched off.
- **The game stops at a win.** Every column is disabled, so no piece can
  land after the fact.
- If the board fills with no line, it is a draw.
- Only one win is ever reported. A position cannot legally contain two
  separate wins, since play stops at the first, but if a corrupt save
  contained one the scan reports the first it finds and stops.

## The turn indicator

Reads `Next: ⬤` while playing and `⬤ Wins!` once won, in the piece's own
color — the disc says whose turn it is, so the words only carry state. See
The turn indicator in CLAUDE.md for the shared rules.

A Four in a Row piece has no shape to distinguish it, only color, so this
indicator is the one place on the site where the visible signal really is
color alone. That is why the visually-hidden `#turn-label` matters more
here than in tic-tac-toe: it is the only thing naming the player for a
screen reader.

## The drop animation

The piece falls from above the board into its slot. The distance is not a
fixed number of pixels — it is `--r` cell-heights, where `--r` is one more
than the landing row index, so a piece landing at the bottom of an empty
column visibly falls further and takes longer than one stacking near the
top. Duration is `200ms + 45ms` per cell fallen.

The keyframes overshoot slightly at 84% and settle back, which reads as a
piece hitting the stack and bouncing. Only the newly dropped piece animates
— pieces restored from a saved game or rebuilt after an Undo just appear,
because a board that re-drops every piece on load looks broken rather than
lively.

**The column does the clipping, not the cell.** The falling disc lives in
the cell it will land in and animates upward out of it, so `overflow:
hidden` on the cell hides the entire fall and the piece appears to
teleport into place — which is how this was first written, and it looked
broken. Clipping at `.col` instead lets the piece travel down the column
and appear from the top edge of the board. This is safe because the cells
above the landing row are always empty, and the landing cell is a later
sibling than all of them, so the piece paints over their holes on the way
past rather than under them.

The disc shadows are given in **pixels, not percentages**. `box-shadow`
does not accept percentage lengths and discards the whole declaration when
it finds one, with no error anywhere — the pieces just render flat. A spec
asserts the computed `box-shadow` is not `none` so that cannot recur.

`prefers-reduced-motion: reduce` turns the fall off entirely.

## Layout

The board holds a 7:6 aspect ratio and is capped by both the available
width and the available height (`(100dvh - var(--chrome)) * 7 / 6`), so it
grows to fill a phone in portrait but never pushes the turn indicator or
the top bar off-screen, and never scrolls. Cells are drawn as circular
holes cut out of the frame — the gaps between them are the frame color
showing through.

In portrait the leftover space is split evenly above and below the board by
a `body::after` spacer, so the board sits centered and the status line
centers in the gap above it rather than hugging the top bar. Two traps live
in that arrangement, and both fail silently:

- **The portrait block must come after `.stage` and `.board` in the
  stylesheet.** A media query adds no specificity, so `orientation:
  portrait` overrides lose to the base rules on source order alone. Written
  above them, the board simply keeps its old sizing and nothing looks
  wrong until you measure it.
- **`max-height` on the board must be `none` in portrait.** The stage is
  content-sized there, so a percentage max-height resolves against a height
  that depends on the board itself. That cycle resolves to a squashed board
  with visibly non-square cells. `--chrome` reserves the vertical space
  instead, which is why it is generous (`11.5rem`) — it covers the status
  band *and* the matching spacer below the board.

A spec asserts both the 7:6 ratio and the centering at two viewport sizes.

## Persisted state

One JSON object under `games.four-in-a-row.v1`, holding only the move list:

```json
{ "moves": [3, 3, 4, 2] }
```

Each entry is a column index, 0–6. The board, whose turn it is, the winner
and the winning cells are all *derived* from this list, which is why Undo
is a single `pop()` and why there is no way for the stored board to
disagree with the stored turn.

On load the list is truncated at the first move that could not legally have
been played — a bad index, a column already full, or anything following a
winning move. A corrupt save therefore degrades to the longest valid
position it describes instead of throwing.
