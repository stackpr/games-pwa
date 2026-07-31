# Tic-Tac-Toe

Three in a row on a 3×3 grid. Player 1 is X, player 2 is O.

## Use case

The other two-player shared-screen game, and deliberately the small one
next to connect-four. It exists because it is the shortest possible game
that still needs a turn indicator, a win check and a draw — which makes it
the page to open when checking that those shared patterns still look right.

No AI opponent, for the same reason as connect-four: solving tic-tac-toe is
easy, but an unbeatable opponent is a worse game, and a deliberately
fallible one needs a difficulty setting nobody asked for.

## Interaction

- **Touch an empty square** to place your mark. Played squares are disabled,
  so a square can never be overwritten.
- **Undo** takes back one move at a time, including the winning move, which
  resumes the game.
- **New game** clears the board, with no confirm.

There are no keyboard shortcuts here. Nine squares have no natural key
mapping the way connect-four's seven columns map onto the number row, and
the squares are reachable by Tab as ordinary buttons.

## Rules and edge cases

- Player 1 (X) always moves first; the turn is `moves.length % 2`.
- A win is three in a row along any of the eight lines — three rows, three
  columns, two diagonals. The winning three are highlighted; see below.
- **The game stops at a win**, so the ninth square cannot be filled after a
  win on the eighth.
- A full board with no line is a draw.
- The first matching line wins if a corrupt save somehow contains two.

## Marks and color

X and O are inline SVG, stroked in the shared player colors — X in
player 1's blue, O in player 2's red. The shape carries the identity as
well as the color, so the board is still readable without color vision;
the turn indicator names the player in text for the same reason.

A freshly played mark draws itself in: the strokes animate from a full
`stroke-dashoffset` down to zero, X one line after the other. Only the new
mark animates — restored and post-Undo marks are simply present, matching
connect-four's rule that a reloaded board should not replay itself.
`prefers-reduced-motion: reduce` turns this off.

## The winning line

The three winning squares are ringed in `--player-ink` and pulse — the
site-wide way of marking a win, the same treatment connect-four gives its
four discs. See Marking the winning line in CLAUDE.md for the rules; the
one worth repeating here is that **the ring, not the pulse, carries the
highlight**. It is what marks the line at the dim half of the animation,
under `prefers-reduced-motion: reduce`, and in a screenshot.

What differs between the two games is only the unit being ringed. A
connect-four piece is a disc, so the ring is round and sits on the disc. A
tic-tac-toe mark is an open stroked shape with no fill to ring, so the
square is ringed instead, matching the cell's own 10px radius. Ringing the
X and O themselves was the alternative and it looked like a stroke weight
bug rather than a highlight.

The board is square, capped by width, by height (`100dvh - 11rem`) and by
`30rem` so it does not become comically large on a desktop monitor. The
turn indicator sits above it in the same position and the same markup as
connect-four's, which is the point — the two games should feel like one
family.

## Persisted state

One JSON object under `games.tic-tac-toe.v1`:

```json
{ "moves": [4, 0, 8] }
```

Each entry is a square index, 0–8, reading left-to-right then top-to-bottom
(so 0 is the top-left corner and 4 is the centre). The grid, the turn, the
winner and the winning line are all derived from the list, exactly as in
connect-four.

On load the list is truncated at the first illegal move — a bad index, a
square already taken, or any move following a winning one — so a corrupt
save degrades to the longest valid position rather than throwing.
