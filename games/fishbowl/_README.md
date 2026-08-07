# Fishbowl

Everyone answers one question a few times over. The answers go in a bowl,
and the table takes turns getting each other to say them — three rounds
over the same slips, with less to say each time.

## The name

Fishbowl is the traditional name for this parlour game, the way Charades
is: it is named after the bowl the slips of paper go in, it has no
publisher, and the variants (Salad Bowl, Celebrity, the Hat Game) are folk
names for the same thing. Nothing here is borrowed from a published title.
See *Naming a game* in `CLAUDE.md`.

## Use case

One phone, any number of people, in teams or each for themselves. It replaces the bowl,
the paper and the kitchen timer — the parts of this game that are always
missing when somebody suggests playing it — and nothing else. The phone is
passed round twice: once to fill the bowl, then once per turn.

## One question, not a deck

Every other word game on the site deals from `js/lib/vocab.js`. This one
does not deal at all: the table writes the slips, which is the whole point
of Fishbowl — the answers are about the people in the room.

The **question** is what makes those answers hang together. Ten are
offered, all of them concrete and widely known, and any of them can be
replaced by typing one. Choosing a suggestion and then typing clears the
suggestion, because two selected questions would be a lie about what
everybody is about to write.

The question is shown above the answer boxes the whole time the bowl is
being filled, since it is the one thing every player has to be told and the
phone reaches each of them separately.

## Filling the bowl

One player at a time, **one to five answers each** — three by default. How
many is a setting because the right number is the table's business: eight
people writing three slips each is a twenty-four-slip round, which is long,
and three people writing one each is over before it starts.

- **Next player** takes the answers, empties the boxes and moves on. It is
  dead until every box is filled: the boxes and a disabled button say "all
  of them" better than an error message does.
- **No more players** starts the game. It takes the answers on screen if
  they are all filled, and discards them otherwise — a part-filled form at
  that point is somebody who changed their mind, not an answer.
- The first player can use either button, so a bowl filled by one person
  works. **No more players** is only dead when the bowl is empty *and* the
  form is not full, which is the one case with nothing to play.
- **Repeats are refused by default**, by name — two identical slips are
  indistinguishable in play and the second one is nearly always a mistake.
  It is a setting rather than a rule because on a narrow question ("a
  colour") a repeat is not a mistake at all, it is two people thinking the
  same thing, and refusing it just makes somebody retype.
- The name box appears **only when the scoring is by name**, since that is
  the only mode with anything to call the seats. It offers whoever has
  played before, from the shared recent-names list (`js/lib/names.js`).

How many players there are is never asked for as a setting: it is the
length of `players`, one entry per person who has finished, which is also
what "Player 4" at the top counts. A reload mid-typing loses only the line
being typed.

## A turn

The clock is `js/lib/timer.js` — 30, 45, 60 or 90 seconds, chosen at setup.
It derives the time left from a timestamp rather than counting a variable
down, so a phone that throttles a backgrounded tab comes back with the
right answer.

- **Got it** is a point and the next slip, immediately. Where the point
  goes depends on the scoring mode — see below.
- **Pass** sets the slip **aside** rather than dropping it back in the
  bowl, and it returns when the turn ends. Putting it straight back would
  let the same unguessable slip come round twice in one turn, which is the
  thing passing exists to avoid.
- The turn ends when the clock runs out, or when the bowl runs dry with
  slips still set aside.
- The **round** ends when the bowl runs dry with nothing set aside. The
  slips all go back in and the next round starts with the next seat.

**A turn cannot be resumed.** A reload during one lands on the between
screen with the turn spent: points already scored stand, the slip in hand
and everything set aside go back in the bowl, and the phone moves to the
next seat. The clock stopped while the page was gone and there is no honest
time to restart it with — the same rule as Spin Words' solve and Honeycomb:
Spelling's game.

## The three rounds

| Round | What you may do |
| --- | --- |
| Describe it | Say anything except the words on the slip |
| One word | One word, said once |
| Act it out | Nothing at all |

The rounds are the game. Everyone has heard every slip by round two, so the
same answers get harder to give and easier to guess at the same time, and a
slip that took a paragraph in round one goes in a gesture by round three.
The round's name sits on the card itself during the turn, because it is the
one thing about the slip in hand that a clue-giver forgets under a clock.

Nothing enforces them — the table does, as everywhere else on this site.

## Two ways to score

The same two the other party games offer, and the same interface —
`js/lib/guess.js` owns what they look like, which is why the turn screen is
Star Words' turn screen with a different card face.

- **Teams** — two to six of them, taking turns. The whole team keeps what
  its clue-giver earns.
- **Each player scores** — the action row becomes one button per player,
  everybody except whoever is giving the clues. The point goes to the
  player named *and* to the clue-giver, so getting through to anybody is
  worth the same and there is no partner to specialise with.

**Scoring by name needs no player-count setting.** The seats are whoever
filled the bowl, which the game already knows — the count, and the names,
come from the writing screen. That is the one thing this game has that the
others do not, and it is why it does not use `js/lib/party.js`: that model
fixes teams mode at exactly two sides.

It also needs at least two players, or the buttons would be empty and
nothing could score. **No more players** says so rather than starting a
game that cannot be played.

## Seats, not player colours

Two to six teams, so the shared `--player-1`/`--player-2` identities are
deliberately **not** used: two tokens mean two sides, and a third team
would have to invent a colour. `GuessPanel` enforces that centrally — it
only puts `data-seat` on a board row when there are exactly two seats in
teams mode — so the seat that is up is marked by weight instead. See
*Player colors* in `CLAUDE.md`.

Names live in **Settings**, editable at any point without disturbing the
game: the teams in one mode, the players in the other. A name typed there
updates the scoreboard and the up-next line without rebuilding the form
under the cursor. An unnamed seat is "Team 3" or "Player 3"; the fallback
is applied when the name is read, never stored, so an empty box stays an
empty box.

Everything else — the question, the scoring mode, the number of teams, how
many answers each and the turn length — is set when a game starts, because
changing any of them mid-game would mean throwing the bowl away.

## Layout

`css/party.css`, unmodified, supplies the setup, ready, play and over
screens, the clock, the scoreboard and both action rows; this game adds two
screens it has no notion of — filling the bowl, and the pause between
turns. Reusing it is why this page has no `--app-height`: the party games
size themselves with `100dvh` and none of them carries `js/lib/viewport.js`.

The card carries the **round name where Star Words carries the category**,
which is the same slot doing the same job: the one thing about this card
that the clue-giver has to hold in their head. The rule itself
("one word, said once") is on the ready screen, where there is time to read
it.

The writing screen is the only one that scrolls, and the only one where the
on-screen keyboard is expected. Its buttons sit at the end of the flow
rather than pinned to the bottom, so the keyboard pushes them up the page
instead of covering them.

## Persisted state

`localStorage` key `games.fishbowl.v1`, one JSON object:

```json
{
  "phase":    "setup | write | ready | play | between | over",
  "mode":     "teams | solo",
  "question": "An animal",
  "teams":    2,
  "answers":  3,
  "unique":   true,
  "seconds":  60,
  "names":    ["", ""],
  "players":  ["Ada", "Ben", ""],
  "scores":   [0, 0],
  "slips":    ["Otter", "Puffin", "..."],
  "left":     [0, 2, 5],
  "aside":    [1],
  "hand":     4,
  "round":    0,
  "turn":     0,
  "gained":   0,
  "between":  "turn | round",
  "why":      "The bowl is empty."
}
```

`names` is the teams and `players` is the people; which one the seats come
from is `mode`, and `scores` is sized to match. Both are kept through a
change of mode so that switching back does not lose the typing.

`slips` is every answer written, and `left`, `aside` and `hand` are
**indexes into it** rather than copies — one slip has one home, so a bowl
cannot end up holding a word that nobody wrote. `load()` drops any index
that does not point at a slip, which is what makes a hand-edited or
truncated save fail safe rather than render `undefined` on the card.

`between` is which pause the between screen is showing; without it a reload
during a turn would land on a screen with no heading.
