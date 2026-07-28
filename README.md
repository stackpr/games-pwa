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

## Development

No tooling required:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Service workers require http(s), so `file://` won't work. When iterating on
precached files, bump `CACHE_VERSION` in `sw.js` or enable
DevTools → Application → "Update on reload".

See `CLAUDE.md` for project conventions and how to add a new game.
