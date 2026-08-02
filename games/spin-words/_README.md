# Spin Words

Spin a reel, call a letter, solve the puzzle. One phone, passed round the
table.

## The name

The television game this borrows its shape from is a registered trademark,
so its name appears nowhere — not in the slug, the storage key, the title
or the commit history. Rules are free to reimplement; names are not. See
*Naming a game* in `CLAUDE.md`.

## Use case

Two to eight players, one phone. Everything is public — the board, the
banks, the reel — so passing the phone is not about hiding anything, it is
about the phone reaching the right hands before anyone taps. That is what
the **pass screen** is for: it names who is up, says what just happened,
and does nothing until somebody taps Ready.

## A turn

1. **Spin.** The reel lands on a cash value, `BANKRUPT` or `LOSE A TURN`.
2. On cash, **call a consonant.** Every one of that letter in the puzzle
   pays the value the reel landed on, and the phone stays put — spin again,
   buy a vowel, or solve. Call a letter that is not there and the turn ends.
3. **Buy a vowel** costs $250 out of this puzzle's winnings and pays
   nothing. It needs the $250 to be there first, which is why the button is
   dead until the player has won something.
4. **Solve** at any point. The player says the answer out loud and the
   table decides — *Got it* banks this puzzle's winnings for good, *Missed*
   passes the phone.

`BANKRUPT` takes this puzzle's winnings and nothing else: what a player has
already banked by solving is safe. That split is the whole tension of a
spin, so it is worth being exact about.

### Edge cases

- **No consonants left** disables Spin, because a spin could only ever pay
  for a letter that is already showing. Buy a vowel and Solve remain, and
  Solve is never disabled, so there is no way to reach a turn with nothing
  to do.
- **Vowels cannot be called for free.** They are disabled on the keyboard
  during a consonant pick, and shown on their own five-key pad when bought.
  Two different reasons for a dead key, so they are styled differently: a
  called letter goes dark, a letter this pick does not allow just fades.
- **The solver does not open the next puzzle.** Play moves on to the next
  seat, so solving is worth money rather than worth a head start.
- **A tie is a tie.** The game says so rather than picking a winner.

## Where the puzzles come from

Half from `js/lib/vocab.js`, the shared library the three word games use,
filtered to terms of five letters or more — a four-letter puzzle is a guess
rather than a puzzle. The category the board shows is the term's own.

Half from `phrases.js`, **which lives in this folder and not in
`js/lib/`.** That is deliberate: the shared library is single words with
the words you would say while describing them, which is what Forbidden
Words, Star Words and What Am I need and exactly the wrong shape here. Put
the other way round, adding "Better late than never" to `Vocab` would deal
it as a Forbidden Words card. There is a spec asserting no other game's
page loads `phrases.js`.

The coin flip is the point: drawn straight from a combined pool the phrases
would be one puzzle in twelve, and they are the ones that play like this
game rather than like a spelling test.

### The phrase categories

Fourteen of them, and the category is half the clue — a board reading
`_ _ _ _  _ _ _ _  _ _ _ _` is a different puzzle under *Rhyme Time* than
under *Occupation*.

| Category | What it is |
| --- | --- |
| Phrase, Saying | Idioms and proverbs |
| Place, Event, Occupation, Thing | Nouns with spaces in them |
| Food and Drink, What Are You Doing, Fun and Games | The everyday ones |
| **Before and After** | Two phrases sharing a pivot word, read straight through: *ice cream sandwich* + *sandwich bag* = `ICE CREAM SANDWICH BAG` |
| **Rhyme Time** | Both words rhyme — `DOUBLE TROUBLE` |
| **Same Letter** | Every word starts with the same letter — `TINY TIN TRUMPET` |
| **Song Title**, **Nursery Rhyme** | Traditional and public domain only |

Two of those carry a rule a spec enforces, because they are the two that
stop being their category the moment somebody adds a near miss: Before and
After needs three words or there is no pivot to share, and Same Letter has
to actually share the letter. A third spec fails if any category drops
below 18 entries — a thin category is one that repeats, and a puzzle coming
round twice in an evening is what makes a deck feel small.

### What may go on the board

Titles are not copyrightable — 37 CFR 202.1(a) excludes names, titles and
short phrases — so a **title** is safe content and a **lyric** is not. The
line this file holds is deliberately further back than the law requires:

- **Song and rhyme titles are traditional or public domain**, so there is
  no live rightsholder even for the work behind the title. That takes the
  question off the table rather than answering it.
- **No lyrics, no quotations, no verse.** That is the part copyright
  actually protects.
- **No brands, franchises, characters, or film and television titles.**
  This is a trademark question rather than a copyright one, and it is the
  one that bites: *Simon Says* and *Leap Frog* were both dropped from Fun
  and Games over toy brands that share the name, and *Hungry Hungry Hippos*
  and *Fast and Furious* never made it into Same Letter for the same
  reason. Being unsure counts as a hit — the same rule *Naming a game* in
  `CLAUDE.md` applies to the slug applies here to the board.
- **Before and After, Rhyme Time and Same Letter are written, not
  collected.** No list was copied from anywhere.

Anything that fails those, leave out and raise it rather than shipping it
and hoping.

The last 60 answers are remembered so a puzzle does not come round again
soon. The list survives a New game, which is why a second game does not
open on the puzzle the first one just finished.

**Categories are not a setting.** The three word games let you pick them
because a round is 60 seconds of one category; here a puzzle is a puzzle,
and a category picker would be four taps in the way of starting.

## Layout

- **The reel runs vertically, not round a wheel.** A circle big enough to
  read wants most of a phone's width; a reel is a 7.5rem strip that sits
  beside the Spin button. The track holds three copies of the wheel and
  the spin travels at least a whole copy, jumping back a copy when it would
  run off the end — invisible, because the copies are identical.
- **One panel, many panes.** Spin, keyboard, vowels, judge, pass, solved
  and over all render into the same box, and it reserves the height of the
  tallest — the keyboard — so swapping panes never moves the board.
- **Our own keyboard**, because the game has to grey out letters that are
  gone and no system keyboard can be told to. Keys shrink to the row they
  are given and stop growing at `--key`; sizing them from the viewport
  overflowed the landscape column, which is narrower than the window by
  design.
- **The gap between words is eight times the gap between tiles.** A blank
  tile at a word boundary is unreadable otherwise, and the puzzles are
  mostly phrases.
- **The banks sit above the board.** A scoreboard floating in the middle of
  the screen reads as part of the puzzle.
- In landscape the panel moves beside the board: three rows of keys and a
  board will not both fit a 390px-tall window.
- Eight seats have no colour identity — the active one is marked by weight
  and a ring, the same as 10,000. See *Player colors* in `CLAUDE.md`.

## Persisted state

`localStorage`, key `games.spin-words.v1`, one JSON object:

```json
{
  "players":     3,
  "puzzles":     3,
  "names":       ["", "", ""],
  "banks":       [0, 0, 0],
  "current":     0,
  "roundMoney":  0,
  "solvedCount": 0,
  "answer":      "BETTER LATE THAN NEVER",
  "category":    "Phrase",
  "called":      "ETRN",
  "phase":       "spin | pick | vowel | judge | pass | solved | over",
  "wedge":       4,
  "message":     "",
  "used":        ["...", "up to 60 answers"]
}
```

`called` is a string rather than an array because it is a set of single
characters and `indexOf` is the only question ever asked of it. `answer` is
stored upper case, and the board derives everything else from it — there is
no separate "revealed" list to drift out of step with the letters called.
`phase` is never stored as `spinning`: the reel cannot be resumed, so a
reload mid-spin lands on `spin` with the wedge already drawn. Names are
also written to the shared `games.party-names.v1` list via `js/lib/names.js`
when the settings dialog closes, which is the one cross-game key in the
tree.

## Testing

`Math.random` drives the puzzle draw, the coin flip between the two
sources, and the wedge. A spec forces a puzzle by seeding
`localStorage` rather than by stubbing randomness — the draw happens at
load, before a test can reach it, and a seeded `answer` is the thing the
tests actually care about. The wedge is forced by seeding `wedge` and
reading it back through the pick hint.
