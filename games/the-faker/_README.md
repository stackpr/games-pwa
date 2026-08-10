# The Faker

Sixteen words on a board. Everybody but one player is told which of them is
*the* word. Go round the table saying a single word about it — and work out
who has no idea what everyone is talking about.

## The name

Not the trademarked one. The rules of a hidden-role word game are free to
reimplement; the name of the game that popularised it is a registered mark
of its publisher and would end up in the slug, the storage key, the precache
list, the specs and the commit history. `The Faker` says what the hidden
player is doing. See Naming a game in CLAUDE.md — the name was settled
before a single file was created, which is the whole point of that rule.

## It runs on the shared vocabulary

**No new word data.** The board is sixteen terms dealt from one
`js/lib/vocab.js` category, with the category name as the heading — which is
exactly the shape the game needs, because a Vocab category already *is* a
set of forty things that plausibly sit together. Thirty categories, forty
terms each, so the same category deals a different sixteen every time and
the board is never one anybody has memorised.

The category picker in the setup screen is the shared one, so a table that
only wants Food and Animals gets a game made of those.

### The Understudy runs on the *related* words

`Vocab` stores each term as `Word|five,related,words,go,here`. Those five
exist for Forbidden Words, which bans them — they are written as "the words
a describer would reach for first". That makes them, for free, a **partial
description of the word**: enough to bluff from, not enough to know.

So with six or more players a second hidden player joins. The **Understudy**
is not told the word either, but is shown its five related words:

```
You are the Understudy. Not the word — five words about it:
trunk · gray · tusk · africa · huge
```

They can talk with real confidence and still be wrong, which makes them much
harder to spot than the Faker — and the table now has two people to find
without knowing there are two. Neither hidden player knows whether the other
exists, which is the part that makes it work.

**Six is the floor** (`UNDERSTUDY_FROM`), and the setting says so rather
than silently doing nothing. Two of five players in the dark is a coin toss,
not a read. The setting can be turned off entirely; it cannot be turned on
below six.

## A round

1. **Setup** — players (3–10), names, categories, and whether the Understudy
   is in.
2. **Pass the phone.** One seat at a time: *"Pass the phone to Ari"* → tap →
   the board, plus what Ari knows → *"Hide and pass on"*. The board is the
   same sixteen words for everyone; only the ring around the word and the
   line underneath differ.
3. **One word each**, out loud, round the table. The phone shows the board
   with nothing marked, so it can sit in the middle.
4. **Argue and point.** Then `Reveal`: the word, and who the Faker was.

**Nothing is scored.** Who won an argument is not something a phone can
settle, and a scoreboard would need somebody to adjudicate a vote the app
never saw. The reveal screen carries the one rule the app cannot enforce —
a caught Faker gets one guess at the word to steal it back — as a line of
text, because that is a thing the table does, not a thing the app does.

## What it reuses, and what it does not

| Reused | Why |
| --- | --- |
| `js/lib/vocab.js` | The board and the Understudy's clues, as above. |
| `js/lib/setup.js` (`PartySetup`) | The whole setup screen: player count, the type-or-pick names panel, the category grid, and the "no categories, no start" rule. This is its fifth caller. |
| `js/lib/names.js` | The cross-game recent-players list. |
| `js/lib/party.js` | Only `MAX_PLAYERS`, and indirectly through `PartySetup`. |
| `css/party.css` | The screen switching (`body[data-screen]`), the top bar, the setup fields, the ready screen. |

`PartySetup` carries a **scoring mode this game has no use for**, and that is
worth knowing before changing anything here: `settings.mode` is forced to
`'solo'` on load, and it has to be. `css/party.css` hides `#players-field`
and `#names-field` unless `body[data-mode="solo"]`, so a game that leaves the
mode at its default gets a setup screen with no player count and no names on
it — and nothing warns, because both fields are simply not displayed.
`'solo'` is also the honest one of the two: there are no teams here.

What is *not* reused is `Party` itself, beyond a constant. `Party` models a
presenter walking round the table on a timer, scoring per card. The Faker has
no presenter, no timer, and no score — everybody acts at once. Bending it to
fit would have meant a mode that means nothing in three other games.

## Colours

`--secret`, `--faker` and `--understudy` are local and semantic. They name a
**role**, not a person, which is why the game does not touch
`css/players.css`: with 3 to 10 seats there is no fixed pair of sides to
colour, and the site's two player tokens mean "player 1" and "player 2"
everywhere else. See Player colors in CLAUDE.md.

The word on the board is marked with **a ring as well as a colour**, so it
reads without colour vision and in a screenshot. The Faker and Understudy
panels get a ring in their own colour for the same reason.

## Persisted state

`localStorage`, key `games.the-faker.v1`:

```json
{
  "settings": { "mode": "solo", "players": 6, "seconds": 60,
                "categories": ["Animals", "Food and Drink"],
                "nameMode": "pick" },
  "names": ["Ari", "Sam", "Bex", "", "", ""],
  "useUnderstudy": true
}
```

**The dealt round is not saved.** A reload mid-round returns to the setup
screen with the same table, and the round is dealt again. That is deliberate:
the whole game is information that some players have and others do not, and a
half-restored round — where the phone knows the word but not who has already
seen it — is worse than a fresh deal. Dealing again costs one tap.

`settings.seconds` is in there because `PartySetup.shape` puts it there; the
game has no timer and never reads it.
