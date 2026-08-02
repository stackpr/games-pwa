# Honeycomb: Spelling

Seven letters in a hive, the middle one compulsory, and a clock you pick
before you start. Solo — it is the first game in the site's **Solitaire**
section.

## The name

The obvious name for this puzzle is a registered trademark of a newspaper.
Rules are not owned and are free to reimplement; names are. So this is
`Honeycomb: Spelling`, matching the `Honeycomb: 3 Bees` naming already in
the tree. Nothing in the slug, the storage key, the precache list or the
specs carries the trademarked name, and nothing should start to.

## Rules

- Words are made from the seven hive letters and **must contain the centre
  letter**. Letters may be reused any number of times.
- Minimum length is four.
- There is never an `s` in a hive. That is deliberate: with an `s` most of
  the answer list is plurals, and the puzzle stops being about words. The
  generator drops every word containing `s` before it does anything else,
  so no answer anywhere in the data has one.

### Scoring

| Word | Points |
| --- | --- |
| Four letters | 1 |
| Five or more | 1 per letter |
| Uses all seven letters | +7 on top — a pangram |

A hive averages 28 answers and about 127 points, so a perfect game is well
out of reach in a minute and merely hard in ten. That spread is the reason
the limit is a setting rather than a constant.

## The clock

Five limits: 1:00, 2:00, 3:00, 5:00, 10:00. The limit is chosen on the
start sheet and remembered between visits.

**Each limit keeps its own top five.** A minute and ten minutes are not
the same game and their scores are not comparable, so ranking them in one
list would make the longest limit the only one worth playing. The start
sheet shows the board for whichever limit is selected, which is also how
you compare them: tap along the row of limits and watch the board change.

The countdown is `js/lib/timer.js`, which derives the time left from a
timestamp rather than decrementing a counter — a phone throttles timers in
a backgrounded tab, and a decrementing counter comes back wrong by however
long the screen was off.

**A game cannot be paused or resumed.** Reloading the page ends it. The
same reasoning as Blackjack's half-dealt hand: a clock that stopped while
the page was gone cannot be restarted honestly, and a "resume" that
quietly gave back time would be worth more than the score it produced.

Pressing **Done** during a game ends it early and records the score. That
is a real move — once the answers dry up there is no reason to sit out the
rest of the clock — and it cannot inflate a score, only cut it short.

## What goes on the board

An entry is `{ score, words, longest, at }`. `longest` is the longest word
found, ties going to whichever was found first; it is shown next to the
score on both boards, because "42 points" says nothing about how a game
went and "42 points, `checkmate`" does.

A game scoring zero is not recorded. An empty board is a state worth
having — it says "you have not played this limit yet" — and filling it
with blanks would take that away.

## Saved state

`localStorage`, under `games.honeycomb-spelling.v1`:

```js
{
  limit: 180,                  // the selected limit, in seconds
  scores: {                    // one top-five per limit, highest first
    "60": [], "120": [],
    "180": [{ score: 42, words: 9, longest: 'checkmate', at: '2026-08-02T…' }],
    "300": [], "600": []
  },
  recent: [12, 4, 39]          // the last dozen hives played
}
```

`recent` is what stops the same hive coming round twice in an evening: the
next game is drawn from the hives *not* in that list, falling back to all
of them once the list would exclude everything. It is trimmed to twelve on
save, and trimmed *after* the draw — which is also what makes the choice
testable, since seeding `recent` with every index but one pins the next
hive.

Nothing about a game in progress is persisted. See the clock section.

## The word list

`puzzles.js` holds sixty hives. Each row is the centre letter, the six
outer letters, and every answer:

```
'acehiry|ache,acre,arch,archer,cache,care,career,…'
```

About 12 KB in total, parsed once at load.

**The answers are the dictionary.** The game looks a guess up in the
current hive's list and nowhere else. That is a deliberate trade: shipping
a real dictionary to a phone means 100 KB or more of words the player will
never type, and every word in it that is not an answer still has to be
rejected. With the answers as the list, what is in the file is exactly
what scores, and the end-of-game screen can show every word in the hive —
found ones filled in, missed ones outlined — because it knows all of them.

The cost is the familiar one for this kind of puzzle: a real word that is
not in the list is rejected. Sixty hives of common four-to-nine letter
words keeps that rare, and the full list at the end makes it visible
rather than mysterious.

### How the data was generated

Offline, once, from public word lists — never at run time, and nothing is
fetched by the page. The recipe, if it needs regenerating:

1. Start from [`dolph/dictionary`](https://github.com/dolph/dictionary)
   `popular.txt` (~25k common English words).
2. Keep a word only if it is in `enable1.txt` (the ENABLE dictionary,
   public domain — no proper nouns) **and** is common enough to be known:
   in the Google top-10k list, or at frequency ≥ 900 in the OpenSubtitles
   `en_50k` list.
3. Drop words shorter than four letters, words with more than seven
   distinct letters, words containing `s`, and a hand-kept blocklist of
   offensive terms plus a few dictionary-legal words that read as names
   (`beth`, `kent`, `nellie` and friends). That leaves a pool of ~6,500.
4. Every seven-distinct-letter word in the pool defines a candidate hive.
   For each hive and each choice of centre letter, collect the answers.
   Keep the combination if it has 22–55 answers and 1–3 pangrams.
5. Rank the ~3,700 survivors by the average corpus frequency of their
   answers, take the most familiar sixty, one per letter set.

Steps 2 and 3 are what the quality rests on. Widening either produces
hives full of words nobody would guess, which reads to a player as a
broken game rather than a hard one.

## Layout notes

- The hive is seven flat-top hexagons placed as **percentages of the
  hive**, so there is no layout JS and no resize handler. A flat-top hex of
  width `w` is `w·√3/2` tall, which makes three stacked rows `2.5w × 2.598w`
  — hence the container's `aspect-ratio: 2.5 / 2.598`, and hence each cell
  being exactly 40% wide and a third of the height. The four diagonal
  neighbours sit at ±30% horizontally and ±16.667% vertically.
- Like every full-height page here, the hive sizes itself against
  `var(--app-height, 100dvh) - var(--chrome)`, with `--chrome` measured
  rather than guessed. See CLAUDE.md on the Android bottom-bar bug.
- The found-word strip is a **single line scrolled sideways**. A wrapping
  list would grow as the game went well and squeeze the hive, which is the
  wrong way round.
- The typed word and the verdict on the last word share one line, so a
  flash of `+11` cannot push the hive down as it appears.
- The start and end panels are deliberately **not** `js/lib/modal.js`. That
  one closes on Escape and on the scrim, and either would leave a dead
  board behind it. These panels are the game, not a dialog over it.

## Colours

No `css/players.css`. There are no sides, so the player identities would
mean nothing here — the same reasoning that keeps Counter off them. The
one accent, honey `#f0b429`, is shared by eye with `Honeycomb: 3 Bees` and
marks exactly one thing: the compulsory centre letter. Nothing else on the
page is gold except a pangram and a new best score, both of which are
meant to read as "that one is special".
