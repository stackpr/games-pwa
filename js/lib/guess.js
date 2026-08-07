/*
 * The guessing panel the party games share: the buttons a card is scored
 * with, and the board it is scored onto.
 *
 *   const panel = GuessPanel.create({
 *     el: { whoGrid, board, tally },
 *     onScore(points, seat) {}      // seat is null in teams mode
 *   });
 *   panel.render({ mode: 'teams', names, scores, present: 0, tally: 3 });
 *
 * Two modes, and they are the same two everywhere on the site:
 *
 *   teams  One side is up. There is one place a point can go, so the
 *          action row is Skip and Got it.
 *   solo   Nobody is on a team. The action row becomes one button per
 *          player — everybody except whoever is presenting — because the
 *          point belongs to the seat that is named at that moment.
 *
 * `css/party.css` does the swapping, keyed on `body[data-mode]`, which this
 * sets. The game keeps the state and does the scoring; this owns what the
 * two modes look like, which is the part four games were carrying four
 * identical copies of.
 *
 * Every element is optional: a service worker can pair one release's markup
 * with the next release's script, so a missing node costs its control and
 * not the page. See CLAUDE.md.
 */
window.GuessPanel = (function () {
  /**
   * Board rows carry `data-seat` so the two player colours can reach them —
   * but only when there are exactly two sides to colour. Two tokens mean two
   * sides, so a three-team game is marked by weight instead and this returns
   * nothing at all. See Player colors in CLAUDE.md.
   */
  function token(view, i) {
    return view.mode === 'teams' && view.names.length === 2 ? String(i + 1) : '';
  }

  function create(opts) {
    const el = (opts && opts.el) || {};
    const scored = (opts && opts.onScore) || function () {};
    let view = { mode: 'teams', names: [], scores: [], present: 0 };

    function buildWho() {
      if (!el.whoGrid) return;
      el.whoGrid.textContent = '';
      if (view.mode === 'teams') return;
      for (let seat = 0; seat < view.names.length; seat++) {
        if (seat === view.present) continue;
        const name = view.names[seat];
        const b = document.createElement('button');
        b.className = 'who-btn';
        b.type = 'button';
        b.dataset.seat = String(seat);
        b.textContent = name;
        b.setAttribute('aria-label', name + ' got it');
        b.addEventListener('click', () => scored(1, seat));
        el.whoGrid.append(b);
      }
    }

    function buildBoard() {
      if (!el.board) return;
      el.board.textContent = '';
      for (let i = 0; i < view.scores.length; i++) {
        const li = document.createElement('li');
        li.dataset.seat = token(view, i);
        if (isUp(i)) li.dataset.up = '';
        const name = document.createElement('span');
        name.className = 'board-name';
        name.textContent = view.names[i];
        const score = document.createElement('span');
        score.className = 'board-score';
        score.textContent = String(view.scores[i]);
        li.append(name, score);
        el.board.append(li);
      }
    }

    /** Seats that could take a point from the card on screen. */
    function isUp(i) {
      if (Array.isArray(view.up)) return view.up.indexOf(i) !== -1;
      return view.mode === 'teams' ? i === view.present : true;
    }

    function render(next) {
      view = Object.assign({}, view, next || {});
      view.names = (view.names || []).map((n, i) => n || 'Player ' + (i + 1));
      view.scores = view.scores || [];
      document.body.dataset.mode = view.mode;
      if (el.tally && typeof view.tally === 'number') {
        el.tally.textContent = String(view.tally);
      }
      buildWho();
      buildBoard();
    }

    // Teams mode scores through the action row; both modes skip through
    // one. A skip is a score of nothing, so it goes the same way out.
    if (el.got) el.got.addEventListener('click', () => scored(1, null));
    if (el.skip) el.skip.addEventListener('click', () => scored(0, null));
    if (el.whoSkip) el.whoSkip.addEventListener('click', () => scored(0, null));

    return { render, seatToken: i => token(view, i) };
  }

  return { create };
})();
