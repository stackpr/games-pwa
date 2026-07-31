# 10,000 (Dice)

Press your luck with six dice. Roll, set aside what scores, and decide
whether to roll again or bank what you have — 2 to 6 players, first to
10,000 wins.

## The name

The traditional name for this six-dice press-your-luck game, after the
score you are racing to. The game is also sold under several brand names —
those are trademarks and are deliberately not used here or anywhere in the
repo. Rules are free to reimplement; names are not. See Naming a game in
CLAUDE.md.

The folder is `ten-thousand` because a slug cannot carry a comma or
parentheses.

## Use case

The pass-the-phone game for a group rather than a pair. Connect Four and
tic-tac-toe seat exactly two; 10,000 is the one that scales to a table of
six, which is why the player count is a setting rather than a constant.

There is no AI opponent and no networked play. Everyone shares the one
screen and hands it on, the same posture as the scorekeeper.

## Scoring

| Combination | Score |
| --- | --- |
| Straight, 1–6 | 1500 |
| Three pairs | 1500 |
| Three of a kind, 1s | 1000 |
| Three of a kind, *n* | *n* × 100 |
| Each die beyond the third of a kind | another set's worth |
| Single 1 | 100 |
| Single 5 | 50 |

The "beyond the third" rule is what keeps the table monotonic: four 1s is
2000, five is 3000, six is 4000, so adding a die can never lower a score.
A fixed "four of a kind = 1000" is the more common house rule, but it makes
four 1s (1000) worth *less* than three 1s plus a spare 1 (1100), and that
inversion is confusing to play against.

Straights and three pairs are only checked when all six dice are in the
selection, since neither can be formed from fewer.

## Rules and edge cases

- **Every kept die must earn its place.** A selection is legal only when it
  scores *and* every die in it contributes. Keeping a 1 and a 3 is illegal
  even though the 1 scores, because the 3 is dead weight. This is what the
  disabled Roll!/Stop! buttons are telling you.
- **Bust** is a roll with no scoring combination at all. The turn score is
  lost and play passes on. Nothing can be kept from a bust.
- **Hot dice**: set aside all six and the whole set comes back, with the
  turn score carried forward. There is no limit on how long a turn runs.
- You must keep at least one scoring die before rolling on or stopping, so
  both buttons stay disabled until the selection is legal.
- **Stop!** banks the turn score plus the current selection. Reaching 10,000
  ends the game there and then — there is no "everyone gets a last turn"
  round, which some house rules add.
- The game does not enforce a minimum to get on the board; some variants
  require 500 before your first bank.

## The dice tray

The tray, the dice elements and the roll animation live in
`js/lib/dice.js`, shared with the Dice roller; `css/dice.css` carries the
die and pip styling. What stays here is the game: scoring, turns, keeping,
and the ring on a kept die. This section documents the shared behaviour
because this game is where it was written and where the sharp edges were
found.

The tray is a square and the dice are positioned inside it in percentages,
so **the physics runs in a 100×100 unit space that does not know or care
how many pixels wide the tray is.** Rotating the phone or landing on a
tablet changes nothing about the simulation. Die size is derived from the
number of dice in play — six dice are 14 units across, one die is 20 — and
the landing slots are spread evenly with the leftover as gaps.

The roll has two phases:

1. **Bounce** (1100ms) — each die gets a random position, velocity and spin,
   then integrates against gravity with damped reflections off all four
   walls. Faces flicker every 80ms while tumbling, so the dice read as
   rolling rather than sliding.
2. **Settle** (700ms, staggered 45ms per die) — each die eases from wherever
   it was to its slot on the bottom row, and the real face is revealed. The
   stagger is what makes them land one after another instead of snapping
   into place together.

Rotation settles to the *nearest whole turn* rather than to zero, so a die
that has spun 700° finishes at 720° instead of unwinding backwards.

`prefers-reduced-motion: reduce` skips both phases and places the dice
directly, which is also what the specs use to stay deterministic.

Two things about this that are easy to get wrong:

- **The dice must be rendered before the animation starts.** They are
  hidden while `data-state` is `idle`, and it is the render that moves them
  to `active`. Animating first leaves an empty tray for the whole roll —
  which is exactly what the first version did.
- **Never use percentage padding on a die.** Percentage padding resolves
  against the *containing block's width*, not the element's own size, so
  `padding: 9%` on a 52px die became 33px a side: the die inflated to 67px,
  the row overflowed the tray, and the pips collapsed to zero width and
  vanished. The pip grid is a separate absolutely-positioned child with
  `inset: 17%`, which does resolve against the die. A spec asserts the pips
  have real width.

## The scoreboard

Seats run **three across** and wrap onto further rows, so six players are
two rows of three rather than six slivers. The grid's column count is set
from the player count rather than fixed at three, so two players still fill
the row instead of leaving a hole. The settings button sits alongside the
whole block and stretches to its full height.

## Colors

This game deliberately does **not** use `--player-1` / `--player-2`. Those are
two fixed identities, and this game has between two and six seats, so
mapping them onto the tokens would break the site-wide promise that a color
means one thing. The active seat is marked with weight and a ring instead
of a hue, exactly so it cannot be mistaken for a player identity.

The two colors it does define are semantic rather than identities, the same
way Counter's `--up` and `--down` are: `--keep` (amber) rings a die you
have set aside, and `--bust` (red) is the bust message and the Next Player!
button.

## Persisted state

One JSON object under `games.ten-thousand.v1`:

```json
{
  "count": 2,
  "scores": [1000, 0],
  "current": 0,
  "turnScore": 350,
  "dice": [{ "face": 5, "state": "kept" }, { "face": 2, "state": "active" }],
  "phase": "picking"
}
```

`state` is one of `idle`, `active`, `kept` or `set`. A whole turn in
progress is saved, so a reload drops you back mid-selection rather than
losing the turn.

`phase` is never stored as `rolling`: an animation cannot be resumed, so a
save caught mid-roll loads as `idle`. Everything is validated on load and a
corrupt save falls back to a fresh two-player game.

## Testing

`ten-thousand.js` draws all six faces **before** it touches `Math.random` for the
physics. That ordering is deliberate: a spec can stub the head of
`Math.random` and force an exact roll without the game needing a test hook
of its own. Under reduced motion there is no physics randomness at all, so
a queue of faces maps one-to-one onto successive rolls.
