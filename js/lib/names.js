/*
 * Player names, and the list of everyone who has played before.
 *
 * Names matter here in a way they do not in the board games: solo mode
 * scores by tapping "who got it", so the buttons are names and a table of
 * "Player 3, Player 4, Player 5" is unusable. Typing five names on a phone
 * before every game is worse. So the names are remembered once and picked
 * from a list afterwards.
 *
 *   Names.recent()            -> ['Ari', 'Sam', ...] most recent first
 *   Names.remember(['Ari'])   adds or promotes, keeps the newest 20
 *   Names.forget('Ari')
 *
 * The recent list lives under its own key, shared by every party game,
 * because the people at the table are the same people whichever game they
 * are playing. That makes it the one cross-game key in the tree — see
 * Persisted state in any of the party games' _README.md.
 */
window.Names = (function () {
  const KEY = 'games.party-names.v1';
  const MAX = 20;
  const MAX_LENGTH = 16;

  function clean(name) {
    return typeof name === 'string' ? name.trim().slice(0, MAX_LENGTH) : '';
  }

  function recent() {
    const saved = Store.load(KEY);
    const list = saved && Array.isArray(saved.recent) ? saved.recent : [];
    const out = [];
    const seen = new Set();
    for (const name of list) {
      const value = clean(name);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out.slice(0, MAX);
  }

  /**
   * Adds names, newest first. A name already on the list is **promoted**
   * rather than duplicated, so the people who play most often stay at the
   * top and the list does not need managing.
   */
  function remember(names) {
    const wanted = (Array.isArray(names) ? names : [names]).map(clean).filter(Boolean);
    if (!wanted.length) return recent();
    const merged = wanted.concat(recent());
    const out = [];
    const seen = new Set();
    for (const name of merged) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    const kept = out.slice(0, MAX);
    Store.save(KEY, { recent: kept });
    return kept;
  }

  function forget(name) {
    const key = clean(name).toLowerCase();
    const kept = recent().filter(n => n.toLowerCase() !== key);
    Store.save(KEY, { recent: kept });
    return kept;
  }

  return { recent, remember, forget, clean, MAX, MAX_LENGTH };
})();
