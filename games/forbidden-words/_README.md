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

**Got it** is +1, **Skip** is 0, **Foul** is −1. Foul is the guessers' call,
not the describer's — the button is there so the table can enforce the rule
without stopping the clock.

- **Two teams** — the teams alternate rounds and the whole team banks what
  its describer earned. Exactly two sides, so the shared `--player-1` and
  `--player-2` identities apply.
- **Presenter and guesser** — nobody is on a team. Each round pairs one
  describer with one guesser and **both** take every point.

The pair rotation is in `js/lib/party.js`: the describer walks one seat a
round, the guesser sits one further along and slides an extra seat every
full lap. Over `n − 1` laps everyone describes to everyone exactly once,
rather than the same two people pairing forever.

Pairs mode deliberately **fixes** the guesser instead of awarding the point
to whoever shouted first. Tracking that means tapping a name for every card,
mid-timer, with the room yelling — the one moment a game cannot ask for
input. Fixing the pair keeps a round to one tap per card.

More than two seats means no player colours: two tokens means two sides, so
pairs mode marks who is up with weight and a ring rather than inventing a
third hue. See Player colors in `CLAUDE.md`.

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
