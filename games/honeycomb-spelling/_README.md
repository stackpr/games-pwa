# Honeycomb: Spelling

Seven letters in a hive, the middle one compulsory, and a clock you pick
before you start. Solo — it is the first game in the site's **Solitaire**
section.

The letters are drawn fresh for every game and a guess is checked against a
real dictionary over the network. **This is the one game on the site that
needs a connection**, which is a deliberate exception to the site's
offline-first rule and the thing to read first if you are changing it — see
Why this one goes online.

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
  what you can spell is plurals, and the puzzle stops being about words.
  `s` is simply absent from the generator's letter table, so it can never
  be drawn.

### Scoring

Three parts added together:

| Part | Points |
| --- | --- |
| Each letter used | its Scrabble value — `a`/`e` 1, `k` 5, `q`/`z` 10 |
| Length | `(n − 3)²` — 1, 4, 9, 16, 25, 36 at 4–9 letters |
| All seven letters | +10 — a pangram |

Worked examples: `ache` = 9 + 1 = **10**. `cheat` = 10 + 4 = **14**.
`cheetah` = 15 + 16 = **31**. `checkmate` = 22 + 36 + 10 = **68**.

**Why these two halves.** Letter values alone would score a four-letter
word the same as a nine-letter one built from the same letters, and length
alone would say `entire` and `jinxed` are equally hard. Together each one
owns a range: the length bonus is 1 at the floor, so a short word is scored
almost entirely on how awkward its letters are, and it reaches 36 by nine
letters, so a long word is scored almost entirely on its length. `quiz` (23)
beats `entire` (15) despite being shorter; `entertain` (45) beats `quiz`
despite being made of ones.

**Why squared.** It had to climb fast enough that a long word feels like the
prize — linear growth barely separated a six from a nine once letter values
were in play — without the runaway of doubling per letter, which would make
one lucky nine-letter word worth more than a whole good game. Squaring is
also the version a player can hold in their head: 1, 4, 9, 16.

**Why Scrabble's numbers** rather than a scale of our own: it is the letter
scale English speakers already know, so `z` being worth 10 needs no
explanation. The letters are drawn at random here, which makes the values
matter more than they would with hand-built hives — a hive holding a `k`
and a `w` is a different proposition from one holding `n` and `r`, and the
scoring is what says so out loud.

Every letter counts each time it is used, `hatchet`'s two `h`s included.
That is the Scrabble reading and it needs no caveat in the rules; it does
mean length is paid for twice, once through the letters and once through
the bonus, which is deliberate — long words should feel like the prize.

**Every tile shows its own value.** Hidden letter values would make "spell
with the awkward letters" a rule you could only learn by losing. See The
tiles.

With the whole language in play rather than a curated answer list, there is
no ceiling to quote and no such thing as a perfect game. The clock is what
bounds a round, which is why the limit is a setting rather than a constant.

`wordScore()` clamps the length reach at zero. Nothing below four letters
reaches it — `submit()` rejects those first — but an unclamped `(n − 3)²`
pays a *bonus* for being too short, which is the kind of thing that only
shows up once the function is reused somewhere else.

### The tiles

Each hexagon carries its letter and, small and baseline-aligned beside it,
that letter's value — the Scrabble tile arrangement, for the same reason
Scrabble uses it.

Two things follow from putting a second thing inside the button:

- **The letter lives in `data-letter`, not just the markup.** A tap used to
  read `hex.textContent`, which now ends in a digit. Reading the attribute
  is what keeps `k5` from being typed as two characters.
- **`paintHive()` falls back to plain text** when it finds no
  `.hex-letter` span inside the cell. That is the neighbouring-release case
  from CLAUDE.md: a client can load this release's script against the last
  one's markup, and a hive with no values beats a blank game.

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
  }
}
```

Earlier versions also stored `recent`, a list of the last dozen fixed hives
played, so the same puzzle would not come round twice in an evening. Hives
are generated now and repeat only by coincidence, so the key is gone;
`load()` ignores anything left over from an older release rather than
tripping over it. The version stays at `v1` because the scores are still
scores — wiping people's boards over an implementation change would be a
worse trade than carrying one dead key.

Note that a game which scores nothing now writes nothing at all. The old
version saved on every deal in order to update `recent`, so a player who
opened the page always had a stored object; today an unplayed limit is
genuinely absent from storage rather than present and empty. Anything
reading this key must tolerate a missing `scores` — the specs assert the
empty board through the UI for exactly that reason.

Nothing about a game in progress is persisted. See the clock section.

## Why this one goes online

Every other game here works with the plane switched on, and CLAUDE.md makes
that a hard constraint. This one breaks it on purpose, and the reason is
worth stating because it is the whole design.

A spelling game is only as good as the words it will accept. The previous
version shipped sixty hand-built hives whose answer lists *were* the
dictionary — what was in the file was exactly what scored. That is fast,
offline and completely predictable, and it costs you the thing players
actually want: a real word that nobody put in the list is rejected, and it
looks like a bug rather than a boundary. Sixty hives also run out.

Drawing the letters at random makes the puzzle endless, but it also makes a
shipped answer list impossible — the letters are not known until the game
starts. So the two halves come together: **random letters require a real
dictionary, and a real dictionary makes random letters worth having.**

What that costs, stated plainly:

- **No offline play.** The shell still loads from the precache, so the page,
  the boards and the hive all come up with no network; nothing will score.
  The start sheet says so up front, driven by `navigator.onLine` and the
  `online`/`offline` events, rather than letting a player find out one
  rejected word at a time.
- **No answer key**, hence no end-of-game list of what you missed. See What
  the end screen can say.
- **A third party can be slow or down.** See The lookup.

## The letters

There is no puzzle data any more. `newHive()` draws seven distinct letters
per game from two weight tables, `VOWELS` and `CONSONANTS`, holding roughly
how often each letter appears in English.

The weighting is the part that matters. **A flat draw over the alphabet
produces hives nothing can be spelled from** — seven letters picked evenly
lands on `jqvxzkw` often enough to ruin the game, and a player cannot tell
an impossible hive from a hard one. Weighting by frequency means the common
letters show up like common letters.

Three rules fall out of that, and each has a spec:

- **At least two vowels, never more than three.** One vowel is unplayable
  and four leaves too few consonants. The count is drawn from that range
  first, then the vowels and consonants are drawn separately, so the ratio
  is guaranteed rather than hoped for.
- **No `s` in the table at all**, so the no-plurals rule from the old
  version survives the change to generation. It cannot be drawn because it
  does not exist as far as the generator is concerned.
- **The centre letter is weighted too**, using the same numbers, drawn from
  the seven already chosen. This is what keeps a `q` or a `z` off the one
  letter that has to appear in *every* word. Even when one is in the hive it
  is essentially never compulsory.

`draw(weights, n)` picks `n` distinct letters, each letter's chance being
its share of what is left in the pool — recomputing the total each time is
what keeps the distribution right as letters are removed.

### The hard letters

`j`, `q`, `x` and `z` are listed in `HARD` and have their weight multiplied
by `HARD_PENALTY` (0.25) when the table is built. English frequency alone
already makes them uncommon, but seven letters are drawn from twenty-one, so
raw frequency still puts one of them in the hive more often than the game
wants. A hive has seven seats and one of these spends a seat: it is not
unplayable, it is just a letter you resent. The penalty makes each of them
turn up in well under one hive in fifty.

They are penalised rather than removed. A `z` hive is a good hive
occasionally — it is the *frequency* that was wrong, not the letter.

### q comes with u

**A `q` with no `u` is a dead seat**, so `withU()` guarantees the pair: if
the consonant draw produced a `q` and the vowel draw did not produce a `u`,
the last vowel drawn is replaced by `u`.

The cost lands on a vowel seat rather than a consonant one, which is what
keeps the vowel count exactly as drawn — and since `u` is itself a vowel,
the hive is no poorer for the swap. Dropping the *last* vowel is deliberate:
the draw is weighted, so the earlier picks are the more common letters and
the last one is the cheapest to lose.

Because a `q` shows up in far fewer than one game in a hundred, neither this
rule nor the vowel floor can be tested by dealing hives through the UI. The
generator is exposed as `window.HoneycombHive.next()` for exactly that
reason and the specs sample twenty thousand hives from it, asserting that no
`q` ever appears without a `u` — and that a `q` appeared at all, so the
assertion is not passing vacuously.

Tuning the tables is safe. Removing the vowel floor, the `s` exclusion or
the `q`/`u` pairing is not — each has a spec.

## The lookup

`https://api.dictionaryapi.dev/api/v2/entries/en/<word>`, one request per
guess. `200` means the word exists, `404` means it does not. There is no
key, no configuration and no fallback host.

**The three-verdict shape is the important bit.** `lookUp()` resolves to
`'yes'`, `'no'` or `'off'`, and `'off'` — a network failure, a 429, a 500 —
is *not* a `'no'`. It is reported as `Could not check <word>`, it is never
cached, and the same word can be tried again the moment the connection is
back. Collapsing "the dictionary says no" into "we could not ask" would
quietly turn every outage into a game that rejects real words.

Other things the code is doing on purpose:

- **The cheap rules run first.** Too short, missing the centre letter, and
  already found are all decided on the page, so they cost no round trip.
  Only a guess that passes all three goes out. Specs assert the request
  count is zero for each.
- **Verdicts are remembered for the session** in a `Map`, so a repeated
  guess costs nothing. Only definite answers go in — see above. The map is
  deliberately not persisted: it would grow without bound, and a word's
  status is not worth a storage quota.
- **`game.checking` holds words already out for an answer**, so
  double-tapping Enter sends one request rather than two.
- **The clock does not stop for a lookup**, and an answer that arrives after
  the game has ended is dropped rather than scored late. `submit()` pins the
  current game in `round` and the callback bails if `game !== round` or the
  phase is no longer `playing`. A word submitted a moment before time ran
  out is therefore lost — the honest reading of a clock that has run out,
  and the alternative is a score that changes after it is recorded.
- **The word being checked is held on screen** — `flash(text, tone, hold)`
  skips the fade — because a verdict that has not arrived yet has nothing to
  fade to. It is dimmed rather than coloured, since it is not a result.

The service worker ignores cross-origin requests entirely, so none of this
touches the cache.

## What the end screen can say

The old end screen listed every word in the hive, found ones filled in and
missed ones outlined, which it could only do because it held the answers.
That panel is gone: with random letters and a remote dictionary, nothing on
the page knows what the hive contains.

So the summary counts what you found — `3:00 — 9 words.` — and stops there.
It must not imply a total it cannot compute. A spec asserts both the
wording and that `#all-words` no longer exists.

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
