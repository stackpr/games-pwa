# Star Words

Draw the word. No letters, no numbers, no talking. The app deals the cards,
runs the clock and keeps score; the drawing happens on paper.

## The name

The obvious name for this game is a **Mattel trademark**. *Star Words* was
confirmed with the repo owner before anything was written — it is not a
registered mark, and the only thing against it was a passing resemblance to
a film franchise, which the owner judged a non-issue in a drawing-game
context. Recording that here so nobody re-litigates it later.

The rules modal notes that the game is sold under brand names and that this
is the game rather than the brand.

## How a round runs

Every card starts **covered**. The phone sits face-up next to whoever is
drawing, and a word that simply appeared would be read by the room before
the drawer had a chance to cover it. Tapping **Show me the word** uncovers
it; the next card covers itself again.

The card carries its **category**, which the drawer may say out loud. That
is deliberate: it narrows fifteen hundred words to fifty, which is the
difference between a drawing and a guessing game.

**Got it** is +1 and deals the next card. **Skip** passes for nothing. There
is no foul button — the banned things here (letters, words, talking) stop the
drawing rather than costing a point, and the table can just say no.

Rounds run longer than the other two word games — 60 to 180 seconds — because
drawing is slower than talking.

## Scoring

Identical to the other two, and it lives in `js/lib/party.js`:

- **Two teams** — the teams alternate and the whole team banks the round.
- **Drawer and guesser** — each round pairs one drawer with one guesser and
  **both** take every point. See Forbidden Words' `_README.md` for why the
  guesser is fixed rather than being whoever shouted first.

## Shared with its neighbours

Three word games would otherwise carry three copies of the same setup
screen, clock and scoreboard, so those are extracted:

| Module | What it owns |
| --- | --- |
| `js/lib/vocab.js` | The library, and dealing a shuffled deck from chosen categories |
| `js/lib/timer.js` | The countdown. Derives time from a start timestamp, not a decrementing counter — a backgrounded phone throttles timers and a counter comes back wrong by however long the screen was off |
| `js/lib/party.js` | Who presents, who guesses, who scores. Model only |
| `js/lib/setup.js` | The setup controls and their validation |
| `css/party.css` | The four-screen shell, the clock, the scoreboard |

Each game keeps its own card face, its own action row and its own copy, which
is where the three actually differ.

## Persisted state

`localStorage` key `games.star-words.v1`, the same shape as Forbidden Words:
a `settings` object and a `party` object. See that file for the field-level
notes; the only difference is the round lengths on offer.
