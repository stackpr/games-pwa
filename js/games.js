// Registry of available games/tools. Add new entries here and list the
// game's files in sw.js PRECACHE_URLS (then bump CACHE_VERSION).
//
// Every entry needs a `section`. The home page groups by it and sorts
// alphabetically inside each group, so the order of this array does not
// matter and a new game lands in the right place without being placed.
const GAMES = [
  {
    name: 'Scorekeeper',
    section: 'scoring',
    description: 'Keep a running score for 2 to 8 players',
    emoji: '\u{1F3C6}',
    path: 'games/scorekeeper/'
  },
  {
    name: 'Counter',
    section: 'scoring',
    description: 'A single number, up and down',
    emoji: '\u{1F522}',
    path: 'games/counter/'
  },
  {
    name: 'Four in a Row',
    section: 'two',
    description: 'Drop a piece — four in a row wins',
    emoji: '\u{1F535}',
    path: 'games/four-in-a-row/'
  },
  {
    name: 'Tic-Tac-Toe',
    section: 'two',
    description: 'Three in a row, X against O',
    emoji: '\u{2B55}',
    path: 'games/tic-tac-toe/'
  },
  {
    name: '10,000 (Dice)',
    section: 'group',
    description: 'Press your luck with six dice',
    emoji: '\u{1F3B2}',
    path: 'games/ten-thousand/'
  },
  {
    name: 'Dice',
    section: 'other',
    description: 'Roll one to six dice, nothing else',
    emoji: '\u{1F3AF}',
    path: 'games/dice/'
  },
  {
    name: 'Spades',
    section: 'scoring',
    description: 'Scoresheet for four-handed partners',
    emoji: '\u2660\uFE0F',
    path: 'games/spades/'
  },
  {
    name: 'Checkers',
    section: 'two',
    description: 'Two players, forced jumps',
    emoji: '\u{1F3C1}',
    path: 'games/checkers/'
  },
  {
    name: 'Reversi',
    section: 'two',
    description: 'Trap a line and flip it',
    emoji: '\u{26AB}',
    path: 'games/reversi/'
  },
  {
    name: 'Mancala',
    section: 'two',
    description: 'Sow seeds — pick your house rules',
    emoji: '\u{1F330}',
    path: 'games/mancala/'
  },
  {
    name: 'Forbidden Words',
    section: 'group',
    description: 'Describe it without the banned words',
    emoji: '\u{1F6AB}',
    path: 'games/forbidden-words/'
  },
  {
    name: 'Star Words',
    section: 'group',
    description: 'Draw it — no letters, no talking',
    emoji: '\u{270F}\uFE0F',
    path: 'games/star-words/'
  },
  {
    name: 'Fishbowl',
    section: 'group',
    description: 'Write three answers each, then talk your team into them',
    emoji: '\u{1F41F}',
    path: 'games/fishbowl/'
  },
  {
    name: 'What Am I?',
    section: 'group',
    description: 'The room can see it, you cannot',
    emoji: '\u{1F914}',
    path: 'games/what-am-i/'
  },
  {
    name: 'Pitch',
    section: 'scoring',
    description: 'Scoresheet for four or five hands',
    emoji: '\u{1F0CF}',
    path: 'games/pitch/'
  },
  {
    name: 'Somewhere Between',
    section: 'group',
    description: 'Find the hidden spot on the scale',
    emoji: '\u{1F39A}\uFE0F',
    path: 'games/somewhere-between/'
  },
  {
    name: 'Honeycomb: 3 Bees',
    section: 'two',
    description: 'Shrink the comb, take the bees',
    emoji: '\u{1F41D}',
    path: 'games/honeycomb-3-bees/'
  },
  {
    name: 'Spin Words',
    section: 'group',
    description: 'Spin, call a letter, solve the puzzle',
    emoji: '\u{1F504}',
    path: 'games/spin-words/'
  },
  {
    name: 'Quik Dice',
    section: 'group',
    description: 'Cross off numbers in four colours',
    emoji: '\u274C',
    path: 'games/quik-dice/'
  },
  {
    name: 'Blackjack',
    section: 'solitaire',
    description: 'Vegas rules, your own bankroll',
    emoji: '\u{1F0A1}',
    path: 'games/blackjack/'
  },
  {
    name: 'Honeycomb: Spelling',
    section: 'solitaire',
    description: 'Seven random letters, checked online',
    emoji: '\u{1F524}',
    path: 'games/honeycomb-spelling/'
  }
];

// The headings, in the order they appear. A section with nothing in it is
// not rendered at all, so this list can run ahead of the games.
const SECTIONS = [
  { key: 'scoring', title: 'Scoring' },
  { key: 'two', title: '2 players' },
  { key: 'group', title: 'Groups' },
  { key: 'solitaire', title: 'Solitaire' },
  { key: 'other', title: 'Other' }
];

function tile(game) {
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
  return li;
}

function renderGameList() {
  const list = document.getElementById('game-list');
  if (!list) return;

  // Anything with an unknown or missing section still gets shown, under
  // Other, rather than quietly vanishing off the home page.
  const known = new Set(SECTIONS.map(s => s.key));
  const byKey = new Map(SECTIONS.map(s => [s.key, []]));
  for (const game of GAMES) {
    byKey.get(known.has(game.section) ? game.section : 'other').push(game);
  }

  for (const section of SECTIONS) {
    const games = byKey.get(section.key);
    if (!games.length) continue;
    // numeric so "10,000" sorts as a number rather than character by
    // character, which is the only reason it lands where a reader expects.
    games.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    const heading = document.createElement('h2');
    heading.className = 'section-title';
    heading.id = 'section-' + section.key;
    heading.textContent = section.title;

    const group = document.createElement('ul');
    group.className = 'game-group';
    group.dataset.section = section.key;
    group.setAttribute('aria-labelledby', heading.id);
    for (const game of games) group.append(tile(game));

    list.append(heading, group);
  }
}

renderGameList();
