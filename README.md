# games-pwa

A small collection of offline-friendly games and tools, served as an
installable PWA at **https://games.payne.run**.

- 100% static — plain HTML/CSS/JS on GitHub Pages, no build step, no backend
- Installable on Android/desktop (native prompt) and iOS (Add to Home Screen)
- Works fully offline via a service worker
- Data persists in the browser (`localStorage`)

## Games & tools

| Game | Description |
| --- | --- |
| [Scorekeeper](games/scorekeeper/) | Running score for 2 to 8 players — tap a seat to score |
| [Counter](games/counter/) | One number, up and down — tallies with no rules attached |
| [Four in a Row](games/four-in-a-row/) | Two players, one phone — touch a column to drop a piece |
| [Tic-Tac-Toe](games/tic-tac-toe/) | Three in a row, X against O |
| [10,000 (Dice)](games/ten-thousand/) | Press your luck with six dice, 2–12 players |
| [Dice](games/dice/) | A plain dice roller — pick one to six dice and throw |
| [Spades](games/spades/) | Scoresheet for four-handed partners, with nil and blind nil |
| [Checkers](games/checkers/) | Two players on one phone, jumps forced |
| [Reversi](games/reversi/) | Trap a line of discs and flip them |
| [Mancala](games/mancala/) | Sow seeds round the board — three house rules to set |
| [Forbidden Words](games/forbidden-words/) | Describe the word without saying any of its clues |
| [Star Words](games/star-words/) | Draw the word — no letters, no numbers, no talking |
| [What Am I?](games/what-am-i/) | Hold the phone up; you get the category, they give the clues |
| [Pitch](games/pitch/) | Scoresheet for four- or five-handed Pitch, 10 or 13 point |
| [Somewhere Between](games/somewhere-between/) | Drag the marker to the hidden spot on a scale |
| [Honeycomb: 3 Bees](games/honeycomb-3-bees/) | Drop a bee in a cell, take a cell away — the comb shrinks under you |
| [Blackjack](games/blackjack/) | Vegas rules, any bet, a bankroll that carries over |
| [Quik Dice](games/quik-dice/) | Six dice, four colour rows — everyone on their own phone |
| [Spin Words](games/spin-words/) | Spin the reel, call a letter, solve the puzzle — pass the phone |

## Development

No tooling required:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Service workers require http(s), so `file://` won't work. When iterating on
precached files, bump `CACHE_VERSION` in `sw.js` or enable
DevTools → Application → "Update on reload".

There is a Playwright suite in `_tests/` (repo-only, never published). It
starts its own server:

```bash
cd _tests && npm ci && npm test
```

See `CLAUDE.md` for project conventions and how to add a new game, and
`_tests/README.md` before running the suite for the first time.
