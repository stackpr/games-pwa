/*
 * The setup screen the three word games share: pick a scoring mode, a player
 * count, a round length and some categories. Builds the controls, keeps them
 * in sync with a settings object, and hands the game back a callback when
 * anything changes.
 *
 *   const setup = PartySetup.create({
 *     el: { modeRow, countRow, secsRow, catGrid, catCount, all, none, begin },
 *     seconds: [45, 60, 90, 120],
 *     settings,                 // { mode, players, seconds, categories }
 *     onChange(settings) {}
 *   });
 *   setup.render();
 *
 * Model and controls only: the game owns the markup and decides when the
 * screen is shown. Every element is optional, because a service worker can
 * pair one release's markup with the next release's script — a missing
 * control warns and is skipped rather than taking the page down.
 * See CLAUDE.md.
 */
window.PartySetup = (function () {
  const DEFAULT_SECONDS = [45, 60, 90, 120];

  function shape(saved, seconds) {
    const s = saved || {};
    const allowed = seconds || DEFAULT_SECONDS;
    const cats = Vocab.known(s.categories);
    return {
      mode: Party.MODES.indexOf(s.mode) !== -1 ? s.mode : Party.MODES[0],
      players: Number.isInteger(s.players)
        ? Math.min(Party.MAX_PLAYERS, Math.max(Party.MIN_PLAYERS, s.players))
        : 4,
      seconds: allowed.indexOf(s.seconds) !== -1 ? s.seconds : allowed[1] || allowed[0],
      // No saved choice means every category, which is the setting a first
      // run wants: a full deck and nothing to read before playing.
      categories: cats.length ? cats : Vocab.categories()
    };
  }

  function create(opts) {
    const el = opts.el || {};
    const seconds = opts.seconds || DEFAULT_SECONDS;
    const settings = opts.settings;
    const changed = opts.onChange || function () {};
    const buttons = { mode: [], count: [], secs: [], cat: [] };

    function warn(name) {
      console.warn('Missing element for setup control ' + name);
    }

    function button(className, text, press) {
      const b = document.createElement('button');
      b.className = className;
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', press);
      return b;
    }

    function build() {
      if (el.modeRow) {
        for (const b of el.modeRow.querySelectorAll('.pick')) {
          buttons.mode.push(b);
          b.addEventListener('click', () => {
            settings.mode = b.dataset.mode;
            changed(settings);
            render();
          });
        }
      } else warn('modeRow');

      if (el.countRow) {
        for (let n = Party.MIN_PLAYERS; n <= Party.MAX_PLAYERS; n++) {
          const b = button('count', String(n), () => {
            settings.players = n;
            changed(settings);
            render();
          });
          b.dataset.count = String(n);
          buttons.count.push(b);
          el.countRow.append(b);
        }
      } else warn('countRow');

      if (el.secsRow) {
        for (const n of seconds) {
          const b = button('count', n + 's', () => {
            settings.seconds = n;
            changed(settings);
            render();
          });
          b.dataset.seconds = String(n);
          buttons.secs.push(b);
          el.secsRow.append(b);
        }
      } else warn('secsRow');

      if (el.catGrid) {
        for (const name of Vocab.categories()) {
          const b = button('cat', name, () => {
            const at = settings.categories.indexOf(name);
            if (at === -1) settings.categories.push(name);
            else settings.categories.splice(at, 1);
            changed(settings);
            render();
          });
          b.dataset.cat = name;
          b.title = name;
          buttons.cat.push(b);
          el.catGrid.append(b);
        }
      } else warn('catGrid');

      if (el.all) {
        el.all.addEventListener('click', () => {
          settings.categories = Vocab.categories();
          changed(settings);
          render();
        });
      }
      if (el.none) {
        el.none.addEventListener('click', () => {
          settings.categories = [];
          changed(settings);
          render();
        });
      }
    }

    function press(b, on) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function render() {
      for (const b of buttons.mode) press(b, b.dataset.mode === settings.mode);
      for (const b of buttons.count) press(b, Number(b.dataset.count) === settings.players);
      for (const b of buttons.secs) press(b, Number(b.dataset.seconds) === settings.seconds);
      for (const b of buttons.cat) {
        press(b, settings.categories.indexOf(b.dataset.cat) !== -1);
      }
      document.body.dataset.mode = settings.mode;

      const words = Vocab.pool(settings.categories).length;
      if (el.catCount) {
        el.catCount.textContent = settings.categories.length
          ? '· ' + settings.categories.length + ' picked, ' + words + ' words'
          : '· pick at least one';
      }
      // Nothing picked means no deck, so the only honest thing the start
      // button can do is refuse.
      if (el.begin) el.begin.disabled = words === 0;
    }

    build();
    return { render, settings };
  }

  return { create, shape, DEFAULT_SECONDS };
})();
