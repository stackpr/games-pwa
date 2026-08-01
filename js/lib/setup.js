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
      categories: cats.length ? cats : Vocab.categories(),
      // 'pick' is the default because it is the mode that costs no typing;
      // a first run finds it empty and is pushed to 'type' by render().
      nameMode: s.nameMode === 'type' ? 'type' : 'pick'
    };
  }

  function create(opts) {
    const el = opts.el || {};
    const seconds = opts.seconds || DEFAULT_SECONDS;
    const settings = opts.settings;
    const changed = opts.onChange || function () {};
    // The live seat names, owned by the game and edited here.
    const party = opts.party || { names: [] };
    const buttons = { mode: [], count: [], secs: [], cat: [], nameMode: [] };
    let inputs = [];

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

      if (el.nameModeRow) {
        for (const b of el.nameModeRow.querySelectorAll('.pick')) {
          buttons.nameMode.push(b);
          b.addEventListener('click', () => {
            settings.nameMode = b.dataset.nameMode;
            changed(settings);
            render();
          });
        }
      }

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

    function seatNames() {
      const names = opts.names ? opts.names() : party.names;
      return Array.isArray(names) ? names : [];
    }

    /** Text boxes, one per seat. Committed on every keystroke. */
    function buildInputs() {
      if (!el.nameInputs) return;
      const names = seatNames();
      if (inputs.length === settings.players) {
        for (let i = 0; i < inputs.length; i++) {
          if (inputs[i].value !== (names[i] || '')) inputs[i].value = names[i] || '';
        }
        return;
      }
      el.nameInputs.textContent = '';
      inputs = [];
      for (let i = 0; i < settings.players; i++) {
        const box = document.createElement('input');
        box.className = 'name-input';
        box.id = 'name-' + i;
        box.maxLength = Names.MAX_LENGTH;
        box.placeholder = Party.defaultName('solo', i);
        box.setAttribute('aria-label', 'Name for player ' + (i + 1));
        box.value = names[i] || '';
        box.addEventListener('input', () => {
          seatNames()[i] = box.value;
          changed(settings);
        });
        // Remembered on the way out, not on every keystroke, or the list
        // fills up with every half-typed prefix of a name.
        box.addEventListener('change', () => {
          Names.remember(box.value);
          renderRecent();
        });
        inputs.push(box);
        el.nameInputs.append(box);
      }
    }

    /**
     * The recent list. Checking a name appends it to the seats, unchecking
     * removes it, and the player count follows — which is the whole point:
     * the table sets itself up by ticking who turned up.
     */
    function renderRecent() {
      if (!el.recentList) return;
      const names = seatNames();
      const chosen = new Set(names.map(n => String(n).trim().toLowerCase()).filter(Boolean));
      const list = Names.recent();
      el.recentList.textContent = '';
      if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'recent-empty';
        empty.textContent = 'Nobody yet — type some names and they will be here next time.';
        el.recentList.append(empty);
        return;
      }
      for (const name of list) {
        const b = document.createElement('button');
        b.className = 'recent';
        b.type = 'button';
        b.dataset.name = name;
        b.textContent = name;
        const on = chosen.has(name.toLowerCase());
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', () => toggleRecent(name));
        el.recentList.append(b);
      }
    }

    /**
     * Works off the seats that actually carry a name, so ticking somebody
     * fills the first blank seat rather than adding a seat beside it. The
     * unnamed seats are the padding that keeps the table at its minimum.
     */
    function toggleRecent(name) {
      const names = seatNames();
      const named = names.map(n => String(n).trim()).filter(Boolean);
      const at = named.findIndex(n => n.toLowerCase() === name.toLowerCase());
      if (at !== -1) named.splice(at, 1);
      else named.push(name);

      settings.players = Math.min(Party.MAX_PLAYERS,
        Math.max(Party.MIN_PLAYERS, named.length));
      names.length = 0;
      for (let i = 0; i < settings.players; i++) names.push(named[i] || '');
      changed(settings);
      render();
    }

    function render() {
      for (const b of buttons.mode) press(b, b.dataset.mode === settings.mode);
      for (const b of buttons.count) press(b, Number(b.dataset.count) === settings.players);
      for (const b of buttons.secs) press(b, Number(b.dataset.seconds) === settings.seconds);
      for (const b of buttons.cat) {
        press(b, settings.categories.indexOf(b.dataset.cat) !== -1);
      }
      document.body.dataset.mode = settings.mode;
      // An empty recent list has nothing to pick, so a first run is put in
      // the typing mode rather than shown an empty panel it cannot use.
      if (settings.nameMode === 'pick' && !Names.recent().length) settings.nameMode = 'type';
      document.body.dataset.nameMode = settings.nameMode;
      for (const b of buttons.nameMode) press(b, b.dataset.nameMode === settings.nameMode);
      buildInputs();
      renderRecent();

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
