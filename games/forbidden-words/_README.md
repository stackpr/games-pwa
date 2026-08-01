# Forbidden Words

Describe the big word to your side without saying any of the small ones.
Two to twelve people, one phone, a running clock.

## The name

The obvious name for this game is a **Hasbro trademark**, so it is not used
anywhere — not in the slug, the storage key, the precache list, the specs or
the commits. *Forbidden Words* was chosen with the repo owner before a line
was written, which is the point of the rule in `CLAUDE.md`: the name ends up
in eight places and renaming afterwards means rewriting pushed history.

Game rules are not copyrightable and this is a fresh implementation of a
public idea. The name is the part that is owned.

## Where the words come from

`js/lib/vocab.js` — 30 categories, 50 terms each, every term carrying five
**related words**. This game bans those five. They were written for exactly
this case: not five facts about the thing, but the five words a describer
would reach for first, which is what makes the card hard.

Everything is at a sixth-grade reading level. A term nobody at the table can
read is a dead card, not a difficult one.

The deck is dealt straight through and only reshuffled when it runs out, so
a term cannot come round twice while unseen ones remain. `Vocab.pool()`
de-duplicates by word, because a term can honestly sit in two categories and
picking both must not deal it twice.

## Scoring, and the two modes

- **Two teams** — the teams alternate rounds and the whole team banks what
  its presenter earned. Exactly two sides, so the shared `--player-1` and
  `--player-2` identities apply.
- **Each player scores** — nobody is on a team. One player presents, and the
  action row becomes **one button per player**. Tapping a name gives the
  point to that player *and* to the presenter, and deals the next card in
  the same tap.

The per-player buttons are why **names matter here** in a way they do not in
the board games: a row reading "Player 3, Player 4, Player 5" is unusable
across a table. Hence the name editor, and hence the shared recent list.

Naming the guesser at the moment of scoring — rather than pairing people up
in advance — is what makes the presenter's job a real one. Getting through
to *anybody* scores, so there is no partner to specialise with, and the
player who is quickest all evening genuinely earns it.

Two consequences in the code:

- **Solo pays out per card; teams banks at the end of the round.** The point
  belongs to the seat that was named at that moment, so it cannot wait; a
  team round has only one side it could ever have gone to. `score()` branches
  on exactly that and nothing else.
- **Skip and a foul name nobody**, so they land on the presenter alone. A
  foul is the presenter's mistake by definition.

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

## Layout

Four screens on one page, switched by `data-screen` on `<body>`: **setup**,
**ready**, **play**, **over**. Only setup scrolls — a round played with the
board scrolled halfway is a round nobody can read.

The banned list is bordered in the foul colour so a describer's eye lands on
it *before* the word underneath. That is the wrong reading order for prose
and the right one here.

The clock turns amber under ten seconds with **no animation**. A pulse is
invisible half the time it is looked at, and this is the one thing on screen
that must be readable at a glance.

## Persisted state

`localStorage` key `games.forbidden-words.v1`:

```json
{
  "settings": { "mode": "teams", "players": 4, "seconds": 60,
                "categories": ["Animals", "Food and Drink"] },
  "party": { "mode": "teams", "names": ["Team 1", "Team 2"],
             "scores": [7, 5], "round": 4 }
}
```

Saved on every setting change and at the end of every round — not during
one, because a round is worthless if interrupted and there is nothing to
come back to mid-clock.

Changing the mode or the player count **starts the scores over**: those are
different seats, and carrying a score onto a seat that moved is worse than
losing it. No saved categories means all of them, which is what a first run
wants — a full deck and nothing to read before playing.
