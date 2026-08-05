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
| Length | `(n − 4)²` — 0, 1, 4, 9, 16, 25 at 4–9 letters |
| All seven letters | +10 — a pangram |

Worked examples: `ache` = 9 + 0 = **9**. `cheat` = 10 + 1 = **11**.
`cheetah` = 15 + 9 = **24**. `checkmate` = 22 + 25 + 10 = **57**.

**Why these two halves.** Letter values alone would score a four-letter
word the same as a nine-letter one built from the same letters, and length
alone would say `entire` and `jinxed` are equally hard. Together each one
owns a range: **the bonus is zero at the four-letter floor**, so the
shortest legal word is scored purely on how awkward its letters are, and it
reaches 25 by nine letters, so a long word is scored almost entirely on its
length. `quiz` (22) beats `entire` (10) despite being shorter;
`entertain` (34) beats `quiz` despite being made of ones.

Measuring the reach from the floor rather than from one below it is what
makes the bonus mean "letters past the minimum" — four letters is the price
of admission, so it earns no bonus, and the fifth letter is the first one
that has been reached for.

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
reaches it — `submit()` rejects those first — but an unclamped `(n − 4)²`
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

**Each limit keeps its own top ten.** A minute and ten minutes are not
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

**Enter is optional on the last word.** When the clock runs out, whatever
letters are on the line are submitted as a guess before the game settles.
A word typed in time is a word typed in time, and the settling wait
(below) already exists to collect the answer. Pressing Done does *not* do
this: ending the game early is a deliberate act, and the letters left on
the line are as likely to be an abandoned attempt as a finished word.

**New, next to Done, deals seven fresh letters** and restarts the clock.
Some hives are simply not viable, and there is nothing to be gained by
making a player sit out three minutes to find that out. It only appears
while a game is on — outside one, the New button already means this — and
it takes no confirmation, because it is only ever reached from a game the
player has already decided is not worth finishing. The score so far is
lost with the hive.

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
  scores: {                    // one top-ten per limit, highest first
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

- **Almost no offline play.** The shell still loads from the precache, so
  the page, the boards and the hive all come up with no network, and words
  the shipped vocabulary happens to know still score — but that is a few
  hundred words, not a game. The start sheet says so up front, driven by
  `navigator.onLine` and the `online`/`offline` events, rather than letting
  a player find out one rejected word at a time.
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

### Flattened, not raw, frequency

The consonant table is raised to the power of `FLATTEN` (0.75) before
anything is drawn from it. Raw English frequency is the right *order* and
the wrong *spread*: `t` at 9.1 against `k` at 0.77 means a hive is nearly
always built from the same dozen cheap letters, and the letters that pay —
`k`, `v`, `w`, `y`, `f`, `h` — sit on the bench. Since a word's score is
mostly its Scrabble letters, that made a high score something you waited
for rather than played for.

Flattening keeps every letter in its place (`t` is still the commonest)
while pulling the tail up: `k` moves from roughly one hive in sixteen to
one in eleven, `v` and `w` similarly. It is a spread control, not a
re-ranking, which is why it is one exponent rather than a hand-tuned second
table. Vowels are left alone — `u` is a one-point letter and making it
commoner would buy nothing.

### The hard letters

`j`, `q`, `x` and `z` are listed in `HARD` and have their weight multiplied
by `HARD_PENALTY` (0.4) when the table is built. English frequency alone
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
is *not* a `'no'`. It is never cached, and the same word can be tried again
the moment the connection is back. Collapsing "the dictionary says no" into "we could not ask" would
quietly turn every outage into a game that rejects real words.

### Our own vocabulary first

`js/lib/vocab.js` already ships with every page on the site, so `lookUp()`
checks it before anything goes near the network. A hit costs no request, no
wait and no connection at all.

It is a **yes-list only** — a word missing from it proves nothing, so
everything else still goes to the API. Multi-word and hyphenated entries are
dropped when the set is built (`/^[a-z]+$/`), because nothing with a space
or a hyphen in it can be typed on a seven-letter hive, and half of
`Wind-up toy` must not become a word by accident.

### The retry queue

The API answers inconsistently — a request that fails once often succeeds a
moment later — so an `'off'` is **queued, not discarded**. `game.retry`
holds one entry per word, `{ word, tries, due }`, and a single timer
(`pump()`) is always set for whichever entry is due soonest. One timer for
the whole queue rather than one per word: easier to cancel, and impossible
to leak.

- **Five tries in all**, the waits doubling — 1s, 2s, 4s, 8s. After that the
  word is dropped. That is not a verdict, and it is still never cached: the
  same word can be tried again by typing it.
- **No duplicates.** `queue()` refuses a word already queued or already
  found, and `submit()` turns a re-typed one back into the waiting line
  rather than a second request. One guess is one place in the queue however
  often it is typed.
- **The queue is visible**, at the head of the found-words strip, outlined
  rather than filled so a word awaiting an answer cannot be mistaken for one
  that scored.

### Waiting is shown, never explained

The line above the hive names the words that are still out — `hive`, or
`hive, honey, phone` once several are — and says nothing else about them.
There is no *checking*, no *no answer, will retry*, no *could not check*
and no *finishing, 2 words still out*.

A retry, a fifth failed ask and a slow first request are all the same thing
from where the player sits: **that word has not come back yet.** The
difference between them is a fact about a third-party API, which is
interesting to whoever maintains this and to nobody holding the phone. So
the word appears when it goes out and vanishes when it resolves, and the
try count is gone from the chips for the same reason.

Comma-separating is what makes that affordable: the line is one row shared
with the word being typed, and a sentence per waiting word would not fit
three of them.

A verdict *is* worth words — `+14`, `Pangram! +26`, `Not a word: hive` —
and those still flash for their beat. When one fades and something is still
out, the waiting line comes back rather than leaving the row empty.

Putting it in the found strip rather than a row of its own is deliberate:
that strip already costs a fixed height, and a new row would have to come
out of the hive's budget or push the bottom controls off a short phone. See
the layout notes.

### Finishing waits for the queue

A word submitted before the buzzer should score even if the dictionary was
slow, so the clock stopping no longer ends the game outright. `finish()`
moves to a **`settling`** phase: the clock stops and typing stops, but the
result is held while anything is still out. `showOver()` is what actually
produces the end screen.

- Queued retries are **pulled forward** on entering `settling` — there is
  nobody left to be polite to, so the doubling waits collapse to one short
  gap.
- The whole wait is **capped at 12 seconds**. A dictionary that never
  answers must not strand a game on a spinner.
- The **New button becomes Skip**, so the cap is not the only way out.
- Anything still unanswered when the result appears is abandoned there,
  rather than scoring into a game that has already been recorded.

This reverses the older rule that an answer arriving after the game had
ended was dropped. That rule was right when a lookup was one request; with a
retry queue behind it, dropping the answer would punish a player for the
API's flakiness rather than for running out of time.

### Tapping the hive

Taps are taken on **`pointerdown`, not `click`**. A click needs press *and*
release on the same element, and the seven hexagons tile exactly — their hit
areas touch — so a finger that lands on one and drifts a few pixels onto its
neighbour before lifting produced no click at all. That is what made tapping
feel unreliable rather than merely imprecise.

Only one of the two is ever bound (`window.PointerEvent ? 'pointerdown' :
'click'`), so a tap can never register twice. `preventDefault()` is
deliberately *not* called, which is what keeps the `:active` brightness on
the tile. Keyboard players are already served by the document-level
`keydown` handler, so nothing is lost by not listening for `click` on the
buttons themselves.

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
- **The clock does not stop for a lookup.** `ask()` pins the current game in
  `round` and the callback bails if `game !== round`, so a verdict for a
  game that has been packed away goes nowhere. What it no longer does is
  bail on the phase — see Finishing waits for the queue.
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
