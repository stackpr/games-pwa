# Reversi

Two-player Reversi on one device: tap a square, trap a line of your
opponent's discs, flip them.

## The name

The game is sold under a brand name that is a registered trademark.
**Reversi** is the original 1883 name, it is not a trademark, and it is what
this game is called everywhere in the tree — slug, storage key, precache
list, specs. The rules modal says so in a closing note, because a player who
came looking for the branded name deserves to know they found the right
game. See "Naming a game" in `CLAUDE.md`.

## Rules

Standard Reversi, with no variants and no options:

- The four centre squares start filled, player 1 (blue) on d5/e4 and
  player 2 (red) on d4/e5, and **player 1 moves first** — the site-wide rule.
- A move must **flip at least one disc**. Placing a disc traps every
  unbroken run of opponent discs that ends on one of yours, along a row, a
  column or a diagonal; all of them flip. A run that reaches the board edge
  or an empty square traps nothing.
- **No legal move means you pass.** The turn goes straight back to the
  other player, who keeps moving until you have a move again.
- The game ends when **neither** side can move — usually a full board, but
  also when one colour has been wiped out or both sides are stuck.
- Most discs wins; equal counts are a draw.

The one edge case worth naming: a pass is not an event the player confirms.
The move that caused it also produces the pass, so the turn indicator simply
does not change hands and `#turn-label` says *"…, player 2 had no move"* for
a screen reader. Nothing blocks or needs dismissing.

## Layout

- The **tally row** above the turn indicator is the running disc count, and
  it is the whole tension of the game — a comfortable lead can invert in one
  move. The side to move carries a light ring, which is the only place the
  count and the turn are shown together.
- The **turn indicator** is the shared pattern: `Next: ⬤` while playing,
  `⬤ Wins!` once over, `Draw` with the disc hidden via `data-player="none"`.
  See "The turn indicator" in `CLAUDE.md`.
- The board reserves its vertical space with `--chrome` (13.5rem portrait,
  7rem landscape) so it sizes against `100dvh - var(--chrome)` and cannot be
  pushed off-screen by the indicator growing.
- **Legal moves are faint dots**, not outlines. Up to a dozen can be legal
  at once and a strong marker would read as the position rather than as a
  hint.
- **Flips animate by squashing on the X axis** (`scaleX(1) → 0.06 → 1`) with
  a brightness flash at the start, which is close enough to a disc turning
  over. `prefers-reduced-motion: reduce` drops it — the colour change alone
  still carries the information. `render()` removes every `data-flip`, forces
  a reflow and re-applies, because a disc flipped on two consecutive moves
  would otherwise keep the attribute and never restart the animation.

No winning-line marker: Reversi has no line to mark. The final tally is the
result, which is why the counts sit at the top rather than being revealed at
the end.

## Persisted state

`localStorage` key `games.reversi.v1`, a single object:

```json
{ "board": "................", "turn": 1, "over": false, "passed": false }
```

`board` is 64 characters — `.` empty, `a` player 1, `b` player 2 — chosen
over an array because it is a quarter of the size and reads at a glance in
DevTools. Anything that fails to decode falls back to a fresh game rather
than half-restoring.

`passed` is stored only so the screen-reader label survives a reload; the
game does not branch on it. The undo stack is deliberately **in memory
only**, like every other board game here — reopening the app gives you the
position, not the ability to walk it backwards.
