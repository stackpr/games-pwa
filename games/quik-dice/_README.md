# Quik Dice

A scoresheet, plus the dice, for the roll-and-cross-off game where four
coloured rows run 2–12 and 12–2 and you cross numbers off left to right.

## The name

The traditional name for this game is a registered trademark, so it is not
used here — not in the slug, the storage key, the title or the commit
history. "Quik Dice" was chosen by the repo owner. See *Naming a game* in
`CLAUDE.md`; the rules are free to reimplement, the name is not.

## Use case

Everyone plays on **their own phone**. Each phone holds one player's sheet
and nothing is shared between them — there is no backend and there never
will be, so the app cannot know whose turn it is or what anyone else
rolled. The turn is driven by the two buttons:

- **Roll** starts your turn: it rolls the dice on your phone and the sheet
  narrows to what that roll allows.
- **Done** ends it and hands play on. If you crossed nothing off, Done
  takes a penalty, which is why the button reads `Done −5` in that case.

**Everything between your Done and your next Roll is the other players'
turns.** That window is the idle state, and the only thing you can do in
it is cross off the *white sum* each of them calls out. Your phone has no
way to know those numbers, so idle mode offers **every number that is
still legal** and trusts you to take the right ones — or none. That is
the whole reason valid tap targets differ between the two states.

The honesty that requires is the same honesty a paper sheet requires, so
the app does not try to police it: there is no limit on how many crosses
you take while idle, because the sheet cannot know how many opponents sit
between your turns. `Undo` is the correction, not a rule.

## Rules as implemented

Six dice: two white, one per row colour.

- **On your turn** you may cross off the sum of the two white dice, in any
  row, and one white die plus one colour die, in that colour's row. At most
  one of each, and if you want both the white sum has to come first — so
  once a colour pair is taken the white sum is gone for that turn.
- **A tap that could be read either way is read as the white sum**, because
  taking the white first is never the worse choice: it leaves the colour
  pair still available.
- **On someone else's turn** any legal number is tappable, and there is no
  limit on how many you take — see the note above. A wrong limit would be
  worse than none, and the paper game is on the same footing.
- **Left to right.** Crossing a number puts everything to its left out of
  reach for good.
- **The last number** in a row (12 for red and yellow, 2 for green and
  blue) needs five crosses in that row already. Taking it locks the row and
  earns the padlock, which counts as one extra cross.
- **Penalty**: Done with nothing crossed costs 5 points. Four of them ends
  the game.
- **The game ends** at the second locked row, or at the fourth penalty —
  checked *between* turns, never mid-turn, so the roll in your hand is
  always played out.

### Locks are global, and this app cannot know that

When any player locks a row it is closed for everyone, but nothing is
shared between phones. So each row's padlock box is tappable at any time:
tap it to record "someone else locked this" and the row greys out, its die
drops out of your rolls, and it counts toward the two-lock ending. Tapping
it again reopens it, for the case where it was tapped by mistake. A padlock
you *earned* is not toggleable — `Undo` is how that comes back, so the
scoring cross cannot be quietly detached from the number that earned it.

### Scoring

Per row, the triangular number of the crosses in it: 1, 3, 6, 10, 15, 21,
28, 36, 45, 55, 66, 78. The earned padlock counts as a cross, so a locked
row of six crosses scores as seven. Penalties take 5 each off the total.
The running total and every row's subtotal sit under the sheet, so the
score is always visible rather than something to work out at the end.

## Layout

### Each colour is its own scroller

Eleven numbers plus a padlock across a 320px phone is a 24px cell — too
small to tap and too small to read. So the cells are sized for a thumb
(`clamp(2.5rem, 12vw, 3.25rem)`, square) and **each row scrolls
horizontally on its own**: you drag the colour you are looking at, and the
other three stay where you left them.

That is native `overflow-x: auto` rather than a pointer handler. It is a
drag on a phone, a trackpad swipe on a desktop, it has momentum and rubber
banding for free, and — the part a hand-rolled version gets wrong — it
cannot swallow a tap. `touch-action: pan-x` keeps a sideways drag from
being read as a page scroll. At 42rem and wider the whole scale fits and
nothing scrolls at all, which is what a desktop window gets.

**The padlock is pinned** (`position: sticky; right: 0`) so closing a row
is reachable from wherever that row happens to be scrolled, and so a
closed row reads as closed without scrolling to the end to check. It
overlaps the cell beneath it; the drop shadow is what says so.

The script moves a row only twice, and both times as little as it can:

- **When a roll lands**, each row scrolls to show the whole span of its
  targets — not just the first one. Green's white sum can sit mid-row with
  its colour pairs away at the far end, and stopping at the first target
  left those off screen. If the span is wider than the window the near end
  wins, because that is the end a player scans from.
- **On load**, a row whose crossed-off end has moved right opens on its
  live end, with one crossed number as context rather than a screen of
  numbers that are already gone.

A row that already shows what matters does not move at all — the maths
works in `scrollLeft` and `offsetLeft` and only ever closes the gap, so a
player's own scroll position survives everything that does not need it
changed.

### The rest

- **The sheet is the fixed part of the page; the tray takes what is left**
  (`--chrome` is the bars plus four rows of square cells). In landscape
  the sheet moves *beside* the tray instead, which is the only way both
  survive a 390px-tall window.
- There is no room for a per-row score inside a row, which is why the
  subtotals live in their own strip underneath — six boxes, always on
  screen.
- The dice tray is capped at 22rem. It is the same square tray as 10,000
  and Dice (`js/lib/dice.js` needs a square tray — the die is sized as a
  percentage of both axes), just smaller, because here the sheet is the
  thing being looked at.
- **Colours are row identities, not player identities.** There are four of
  them and no sides, so `css/players.css` does not apply — the same
  reasoning as 10,000's `--keep` and `--bust`. See *Player colors* in
  `CLAUDE.md`.
- A crossed cell keeps its number readable under the X and dims to 50%,
  because checking a sheet means reading which numbers are gone.
- What the current roll allows is marked with an inset white ring, the same
  marker the rest of the site uses, and everything else on the sheet is
  both dimmed and `disabled` — so an illegal tap is impossible rather than
  merely discouraged.

## Testing

Faces are drawn with `DiceTray.randomFace()` **before** any of the roll
animation's randomness, in ascending die order, so a spec can force a roll
by stubbing the head of `Math.random` — the same trick `ten-thousand.spec.js`
and `dice.spec.js` use. Locked dice are not rolled, so a forced roll after
a lock supplies five faces, not six.

## Persisted state

`localStorage`, key `games.quik-dice.v1`, one JSON object:

```json
{
  "rows":      [[false, ...11], ...4],
  "closed":    [false, false, false, false],
  "earned":    [false, false, false, false],
  "penalties": 0,
  "phase":     "idle | turn | over",
  "dice":      [1, 1, 1, 1, 1, 1],
  "turn":      { "white": false, "color": false },
  "history":   [ ...up to 30 snapshots for Undo ]
}
```

`rows[r][i]` is indexed by *position*, not by the number printed on it, so
green and blue read left to right the same way red and yellow do. `earned`
is only true where `rows[r][10]` is, and load enforces that: an earned
padlock without the number that earned it would score a cross out of
nowhere. `phase` is never stored as `rolling` — the animation cannot be
resumed, so a reload mid-roll lands on `turn` with the faces already drawn.
`history` holds whole snapshots rather than a move log; the state is small
enough that a snapshot is cheaper to get right than an inverse for every
action.
