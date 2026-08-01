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

**Only the first card of a round is covered.** The phone has just been
handed over and the room is still looking at it, so that one word waits
behind a tap. After that every card arrives face up: by then the drawer has
the screen to themselves, and a tap-to-reveal between every word buys
nothing and costs seconds off a running clock.

That is also why naming the guesser deals the next card in the same tap.
A turn should be one tap per word, not three.

The card carries its **category**, which the drawer may say out loud. That
is deliberate: it narrows fifteen hundred words to fifty, which is the
difference between a drawing and a guessing game.

**Got it** is +1 and deals the next card. **Skip** passes for nothing. There
is no foul button — the banned things here (letters, words, talking) stop the
drawing rather than costing a point, and the table can just say no.

Rounds run longer than the other two word games — 60 to 180 seconds — because
drawing is slower than talking.

## Scoring, and the two modes

- **Two teams** — the teams alternate rounds and the whole team banks what
  its drawer earned. Exactly two sides, so the shared `--player-1` and
  `--player-2` identities apply.
- **Each player scores** — nobody is on a team. One player presents, and the
  action row becomes **one button per player**. Tapping a name gives the
  point to that player *and* to the drawer, and deals the next card in
  the same tap.

The per-player buttons are why **names matter here** in a way they do not in
the board games: a row reading "Player 3, Player 4, Player 5" is unusable
across a table. Hence the name editor, and hence the shared recent list.

They also take **every pixel the card can spare**, since they are the whole
scoring interface under a running clock. This card is one word and a reveal
overlay, so its solo-mode floor is the smallest of the four party games —
`32dvh` — and the buttons get the rest. See
`games/forbidden-words/_README.md` for the shared mechanism.

Naming the guesser at the moment of scoring — rather than pairing people up
in advance — is what makes the drawer's job a real one. Getting through
to *anybody* scores, so there is no partner to specialise with, and the
player who is quickest all evening genuinely earns it.

Two consequences in the code:

- **Solo pays out per card; teams banks at the end of the round.** The point
  belongs to the seat that was named at that moment, so it cannot wait; a
  team round has only one side it could ever have gone to. `score()` branches
  on exactly that and nothing else.
- **Skip and a foul name nobody**, so they land on the drawer alone. A
  foul is the drawer's mistake by definition.

### Setting names

Two input modes, switched in setup:

- **Type them** — one box per seat. A name is committed on every keystroke
  and **remembered when the box loses focus**, not on every keystroke, or the
  recent list would fill with every half-typed prefix.
- **Pick who's here** — tap names from the list of everyone who has played.
  The **player count follows the ticks**, which is the point: the table sets
  itself up by tapping who turned up. Ticking fills the first unnamed seat
  rather than adding a seat beside it, which is why an unnamed seat holds an
  empty string rather than "Player 3" — the numbered version is a display
  fallback (`Party.nameAt`), never data.

A first run finds the list empty, so it is put into the typing mode rather
than shown a panel it cannot use.

The recent list lives under `games.party-names.v1`, **shared by every party
game**, because the people at the table are the same people whichever game
they are playing. It is the one cross-game key in the tree. A name already
on the list is promoted rather than duplicated, so the regulars stay at the
top and it never needs managing; it keeps the newest twenty.

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
