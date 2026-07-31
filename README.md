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
| [Scorekeeper](games/scorekeeper/) | Running score for two teams — tap a column to score |
| [Counter](games/counter/) | One number, up and down — tallies with no rules attached |
| [Connect Four](games/connect-four/) | Two players, one phone — touch a column to drop a piece |
| [Tic-Tac-Toe](games/tic-tac-toe/) | Three in a row, X against O |

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
