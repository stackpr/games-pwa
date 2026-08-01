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
  },
  {
    name: 'Four in a Row',
    description: 'Drop a piece — four in a row wins',
    emoji: '\u{1F535}',
    path: 'games/four-in-a-row/'
  },
  {
    name: 'Tic-Tac-Toe',
    description: 'Three in a row, X against O',
    emoji: '\u{2B55}',
    path: 'games/tic-tac-toe/'
  },
  {
    name: '10,000 (Dice)',
    description: 'Press your luck with six dice',
    emoji: '\u{1F3B2}',
    path: 'games/ten-thousand/'
  },
  {
    name: 'Dice',
    description: 'Roll one to six dice, nothing else',
    emoji: '\u{1F3AF}',
    path: 'games/dice/'
  },
  {
    name: 'Spades',
    description: 'Scoresheet for four-handed partners',
    emoji: '\u2660\uFE0F',
    path: 'games/spades/'
  },
  {
    name: 'Checkers',
    description: 'Two players, forced jumps',
    emoji: '\u{1F3C1}',
    path: 'games/checkers/'
  },
  {
    name: 'Reversi',
    description: 'Trap a line and flip it',
    emoji: '\u{26AB}',
    path: 'games/reversi/'
  },
  {
    name: 'Mancala',
    description: 'Sow seeds — two rule sets',
    emoji: '\u{1F330}',
    path: 'games/mancala/'
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
