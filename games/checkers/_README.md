# Checkers

Standard eight-by-eight checkers for two people sharing a phone, with
jumping forced.

## Use case

The third of the two-player, one-phone games, and the first with a real
move generator. Four in a Row and tic-tac-toe both derive everything from a
list of moves; checkers cannot, because a legal move depends on the whole
board and on whether a capture exists anywhere.

No AI opponent, same as the others: a good one is a search problem and a
bad one is a worse game.

## Rules

- Player 1 is blue, sits at the bottom and moves **up** the board. Player 2
  is red and moves down. Player 1 moves first.
- Men move one square diagonally forward, and jump diagonally forward over
  an adjacent enemy onto the empty square beyond.
- **Jumping is forced.** If any capture is available anywhere, only the
  pieces that can capture will pick up. This is the rule the request asked
  for, and it is enforced by move generation rather than by warning after
  the fact — an illegal move is simply not offered.
- **Chains continue.** If the piece that just jumped can jump again, it
  must, the turn stays with the same player, and no other piece may move
  until the chain is finished.
- Reaching the far row crowns a man. **Crowning ends the move**, even when
  another jump is available from the new square — the standard rule, and
  the one that keeps a fresh king from immediately sweeping the board.
- Kings move and jump in all four diagonal directions.
- You lose when you have no pieces, or no legal move. The second case is
  real and does happen: a player can be blocked with pieces still on.

## The board

Dark squares only, 32 of them. Squares are laid out as a plain 8×8 grid and
the light ones are disabled buttons, so they are inert to touch and skipped
by the tab order.

Three states are marked, and they are deliberately different weights:

- **The piece you picked up** gets a `--player-ink` ring.
- **Where it can go** gets a soft dot; a **jump** target gets a larger amber
  one, because a jump is not optional and should not look like a choice
  between equals.
- **Pieces that must move** pulse gently, but only while nothing is picked
  up — once a piece is in hand the board stops shouting. Under
  `prefers-reduced-motion: reduce` the pulse becomes a static amber ring,
  since the animation is the only signal otherwise.

Kings carry an inline SVG crown in `--player-ink` rather than a second disc
or a letter, so the piece reads at a glance at arm's length.

Colours come from `css/players.css`. Blue always moves first here, as
everywhere else on the site.

## Implementation notes

`movesFrom()` returns the steps and jumps for a single square;
`legalMoves()` collects them for a player and applies the two rules that
matter: **if any jump exists, only jumps are returned**, and if a piece is
mid-chain then only that piece is considered at all. Everything the UI
does — which squares are tappable, which are targets, whether the game is
over — is read off that one function, so there is no second opinion about
what is legal.

The win check runs after the turn flips, by asking whether the player about
to move has any move at all. That covers both losing conditions in one
test, since a player with no pieces also has no moves.

## Persisted state

One JSON object under `games.checkers.v1`:

```json
{ "board": "...b.b.b...", "turn": 1, "locked": null, "winner": 0 }
```

The board is 64 characters: `.` empty, `a`/`A` player 1 man/king, `b`/`B`
player 2. `locked` is the square of a piece mid-chain, so a reload drops you
back into an unfinished jump rather than letting it be abandoned.

A save is rejected outright — falling back to a new game — if the string is
the wrong length, holds an unknown character, or **puts a piece on a light
square**. That last one cannot arise from play, so a save containing it has
been hand-edited or corrupted, and guessing at a repair would be worse than
starting over.

**Undo is in-memory only**, like the scorekeeper's. It stacks board
snapshots rather than replaying moves, because a checkers position is not
reconstructible from a move list without also replaying the forced-jump
logic, and a snapshot is a string. The cost is that undo does not survive a
reload, which is the same trade the scorekeeper makes.
