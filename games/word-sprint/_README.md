# Word Sprint

Six tries at a hidden word of four, five or six letters, against a clock —
and every try you did not need takes ten seconds off your time.

## The name

Not the trademarked one. Guessing a hidden word from coloured feedback is a
mechanic, and mechanics are free to reimplement; the name of the famous
version is a New York Times mark and would end up in the slug, the storage
key, the precache list and the commit history. `Word Sprint` names the thing
that is actually ours — the clock and the board. See Naming a game in
CLAUDE.md; the name was settled before a file was created.

## The clock, and the bonus

The point of this version is that it is a **race**, not a daily puzzle.

- **The clock starts on your first letter**, not on load. Reading the rules,
  or picking a length, or getting a phone call before you start, costs
  nothing.
- **Each unused try is worth ten seconds.** Six tries; solve in three and
  three are spare, so thirty seconds come off. `final = max(0, raw − 10s ×
  spare)`.
- **The clamp at zero matters.** A three-try solve in under thirty seconds
  would otherwise score a negative time, and a leaderboard of negative
  numbers sorted ascending rewards the wrong thing. Zero is a perfect score
  and several can share it.

That bonus is the whole balance of the game: **being right early beats being
quick and wrong.** Ten seconds is more than a hurried guess saves, so
spraying letters to open the board up costs more than it gains. Change the
constant and you change what the game rewards.

A lost game records nothing. There is no time to record — you did not finish
— and a leaderboard that lists failures is a leaderboard nobody reads.

## Each length is its own race

Four, five and six letters keep **separate boards**, because they are not
comparable: six letters is a different search with the same six tries. The
length is picked at the top of the screen and switching starts a new word.

Five is the default, being the one everybody expects.

## The words

Two files, and the split matters.

**`js/lib/words.js` decides what the game accepts.** Twenty-six thousand
ordinary English words, 4 to 15 letters, shared with Honeycomb: Spelling and
consulted by `js/lib/dictionary.js` before it will consider asking a service.
"Is that a word?" is not a question about Word Sprint, so it is not Word
Sprint's list to keep.

**`words.js` here holds only the answer pool** — the words that may be the
hidden one, which is a far narrower question: words everybody knows, no
plurals, no proper nouns, common enough that nobody feels cheated by the
reveal. 1,212 / 1,431 / 1,714 of them at four, five and six letters.

Both are **generated, not written** — `_gen_words.py` at the repo root is the
generator, run by hand and never shipped or served. The site keeps no build
step; the generator's *output* is committed like any other source file. It is
regenerated only deliberately, and the commit should say so.

Three filters shape them, and the third is the one a machine cannot do:

1. **Frequency.** Answers are the most common words at that length; the
   shared list reaches much further down.
2. **A real dictionary.** Every word must appear in web2 **with its own
   lower-case entry**. This is the filter the first version of the wide list
   did not have, and the omission showed: cut by frequency alone it carried
   `espn`, `nasa`, `ipod`, `xbox`, `tokyo`, `obama`, `iphone`, `http` and
   `aaaa`, because word-frequency data is scraped from real text and real
   text is full of things that are not words. Lower-casing the dictionary
   first is not enough either — that lets every capitalised name back in
   (`doug`, `judas`). The lower-case form has to be an entry in its own
   right, which keeps `jack`, `march` and `polish` while dropping the names.
3. **No plurals, and no proper nouns, as answers.** A trailing S is a free
   letter and the singular is the interesting word. For names, the
   case-sensitive test above does most of it and a hand-written
   `NOT_ANSWERS` list does the rest — the obvious automatic test, "is the
   capitalised form also a word?", also catches *state*, *school*, *space*
   and *march*. Plurals and names are still perfectly good *guesses*.

A short blocklist keeps the obvious profanity out of both. It is not a
complete filter and does not pretend to be.

## When a word is not on the page

Twenty-six thousand words is wide but not complete, and being told a real word
"is not a word" is the most annoying thing this game can do. So a guess the
list does not carry is looked up through **`js/lib/dictionary.js`**, which
owns the requests and remembers the answer — so the second time anybody plays
that word, anywhere on the site, it is instant.

It asks **two** services in turn, because the first one went down entirely
and took word checking in both word games with it. A source has to answer a
control word before it is trusted with a real one, and a source that fails is
left alone for a growing interval rather than retried on every guess. The
details, and why a source must prove itself, are in the library and in
CLAUDE.md.

Three outcomes, and the third is the one to get right:

| Verdict | What happens |
| --- | --- |
| `yes` | Counts as a try, like any other word. |
| `no` | Refused, no try used. |
| `off` — nothing came back | **Refused, no try used, and the letters are cleared.** |

`off` is not a no. Offline, or with the service having a bad day, the honest
message is "could not check that one" — the guess costs nothing and the player
picks another word. Treating `off` as `no` would call real words wrong on a
bad connection; treating it as `yes` would let any typo through and hand out
letter information for free.

The row is **wiped** on `off`, after the shake and the notice, and that is the
one place this game clears letters the player typed. Leaving an uncheckable
word sitting in the row invites pressing Enter into the same wait again; an
empty row says "pick another one". Nothing else is lost — no try, no time.

### The clock stops while it asks

This is a race, so a wait on someone else's server is not the player's time.
`holdClock()` banks the elapsed time and stops the ticker; every path out of
the lookup restarts it. The clock dims (`[data-held]`) and the line under the
board names the word being checked — **a clock that stops for a reason the
player cannot see reads as a broken clock**, which is why the pause is never
silent.

### The lookup must always end

`fetch` has no timeout. A request that hangs hangs for ever, and a game that
gates its input on the answer hangs with it: this game locked solid on a guess
of `rater` — no letters, no delete, no Enter, clock stopped — because the
promise never settled and `checking` was never cleared.

Two things fix it, at two levels, and both are worth keeping:

- **`js/lib/dictionary.js` carries a deadline** (`DEADLINE`, six seconds) and
  aborts the request when it passes, so `look()` always settles. That belongs
  in the library rather than here, because every caller needs it and only the
  library knows it is making a request at all.
- **Every path out of `check()` clears `checking` and restarts the clock** —
  including the rejection handler, which should be unreachable now that
  `look()` cannot reject. A path that forgets is not a wrong answer, it is a
  dead game, so the guard stays cheap and stays.

A lookup also carries the generation it started under. Pressing New or
switching length during a wait bumps it, and the late answer is discarded
rather than landing a row on a game that no longer exists. The verdict is
still cached, so it costs nothing.

## Marking a guess

Two passes, and it has to be two. Exact positions are claimed first, then
letters "somewhere else" are handed out only from what is left over. A single
pass marks the second L of LLAMA amber against an answer with one L, which is
a lie about the word.

The keyboard shows the best news each letter has had, ranked
green > amber > grey, so a letter confirmed in place never drops back to
amber later in the game.

## Layout

Six rows of board and three rows of keyboard is more than a landscape phone
has height for. Stacked, at 740×360, the board came out taller than the box
it was given, **overflowed upwards and sat on top of the length buttons** —
which was not merely ugly: the board intercepted the taps and the buttons
stopped working.

Two things fix it, and both are worth keeping:

- **In landscape the board and keyboard sit side by side** rather than
  stacked, which is where the room actually is.
- **`.stage` clips.** `sizeBoard()` floors the cell size so squares stay
  readable, which means an extreme window can still ask for a board taller
  than its box. Clipping is a bad outcome; painting over the controls is a
  worse one, so the overflow is capped rather than trusted. This is the same
  "a measurement is a cap, not a height" rule the viewport module follows.

A spec drives all three lengths at all three sizes and checks the board sits
between the length row and the keyboard, rather than checking how it looks.

## Colours

`--right`, `--near` and `--wrong` are local and semantic — they name how a
letter did, not who owns it, so `css/players.css` is not involved. There is
one player.

Green and amber are also the only two marks that share a shape, which is
worth knowing before changing them: unlike the two-player games there is no
ring available to carry the difference, because a box's whole fill *is* the
mark. The letters remain readable in both, and the keyboard repeats the same
information in a second place, which is the mitigation.

## Persisted state

`localStorage`, key `games.word-sprint.v1`:

```json
{
  "length": 5,
  "scores": {
    "5": [{ "ms": 12000, "raw": 42000, "tries": 3, "word": "stone", "at": 1754600000000 }]
  }
}
```

`ms` is what ranks (after the bonus), `raw` is what the clock actually said,
and both are shown — a time of 0:12 that was really 0:42 with three tries
spare is a more interesting line than either number alone.

**The game in progress is not saved.** A reload deals a new word. The clock
and the leaderboard are the whole point, and restoring a half-played board
with a paused timer invites the obvious cheat; dealing again costs a tap.

Everything is validated on load: a try count outside 1–6, a non-finite time,
a length that is not 4, 5 or 6 all fall back rather than being trusted.
