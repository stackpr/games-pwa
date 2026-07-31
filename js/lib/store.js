/*
 * The localStorage wrapper every game shares. Storage throws in more cases
 * than people expect — Safari private mode, a full quota, a user who has
 * blocked site data — and a game that dies on a failed read is worse than
 * one that starts fresh, so both calls swallow and warn.
 *
 * Validation stays in the games: each one knows what its own shape should be,
 * and load() only promises "parsed JSON, or null".
 */
window.Store = (function () {
  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('Could not load ' + key + ':', err);
      return null;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('Could not save ' + key + ':', err);
      return false;
    }
  }

  return { load, save };
})();
