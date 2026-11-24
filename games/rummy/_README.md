# Rummy

A scoresheet for Rummy at a table of two to eight. It keeps the patterns,
the hands and the running score. Like Pitch and Spades, **it does not deal
cards and does not know what was played — it is the pad of paper, not the
game.**

## The name, and the one that is missing

`Rummy` is the traditional name of the family and is nobody's trademark,
which is why it is the name here. See Naming a game in CLAUDE.md.

The thing most people recognise in this sheet — *a different required
pattern on every deal, getting harder as you go* — is a mechanic from
**Contract Rummy**, an American game that appeared during the Second World
War and is also recorded as Combination Rummy, Deuces Wild Rummy and Joker
Rummy. The original of the family was **Zioncheck**, invented by Ruth
Armson in the 1930s, which had six contracts.

There is a well-known commercial game of exactly this shape, published in
1982. It is a proprietary *version* of the traditional game. Rules are free
to reimplement and names are not, so that name appears nowhere in this
repository and must not be added — not in the UI, not in these notes, not
in a commit message. `rummy.spec.js` has a test that fails if it ever is.

Sources for everything below: John McLeod's *Card Games* site
(`pagat.com/rummy/ctrummy.html`) and Wikipedia's *Contract rummy*.

## The patterns

A **set** is cards of the same rank; a **run** is consecutive cards of one
suit. A pattern is what you must put down before you may meld at all.

Four sequences ship, named in the UI by **how long they are** rather than
after the variant they come from. A player reads "Seven" faster than a
place name, and it sidesteps the question of whether some traditional name
has since been registered by somebody.

| In the UI | Where it comes from |
| --- | --- |
| Seven | Contract Rummy's classic sequence |
| Eight | A Shanghai Rummy version, which inserts a fourth set near the end |
| Ten | Another Shanghai Rummy version, which grows the runs instead — a run of ten is the wall |
| Fifteen | Progressive Rummy |

**Off** is the fifth option: plain Rummy, meld what you like, play a set
number of rounds. The whole pattern apparatus disappears when it is off,
rather than sitting there inert.

### Playing a long sequence short

**How many** trims the sequence from the front, so the fifteen-pattern game
can be played as five and it is the same game, shorter. This is the setting
that makes the long sequences usable on a weeknight; the patterns that get
played are the ones that were always first, so nothing about the shape
changes.

Three is the floor. A two-deal contract game is not a game.

### Deal size is deliberately not shown

The sources disagree — pagat gives 10 cards for the first three rounds and
12 for the last four, Wikipedia gives 10 for the first four and 12 for the
last three, and the Shanghai versions deal 11 throughout. There is no
honest single answer, so the sheet does not pretend to one. The table knows
how it deals.

## Moving on

Two rules, and they make quite different games:

- **Everyone together** — round *n* is pattern *n* for the whole table,
  made or missed. The game is a fixed number of deals.
- **Only if you made it** — a player who misses meets the same pattern
  again next deal while everyone else moves on. Each seat is then on its
  own pattern, so the entry rows name each player's pattern individually
  and the banner says the spread rather than lying about a single one. The
  game runs until somebody finishes the last pattern, so the number of
  deals is not known in advance.

Going out **is** making the pattern, so setting a hand to zero ticks it.
Asking separately would be asking twice for the same fact.

## Scoring: the hands are stored, never the scores

This is the decision the rest of the game hangs off. What a round records
is **what each player was left holding** — not what they scored. The three
scoring schemes are three readings of that one set of facts, so switching
between them **re-scores a game already in progress** instead of
invalidating it. Change your mind at round four and the first three rounds
come with you.

| Setting | Who scores what | Wins |
| --- | --- | --- |
| Cards count against you | Out scores 0, everyone else their hand | Lowest |
| Winner takes the table | Out scores the sum of every other hand, others 0 | Highest |
| Winner takes, losers lose | Out scores the sum, others go negative by their own | Highest |

The first is the traditional one: *"the other players score penalty points
for all the cards remaining in their hands ... the object of the game is to
be the player with the lowest score."*

The leader is marked with a ring and weight, not a colour — the site's two
player colours mean "player 1" and "player 2" everywhere else and a table
of eight has no business borrowing them. Which end of the table leads
follows the scheme, so the ring moves when you switch.

### Card values are the table's business

The sheet adds up what you type and nothing else, so any schedule works.
The rules sheet shows a common one (2–10 face value, courts 10, ace 15,
joker 15 or 20) as a reference, flagged as varying — because it does:
Progressive Rummy scores every 3–10 as 5 and wild cards as 20, and one
version of May I? puts the joker at 25.

## Who went out is derived, not asked

Whoever is holding **0** went out. There is no separate "who won the round"
control, because that would be asking for a fact already on the screen.

It buys a real case for free: **a round can end with nobody out.** If the
stock and the discard pile both run out, play stops, there is no winner and
everybody counts their hand — so leave nobody on zero and the sheet scores
it correctly without a special mode.

## Entering a hand

Tap a player's box, get a number pad, tap `Done`. The pad writes its value
back however it is dismissed — the button, the scrim or Escape — so a
number that was tapped in is never silently dropped.

**A pad rather than a text input, on purpose.** An `<input>` would summon
the on-screen keyboard over a `height: 100dvh; overflow: hidden` page,
which is precisely the class of bug `js/lib/viewport.js` exists for — the
viewport module deliberately does *not* shrink for the keyboard, so the
keyboard would cover the entry row it was summoned from. A pad has no such
problem. See The Android bottom-bar bug in CLAUDE.md.

The entry panel is pinned at the foot rather than being a dialog, because
scoring a round is the thing you do most and it should never need a scroll
first. It keeps a `--floor` gutter clear of the system navigation bar for
the same reasons the party games do.

## Layout

Rounds down, players across — the same way round as Golf's card and for the
same reason: eight columns of a readable size fit a phone, twenty rows do
not. Names stay stuck to the top while you scroll down and the round
numbers stay stuck to the left while you scroll across, so a number always
has something next to it that says what it is.

## Players and names

Two to eight. Names use `js/lib/names.js`, keyed `games.party-names.v1` —
the one deliberate cross-game key in the tree, on the grounds that the
people at the table are the same people whichever game they are playing.
Somebody who played Fishbowl this afternoon is one tap away.

Changing the count keeps the rounds already played: a new seat joins on
zeroes, a removed seat takes its column with it.

## Persisted state

`localStorage`, key `games.rummy.v1`, one object:

```json
{
  "players": ["Ari", "Sam", "Jo"],
  "nameMode": "type",
  "patterns": "seven",
  "rounds": 7,
  "advance": "together",
  "scoring": "penalty",
  "rounds_played": [
    { "left": [0, 25, 40], "made": [true, false, false] }
  ],
  "draft": { "left": [0, null, null], "made": [true, false, false] }
}
```

`left` is what each player was holding; `made` is whether they completed
their pattern, and is only read when seats advance on their own. `draft` is
the round being entered, so a reload mid-round does not lose it — `null`
means that hand has not been given a number yet, which is why the Score
button stays disabled.

Everything is validated on load: a hand outside 0–999, a non-integer, a
round whose array is the wrong length for the table, an unknown pattern
sequence or scoring scheme all fall back rather than being trusted. A
round that fails validation is dropped rather than taking the rest of the
sheet with it.

## New game

Clears the rounds and keeps the players and the rules — what you want for
the second game of the evening. It **asks twice** and disarms itself after
three seconds, because a scored game is a lot of taps to lose to a stray
one, and a timeout means a tap followed by walking away leaves the sheet
safe rather than one tap from empty.

## Not built

**Three Thirteen** is the obvious next variant and is a different shape:
eleven deals of increasing size, three cards up to thirteen, with the round
number as the wild rank and no patterns at all. It would need deal size and
a wild rank in the model, so it is a change rather than a preset.
