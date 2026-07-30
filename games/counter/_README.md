# Counter

One number, up and down. Deliberately the simplest thing the shell can
host.

## Use case

Two jobs. First, anything that needs a tally with no rules attached:
laps, reps, inventory counts, people through a door, drinks poured. Second
— and the reason it exists — it is the **proof-of-concept page** for the
PWA shell itself. When checking that install, offline caching, or a
service-worker update works, this is the page to open, because nothing in
it can be blamed for a failure.

Keep it boring. If a change makes Counter interesting, it probably belongs
in a different game.

## Interaction

- **Up** adds one, **down** subtracts one. Both are full-size targets, not
  small buttons, so the page is usable at a glance and at arm's length.
- **Reset** returns to zero, with no confirm — there is nothing here worth
  protecting.
- **Arrow keys** work too, purely so the page can be driven from a desktop
  keyboard while testing.

The count goes negative. There is no floor, because a counter used for
"net" tallies (in minus out) needs one, and no use case here is harmed by
allowing it.

## Layout

Three elements fill the screen and reflow on orientation:

- **Portrait** — up on top, number in the middle, down at the bottom.
- **Landscape** — the number takes the left two-thirds, with the buttons
  stacked in a column on the right.

The buttons stack rather than sitting either side of the number in
landscape, so `^` and `v` always point the direction they act. The reflow
is one `@media (orientation: …)` pair: portrait makes the button wrapper
`display: contents` so all three become siblings in a single flex column,
with `order` placing the number between them.

## Persisted state

One JSON object under `games.counter.v1`:

```json
{ "count": 7 }
```

Non-integer or unparseable values fall back to zero on load.
