/*
 * Who is up, and who scores — shared by the three word games, which differ
 * in what the card shows and agree on everything else.
 *
 * Two modes, and they answer different questions about a party game:
 *
 *   teams  Two teams take turns. The whole team scores. Use the shared
 *          player colours, since there are exactly two sides.
 *   solo   Nobody is on a team. One player presents; the point goes to
 *          whoever actually got it AND to the presenter. The presenter
 *          walks one seat a round so everybody takes a turn.
 *
 * Solo mode names the guesser at the moment of scoring rather than fixing
 * them in advance, which is what makes the presenter's job a real one:
 * getting through to anybody scores, so there is no partner to specialise
 * with. It costs a tap per card, on a button already sized for a thumb.
 * See any of the games' _README.md.
 *
 * Model only: no DOM, no storage. Each game renders it and each game saves
 * it, because their setup screens differ.
 */
window.Party = (function () {
  const MODES = ['teams', 'solo'];
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

  /** A stored name, or the numbered fallback if it was left blank. */
  function nameAt(state, i) {
    const given = state.names && state.names[i];
    return typeof given === 'string' && given.trim()
      ? given.trim() : defaultName(state.mode, i);
  }

  function seatCount(mode, players) {
    return mode === 'teams' ? TEAMS : clamp(players, MIN_PLAYERS, MAX_PLAYERS);
  }

  /**
   * An unnamed seat holds an empty string, not "Player 3". The numbered
   * fallback is `nameAt`'s job, and keeping it out of the data is what lets
   * the setup screen tell a seat somebody named from one nobody has.
   */
  function blank(mode, players) {
    const m = MODES.indexOf(mode) !== -1 ? mode : MODES[0];
    const n = seatCount(m, players);
    return {
      mode: m,
      names: Array(n).fill(''),
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
        typeof (saved.names && saved.names[i]) === 'string' ? saved.names[i] : ''),
      scores: Array.from({ length: n }, (_, i) =>
        Number.isInteger(saved.scores && saved.scores[i]) ? saved.scores[i] : 0),
      round: Number.isInteger(saved.round) && saved.round >= 0 ? saved.round : 0
    };
  }

  /**
   * Who presents this round. The seat walks one along per round in both
   * modes — in teams that is the two teams alternating, in solo it is the
   * table taking turns.
   */
  function roles(state) {
    return { present: state.round % state.scores.length };
  }

  /** Seats that could collect a point: the presenter's team, or the table. */
  function scoring(state) {
    const r = roles(state);
    if (state.mode === 'teams') return [r.present];
    return state.scores.map((_, i) => i);
  }

  /** Seats a game should offer as "who got it" — everyone but the presenter. */
  function guessers(state) {
    if (state.mode === 'teams') return [];
    const present = roles(state).present;
    return state.scores.map((_, i) => i).filter(i => i !== present);
  }

  /**
   * Score a card. Teams: the presenting team takes it. Solo: the seat that
   * got it takes it and so does the presenter — which is why `seat` is
   * required there and ignored here.
   */
  function award(state, points, seat) {
    const present = roles(state).present;
    if (state.mode === 'teams') {
      state.scores[present] += points;
      return;
    }
    state.scores[present] += points;
    if (Number.isInteger(seat) && seat !== present && state.scores[seat] !== undefined) {
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
    blank, shape, roles, scoring, guessers, award, advance, leaders,
    defaultName, nameAt
  };
})();
