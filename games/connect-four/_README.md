# Connect Four

Two players, one phone, passed back and forth. Seven columns, six rows,
four in a row wins.

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

A Connect Four piece has no shape to distinguish it, only color, so this
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
width and the available height (`(100dvh - 11rem) * 7 / 6`), so it grows to
fill a phone in portrait but never pushes the turn indicator or the top bar
off-screen, and never scrolls. Cells are drawn as circular holes cut out of
the frame — the gaps between them are the frame color showing through.

## Persisted state

One JSON object under `games.connect-four.v1`, holding only the move list:

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
