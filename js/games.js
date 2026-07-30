// Registry of available games/tools. Add new entries here and list the
// game's files in sw.js PRECACHE_URLS (then bump CACHE_VERSION).
const GAMES = [
  {
    name: 'Scorekeeper',
    description: 'Keep a running score for two teams',
    emoji: '\u{1F3C6}',
    path: 'games/scorekeeper/'
  },
  {
    name: 'Counter',
    description: 'A single number, up and down',
    emoji: '\u{1F522}',
    path: 'games/counter/'
  }
];

(function renderGameList() {
  const list = document.getElementById('game-list');
  if (!list) return;
  for (const game of GAMES) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = game.path;

    const emoji = document.createElement('span');
    emoji.className = 'game-emoji';
    emoji.textContent = game.emoji;

    const text = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'game-name';
    name.textContent = game.name;
    const desc = document.createElement('div');
    desc.className = 'game-desc';
    desc.textContent = game.description;
    text.append(name, desc);

    a.append(emoji, text);
    li.append(a);
    list.append(li);
  }
})();
