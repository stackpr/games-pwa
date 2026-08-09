# Golf

A scorecard for a round of golf or a round of mini golf. Holes down the
side, players across the top, and a tap on any square opens a pad of
strokes. It keeps no rules — it counts.

## Why the card is this way round

A paper scorecard runs the holes across the top, which works on paper and
not at all on a phone: eighteen columns at a readable size is a card nobody
can use. So this one is **turned ninety degrees** — holes down, players
across — and the two axes scroll independently:

- **Down** through the holes, with the player names sticky at the top and
  the running total sticky at the bottom. Both of the things you look up
  while scrolling stay put.
- **Across** through the players, with the hole number and par columns
  sticky on the left. A number with no hole beside it is a number you
  cannot read.

That is what makes "any number of players" honest rather than a claim: the
twelfth player is a scroll away, not a squeeze.

## Entering a score

Tap a square, get a 3×3 pad of **1 to 9**, tap a number, the pad closes and
the number is in the square. No keyboard, no double digits, no confirm step.
That is the whole interaction and it is deliberately the shortest one
available: on a course you are entering a number every couple of minutes
with one hand.

Two things come with it:

- **`Clear` empties the square**, because a mis-tap needs an exit and a
  score of zero is not a thing. Zero is "not played" everywhere in the
  state, for scores and pars alike.
- **The pad marks the hole's par** with a small label under that key, when
  par is being tracked. It is the number you are most likely to want.

**Ten or more strokes cannot be entered.** That is the ask, and for mini
golf it is right — most courses cap a hole at 6 or 7 anyway. For a bad hole
of real golf it is a genuine limit, and the fix if it ever matters is a
tenth key rather than a text field.

## Totals

- **Out** after hole 9, **In** after hole 18, both in the body of the card
  where a paper card puts them.
- **Tot** in a sticky footer, updating on every tap — the running total.
- A 9-hole round has an **Out** and a total and no **In**, which falls out
  of the same code rather than being a special case.

Subtotals show only for holes that have been played, so a card half filled
in reads as a real half-round rather than a total that pretends the empty
holes were zeroes.

**The leader is marked with a ring and weight, not a colour of its own.**
Lowest total wins, ties are all marked, and a card with nothing on it is not
in the running. There is deliberately no per-player colour: the site's two
player colours mean "player 1" and "player 2" everywhere else, and a game
with an open-ended number of seats must not borrow them — the third seat
would have to invent one. See Player colors in CLAUDE.md.

## Par is optional

Off by default, because mini golf on a strange course usually has no par
worth typing and the column is dead space until it does.

Turn it on and a par column appears, plus a grid of holes in settings. Tap a
hole, get the same 1–9 pad. **`Set every hole at once`** does what mini golf
actually needs, where all eighteen are par 2 or par 3 and typing them one at
a time is a chore for nothing.

With par on, a filled square is marked against it:

| Result | Marking |
| --- | --- |
| Hole in one | Ring and colour in `--lead` |
| Under par | Ring and colour in `--under` |
| Level | Plain |
| Over par | Colour only, no ring |

The ring is on the *low* side and absent on the high side, so under and over
never differ by hue alone — the same rule the two-player games follow for
their winning line.

**The ± under each total counts only the holes that have been played**,
while the par shown in the footer is the full course par. That is the way a
scorecard behaves: the course par is a property of the course, and "+2"
means "+2 so far".

## Players and names

One to twelve, set by a row of counts. Names use **the same panel the party
games use** — *Pick who's here* against *Type them* — and, more to the
point, the same list behind it: `js/lib/names.js`, keyed
`games.party-names.v1`. That list is the one deliberate cross-game key in
the tree, on the grounds that the people at the table are the same people
whichever game they are playing. Somebody who has played Fishbowl this
afternoon is one tap away on the first tee.

The panel's markup and CSS are golf's own rather than
`js/lib/setup.js` + `css/party.css`. Those two are a whole app shell for the
three word games — `PartySetup` is bound to `Party` and `Vocab`, and
`party.css` sets `body { height: 100dvh; overflow: hidden }` and a
screen-switching system — so linking them here would import a layout to
fight rather than a control to reuse. `Names` is the part that is genuinely
shared, and it is the part that is shared.

Changing the player count keeps the scores of the players who remain;
removing a player drops that player's column and its scores with it.

## New round

Clears the scores and keeps the players, the hole count and the pars —
which is the thing you want on the second nine or the second course of the
day.

The button **asks twice**: the first tap turns it into `Clear all?` and it
disarms itself after three seconds. A round is a lot of taps to lose to a
stray one, and a timeout means a tap followed by a walk away leaves the card
safe rather than one tap from empty.

## Persisted state

`localStorage`, key `games.golf.v1`, one object:

```json
{
  "holes": 18,
  "players": ["Ari", "Sam"],
  "usePar": true,
  "pars": [3, 4, 5, 3, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4],
  "scores": [[4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], []],
  "nameMode": "type"
}
```

`0` means "not set" for every number in here — a par nobody typed and a hole
nobody played look the same to the code, which is why an unplayed hole
contributes to neither the total nor the par it is measured against.

Everything is validated on load: a stroke outside 1–9, a non-integer, a
scores array of the wrong length or a hole count that is not 9 or 18 all
fall back rather than being trusted. The arrays are re-sized to the hole
count on load and whenever it changes, so switching 18 → 9 → 18 keeps the
first nine and forgets the second, which is the least surprising of the
available answers.
