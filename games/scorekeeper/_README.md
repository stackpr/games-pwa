# Scorekeeper

Keep a running score for 2 to 8 players or teams on one phone, passed
around or set on a table between them.

## Use case

Casual games where nobody wants to hold a pen: cornhole, ping pong, cards,
backyard volleyball. The phone sits between the players, so each seat is a
tap target of its own — nobody reaches across, and the score stays readable
from a metre away.

Everything is offline and local to the device. There is no sync, no
accounts, and no notion of a "match" that ends; the score simply persists
until someone resets it.

## Seats and layout

Between 2 and 8, set behind the ✻ in the top bar. The grid is **two across
in portrait and four across in landscape**, so eight players are four rows
upright and two rows on their side. The column count is set from JS rather
than CSS because `repeat()` will not accept a `min()` of a custom property,
so a `matchMedia` listener relays out on rotation.

Rows cost height, and the score has to shrink to match: its size is
`min(22vw, (100dvh - 7rem) / rows * 0.42)`, so a two-player game keeps the
same enormous number it always had while eight players still fit. Past two
rows the "tap to score" hint is dropped and the name and history shrink —
the hint is a first-run affordance and the seats need the height more.

Fewer players than the row width still fill the row: two players in
landscape get two columns, not two columns and two gaps.

**Naming is optional.** Every seat is an editable field that starts at
`Player 1`, `Player 2` and so on; clearing it leaves the number showing as
a placeholder rather than a blank bar. Nobody has to name anybody to start
scoring, and a game between "Player 3" and "Player 5" reads fine.

Long names are **truncated on display**, not wrapped and not allowed to
widen the seat. Eight tiles on a phone leave no room to negotiate, and a
name that pushed its column wider would drag every other seat out of
shape. The field keeps the whole name — it is only the display that
clips — and scrolls normally once focused for editing.

## Interaction

- **Tap anywhere in a seat** to add a point. The tap target is the whole
  tile rather than a button, because it is used at arm's length.
- **&minus;1** and **+5** split the strip along the bottom of each column,
  left and right. &minus;1 corrects a misfire; +5 is for sports that score
  in fives, and for catching up when the tapping fell behind the game.
- **Undo** reverts the last change (see grouping below).
- **Reset** zeroes both teams, behind a confirm, and is itself undoable.
- **Team names** are editable in place and persist.

Scores are clamped at zero. A &minus;1 at zero is a no-op: it records no
history entry and creates no undo step, so it cannot be used to pad the
undo stack.

## Tap grouping

Rapid scoring should read as one action. Successive changes to the *same
team* in the *same direction* less than one second apart collapse into a
single entry: five quick taps become `+5`, and Undo reverts all five at
once rather than making the user press Undo five times.

The window slides — each tap extends it by another second — so a sustained
burst stays one group however long it runs. Three things close a group:

1. A pause longer than the window.
2. A change of direction, so `+++` then `--` reads as `+3, -2` rather than
   netting to `+1`. Opposite intents stay separately undoable.
3. Scoring the other team, or pressing Undo.

A group also never spans a page load. Restored history has no matching
undo snapshot in memory, so merging a fresh tap into a pre-reload group
would produce a change that Undo could not reach.

**+5 is not a special case.** It calls the same `bump()` with a delta of
five, and grouping keys on the team and the *sign* of the change, never on
its size. So +5 is indistinguishable from five quick taps: it opens or
extends a group the same way, a +1 straight after reads as `+6` rather
than `+5, +1`, and one Undo takes the whole thing back. The same follows
for the closing rules — a pause after +5 leaves `+5, +1`, and a &minus;1
after it leaves `+5, -1`, because the direction changed.

Adding a +10 or a +2 later needs no grouping work for the same reason;
only a button and a `bump(team, n)` call.

## Score history

Under each team name is that team's run of changes, newest last:

```
+5, +6, -2, +8
```

It is deliberately one line. The row is a flex container justified to the
end, so as history grows the old entries slide past the left edge and are
clipped — recent scoring stays visible without the layout ever reflowing
or introducing a scrollbar. Roughly the last four to six entries fit on a
phone; the rest are still in storage, just not on screen.

## Seat colours

Each seat has its own colour, because the colour *is* how you find your
tile at a glance. Seats 1 and 2 alias `--player-1` and `--player-2`, so a
two-player game looks exactly as it always has and no hex value is
re-declared. Seats 3 to 8 are defined locally on this page.

This is the one place the site's two-identity rule is deliberately bent,
and it is worth being honest about why. Player colors in CLAUDE.md says a
game with a variable number of seats must not map them onto the two shared
tokens, because the third seat has to invent a colour. That reasoning holds
for a *game* with sides, where blue means "the player who moves first". A
scorekeeper has no sides and no turn order — a seat is just a column of
numbers — so seat 1 keeping blue costs nothing, and the alternative of
eight neutral grey tiles would be worse at the only job the colour does.

## Persisted state

One JSON object under `games.scorekeeper.v2`:

```json
{
  "count": 3,
  "names": ["Hawks", "Ravens", ""],
  "scores": [27, 14, 8],
  "events": [{ "seat": 0, "delta": 5, "t": 1753900000000 }]
}
```

`a` and `b` are the authoritative scores — they are not derived from
`events`, because the event list is capped (200 entries) and old entries
are dropped. Each event is one *group*, with `t` the timestamp of its most
recent tap, which is what the grouping window compares against.

The undo stack is deliberately **not** persisted. It holds full snapshots
taken at the start of each group, and it is in-memory only, so undo history
does not survive a reload — matching the expectation that closing the app
ends the editing session but not the game.

Loading validates every field and falls back to a clean game rather than
throwing, so a corrupt or hand-edited value cannot brick the page.

## The v1 to v2 migration

The two-team shape (`{ a, b, nameA, nameB }` with events keyed by
`team: 'a' | 'b'`) could not describe eight seats, so the key moved to
`games.scorekeeper.v2` with parallel arrays.

**Old saves are converted rather than dropped.** On load, if there is no v2
state, v1 is read once, mapped across — `a`/`b` become seats 0 and 1, and
each event's team becomes a seat index — and written back under the new
key. A game in progress on a phone that had the old version survives the
update, which matters more here than in a two-minute board game: a
scorekeeper is often left running for an evening.

The v1 key is left in place rather than deleted. It costs a few bytes and
it means a client that somehow loads an older copy of the page still finds
its game, which is the same reasoning behind tolerating markup from the
neighbouring release.
