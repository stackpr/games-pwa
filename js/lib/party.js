/*
 * Who is up, and who scores — shared by the three word games, which differ
 * in what the card shows and agree on everything else.
 *
 * Two modes, and they answer different questions about a party game:
 *
 *   teams  Two teams take turns. The whole team scores. Use the shared
 *          player colours, since there are exactly two sides.
 *   pairs  Every round pairs one presenter with one guesser, and BOTH score
 *          the point. Nobody is on a team; the rotation makes sure everyone
 *          presents the same number of times.
 *
 * Pairs deliberately fixes the guesser rather than awarding the point to
 * whoever shouted first. Tracking that means tapping a name for every card,
 * mid-timer, with the room yelling — which is exactly the moment a game
 * cannot ask for input. Fixing the pair keeps the whole round to one tap
 * per card. See any of the games' _README.md.
 *
 * Model only: no DOM, no storage. Each game renders it and each game saves
 * it, because their setup screens differ.
 */
window.Party = (function () {
  const MODES = ['teams', 'pairs'];
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 10;
  const TEAMS = 2;

  function clamp(n, lo, hi) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }

  function defaultName(mode, i) {
    return mode === 'teams' ? 'Team ' + (i + 1) : 'Player ' + (i + 1);
  }

  function seatCount(mode, players) {
    return mode === 'teams' ? TEAMS : clamp(players, MIN_PLAYERS, MAX_PLAYERS);
  }

  function blank(mode, players) {
    const m = MODES.indexOf(mode) !== -1 ? mode : MODES[0];
    const n = seatCount(m, players);
    return {
      mode: m,
      names: Array.from({ length: n }, (_, i) => defaultName(m, i)),
      scores: Array(n).fill(0),
      round: 0
    };
  }

  /** A saved game, trusted only as far as it type-checks. */
  function shape(saved) {
    if (!saved) return blank(MODES[0]);
    const mode = MODES.indexOf(saved.mode) !== -1 ? saved.mode : MODES[0];
    const n = seatCount(mode, Array.isArray(saved.scores) ? saved.scores.length : 0);
    return {
      mode,
      names: Array.from({ length: n }, (_, i) =>
        typeof (saved.names && saved.names[i]) === 'string' && saved.names[i]
          ? saved.names[i] : defaultName(mode, i)),
      scores: Array.from({ length: n }, (_, i) =>
        Number.isInteger(saved.scores && saved.scores[i]) ? saved.scores[i] : 0),
      round: Number.isInteger(saved.round) && saved.round >= 0 ? saved.round : 0
    };
  }

  /**
   * Who presents and who guesses this round.
   *
   * Teams: one seat presents and the same seat scores; `guess` is null
   * because the rest of that team are all guessing.
   *
   * Pairs: the presenter walks the list a seat per round. The guesser sits
   * one further along, and slides an extra seat every full lap — so over
   * n-1 laps every player presents to every other player exactly once,
   * rather than the same two people pairing up forever.
   */
  function roles(state) {
    const n = state.scores.length;
    if (state.mode === 'teams') {
      return { present: state.round % n, guess: null };
    }
    const lap = Math.floor(state.round / n);
    const present = state.round % n;
    const guess = (present + 1 + lap) % n;
    return { present, guess: guess === present ? (present + 1) % n : guess };
  }

  /** Seats that collect a point this round. */
  function scoring(state) {
    const r = roles(state);
    return r.guess === null ? [r.present] : [r.present, r.guess];
  }

  function award(state, points) {
    for (const seat of scoring(state)) {
      state.scores[seat] += points;
    }
  }

  function advance(state) {
    state.round += 1;
  }

  /** Highest score; a tie returns every seat that shares it. */
  function leaders(state) {
    const best = Math.max(...state.scores);
    const at = [];
    for (let i = 0; i < state.scores.length; i++) {
      if (state.scores[i] === best) at.push(i);
    }
    return { best, seats: at, tied: at.length > 1 };
  }

  return {
    MODES, MIN_PLAYERS, MAX_PLAYERS, TEAMS,
    blank, shape, roles, scoring, award, advance, leaders, defaultName
  };
})();
