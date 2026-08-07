# What Am I?

Hold the phone up so everyone but you can read it. You are told the
category; the room gives the clues; you work out the word.

## The category is disclosed

That is the whole design. The guesser is told *"this is an animal"* before
the clues start, and it changes the game from a shot in the dark to a
narrowing — fifty candidates instead of fifteen hundred.

So the category is styled as a **headline**, not fine print: uppercase, in
`--player-1`, sitting above the word at a size meant to be read across a
table. In the other two word games the category is a footnote; here it is
half the puzzle, and the type had to say so.

The card is shown the instant it is dealt. There is no reveal step, unlike
Star Words, because the phone is already facing the room and the guesser is
the one person who cannot see it.

## How a round runs

**Got it** is +1 and deals the next word. **Pass** moves on for nothing.
The room may not say the word, spell it, or rhyme it — enforced by the
table, not the app, in keeping with the rest of the site.

## Scoring

The same two modes as its neighbours, from `js/lib/party.js` — but note
which way round the roles sit here. In Forbidden Words and Star Words the
person holding the phone *gives* information; here they receive it. So:

- **Two teams** — the teams alternate and the whole team banks what its
  guesser earned.
- **Each player scores** — the buttons name **whoever gave the clue that
  landed**, and that player scores alongside the guesser holding the phone.
  Everywhere else the buttons name the guesser; the mechanic is identical
  and only the label changes.

The `Party` model calls the phone-holder `present` either way and each game
words it for itself, which is why the model exposes seats rather than job
titles. See `games/forbidden-words/_README.md` for the name editor and the
shared recent list, which work the same here.

In solo mode the name buttons take every pixel the card can spare, since
they are the whole scoring interface under a running clock. This card keeps
the **largest floor of the four party games** — `44dvh` — because it is held
up facing the room and has to stay legible from across a table; the buttons
get what is below it. See `games/forbidden-words/_README.md` for the shared
mechanism.

## Persisted state

`localStorage` key `games.what-am-i.v1`. Same shape as the other two word
games — a `settings` object and a `party` object; see
`games/forbidden-words/_README.md` for the field-level notes.

## Where the words come from

`js/lib/vocab.js`. This game uses only the term and its category; the five
related words each term carries are ignored here, because the clues come
from the room. They exist for Forbidden Words, which bans them.

## The scoring panel is shared

The name buttons, the board and the swap between the two scoring modes are
`js/lib/guess.js` — this game hands it the party and it draws them. Three
word games plus Fishbowl were carrying identical copies of that code, which
is what earned it a place in `js/lib/`; the wording around it (who presents,
what the ready line says) is still each game's own. See *Shared code* in
`CLAUDE.md`.
