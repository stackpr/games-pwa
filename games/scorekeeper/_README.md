# Scorekeeper

Keep a running score for two teams on one phone, passed around or set on a
table between them.

## Use case

Casual games where nobody wants to hold a pen: cornhole, ping pong, cards,
backyard volleyball. The phone sits between two players, so the layout is
two full-height columns — each player taps their own side without reaching
across, and the score stays readable from a metre away.

Everything is offline and local to the device. There is no sync, no
accounts, and no notion of a "match" that ends; the score simply persists
until someone resets it.

## Interaction

- **Tap anywhere in a team's column** to add a point. The tap target is the
  whole column rather than a button, because it is used at arm's length.
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

## Persisted state

One JSON object under `games.scorekeeper.v1`:

```json
{
  "a": 27, "b": 14,
  "nameA": "Hawks", "nameB": "Ravens",
  "events": [{ "team": "a", "delta": 5, "t": 1753900000000 }]
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
