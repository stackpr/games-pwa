# 10,000 (Dice)

Press your luck with six dice. Roll, set aside what scores, and decide
whether to roll again or bank what you have — 2 to 12 players, first to
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

The pass-the-phone game for a group rather than a pair. Four in a Row and
tic-tac-toe seat exactly two; 10,000 is the one that scales to a table of
twelve, which is why the player count is a setting rather than a constant.

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
- **Stop!** banks the turn score plus the current selection.
- The game does not enforce a minimum to get on the board; some variants
  require 500 before your first bank.

### The last lap

**Reaching 10,000 does not end the game — it starts the last lap.** The seat
that got there is recorded as `closer`, play carries on round the table, and
the game ends when the turn comes back to that seat. Everyone else gets
exactly one turn to pass them.

**Highest score wins**, not whoever crossed the line first, so a last-lap
player who banks 10,400 takes it from the 10,100 that opened the lap. A tie
goes to the `closer`, which is the natural reading: they got there first and
nobody beat them.

Two consequences worth knowing:

- The winner is **not** `state.current` when the game ends — the turn has
  rolled past everybody by then. `leader()` computes it, and the status line
  and the spec both read it from there. Printing the current seat is the
  bug this rule introduces if you are not looking for it.
- On the last lap the status line **leads with the number to beat**
  (*"Last turn — beat 10,100."*) rather than trailing it. That figure is
  what the player is deciding against on every roll, so it goes first and
  the turn total follows.

A bust on the last lap is an ordinary bust: the turn is lost and play moves
on, closing the lap in its own time.

`closer` is persisted and validated as a seat index, so a game paused
mid-lap resumes with the lap still open. It resets to `null` on a new game
and whenever the player count changes, since the seat it pointed at may not
exist any more.

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

The roll is a **scripted timeline, not a simulation.** A die drops in from
above the tray, bounces three times at falling heights, then hops along at a
constant low height until it reaches its slot:

| Stage | Duration | Height |
| --- | --- | --- |
| Drop in | 170ms | from above the tray to the floor |
| Bounce 1–3 | 250ms × √apex | 1.00, 0.52, 0.27 of the peak |
| Low hops ×3 | 250ms × √0.085 ≈ 73ms | a constant 0.085 |

Roughly 965ms end to end, plus 35ms of stagger per die.

It began as real physics — random velocities integrated against gravity with
damped wall reflections — and that was the wrong tool. Free physics gives a
mushy, slow decay, no way to say "exactly three bounces", and no way to make
the tail read as a die pattering to a stop rather than drifting. A timeline
gives all three, and it is far easier to test: a spec samples the die's
height every frame and reads the apexes straight back off it.

Each hop is a parabola whose duration scales with **√apex**, the way a real
bounce does. That is what keeps the low hops quick patters instead of slow
floats — halving the height shortens the hop rather than just flattening it.

Horizontal travel and spin both ease across the *whole* timeline rather than
per hop, so a die drifts toward its slot while it bounces instead of sliding
at the end. Rotation lands on the **nearest whole turn**, so a die that has
spun 700° finishes at 720° rather than visibly unwinding.

Faces flicker every 70ms while the die is still bouncing high, and the real
face appears when the three big bounces are done — so the last stretch of
low hops reads as a die that has already settled on its result.

`prefers-reduced-motion: reduce` skips the whole timeline and places the
dice directly, which is also what the specs use to stay deterministic.

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

## Surviving a half-updated client

Every listener is bound through a small null-tolerant `on()` helper rather
than `el.thing.addEventListener` directly. That is not defensive
programming for its own sake — it is a fix for a real failure.

`sw.js` calls `skipWaiting()` on install and `clients.claim()` on activate,
so a new service worker can take over a page **that is already loading**.
The HTML can come from the outgoing worker and the script from the incoming
one. When the settings overlay landed, this page's script gained a hard
dependency on a `#settings-close` button that the previous release's markup
did not have, so on those loads `el.settingsClose.addEventListener` threw,
the whole IIFE aborted, and the page rendered **no dice, no seats and no
working buttons** — which is exactly how it was reported.

Two rules come out of it:

- A missing control should cost that control and nothing else. One `null`
  must never take the game down with it.
- More generally, **a game's script has to tolerate markup from the
  neighbouring release.** Adding an element and using it in the same version
  is normal and fine; assuming it exists is what breaks.

A spec covers this by intercepting the page HTML, deleting the Close button
and asserting the game still deals its dice.

## The scoreboard

Seats run **three across** and wrap onto further rows, so six players are
two rows of three rather than six slivers. The grid's column count is set
from the player count rather than fixed at three, so two players still fill
the row instead of leaving a hole. The settings button sits alongside the
whole block and stretches to its full height.

**Past six players it switches to four across.** Three would mean four rows
of seats at twelve players, and the rows come straight out of the tray's
height; four across keeps it to three rows. Seats get narrower rather than
the tray getting shorter, which is the right trade when a seat only has to
hold `P12` and a score.

The row count is not free, so it is not guessed at: JS sets `--seat-rows`
whenever it builds the seats, and `--chrome` is a sum — a measured `9.2rem`
of top bar, status line and controls, plus `3.05rem` per seat row. Getting
this wrong does not misalign anything, it pushes the bottom of the tray off
the screen, so a spec asserts the tray stays square with no overflow at 2,
7 and 12 players. Landscape gets compact seats and a smaller per-row figure
because height is the scarce axis there.

## The settings overlay

The player count opens as a **full-screen overlay with a dimming scrim**,
not as a panel inline in the column. Inline it pushed the board down and
competed with the tray for the height the tray sizes itself against, which
is a real failure and not just a cosmetic one — the tray's size is computed
from `--chrome`, and a panel that appears and disappears is not in that sum.
Floating it over the board takes it out of the layout entirely.

Fading needs **both `opacity` and `visibility`**, and the `visibility`
transition needs a delay:

```css
transition: opacity 160ms ease, visibility 0s linear 160ms;   /* closed */
transition: opacity 160ms ease, visibility 0s;                /* open   */
```

`visibility` is what stops a closed overlay swallowing taps and holding
focusable buttons; `opacity` alone would leave an invisible sheet over the
whole page. But `visibility` cannot be interpolated, so without the delay
it flips immediately and the fade-out never appears — the panel just
vanishes. Delaying it by exactly the fade duration on the closed state, and
not at all on the open state, is what gives a fade in *and* out. The
`hidden` attribute cannot do this at all, since `display: none` snaps.

It closes on the Close button, on a tap on the scrim but not the panel, and
on Escape. Focus moves to the first count button on open and back to the
settings button on close, so it does not strand a keyboard user behind the
scrim. `prefers-reduced-motion: reduce` drops both transitions.

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
