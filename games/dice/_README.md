# Dice

One to six dice, rolled. Nothing else.

## Use case

The tool you open when the board game is in front of you and the dice are
not — lost in the sofa, missing from the box, or you are playing something
improvised. It is a substitute for physical dice, so it deliberately knows
nothing about any particular game: no scores, no turns, no rules.

That restraint is the point, and it is the line to hold when changing this
page. Anything that starts tracking whose roll it was, or what the roll is
worth, belongs in a game — 10,000 is right next door — not here. If you
find yourself wanting a total, ask first whether the thing you actually
want is a new game.

## Interaction

- **Pick a count** from the row along the top: 1 to 6. The buttons stay on
  screen rather than hiding behind a settings toggle the way 10,000's
  player count does, because here it is the only setting and it gets
  changed constantly.
- **Roll** with the button, or by tapping the tray itself. Tapping the dice
  is the natural gesture for a dice tray, and the whole square is the
  target.
- Roll is disabled while the dice are in the air, so a second tap cannot
  restart the animation halfway through.
- **Nothing is selectable.** Dice are `<span>`s, not buttons, so there is
  no keeping, no locking, and nothing in the tab order. That is the
  clearest difference from 10,000 and the library supports it directly:
  omitting the `onPick` option is what makes the dice inert.

Changing the count clears the previous roll rather than keeping some of it.
Six dice showing a roll of two would be a lie about what was thrown.

## Layout

Die size comes from the count, not a constant — `js/lib/dice.js` derives it
so one die fills a good part of the tray while six share it. A single die
lands centred; six land in a row with even gaps. A spec checks every count
from 1 to 6 fits inside the tray on one row.

The tray is square and capped by width, by height (`100dvh - var(--chrome)`)
and by `26rem`, the same arrangement 10,000 uses.

## Persisted state

One JSON object under `games.dice.v1`:

```json
{ "count": 3, "faces": [2, 4, 6] }
```

The last roll is kept so a reload shows what was on the table rather than a
blank tray. A saved `faces` array whose length does not match `count` is
dropped entirely instead of being padded — half a roll is not a roll that
ever happened, and showing three real dice beside a made-up fourth would be
worse than showing none.

## Relationship to 10,000

Both pages are thin layers over `js/lib/dice.js`, which owns the dice
elements, the pip markup and the whole bounce-and-settle animation.
`games/ten-thousand/_README.md` documents the physics and the two bugs that shaped
it — the dice must be rendered before the roll starts, and percentage
padding on a die silently collapses the pips.

What stays in each game is what differs: 10,000 owns scoring, turns, keeping
and its kept-die ring; Dice owns the count selector and the fact that
nothing is interactive.
