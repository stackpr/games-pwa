/*
 * Shared overlay dialog: scrim, fade, and the bits that are easy to forget —
 * closing on the scrim but not the panel, closing on Escape, and moving
 * focus in and back out so a keyboard user is never stranded behind it.
 *
 * Pair with css/modal.css. Markup:
 *
 *   <div class="modal" id="x">
 *     <div class="modal-panel" role="dialog" aria-modal="true"
 *          aria-labelledby="x-title"> … <button data-close>Close</button>
 *     </div>
 *   </div>
 *
 * Every lookup is null-tolerant on purpose: a service worker can serve a
 * page's markup from one release and its script from the next, and a missing
 * dialog must not take the game down with it. See CLAUDE.md.
 */
window.Modal = (function () {
  function create(el, opts) {
    const options = opts || {};
    const trigger = options.trigger || null;
    let returnFocus = null;

    function isOpen() {
      return Boolean(el && el.hasAttribute('data-open'));
    }

    function open() {
      if (!el || isOpen()) return;
      returnFocus = document.activeElement;
      el.dataset.open = '';
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      // Land focus inside the dialog rather than leaving it behind the scrim.
      const panel = el.querySelector('.modal-panel');
      const first = el.querySelector(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
      else if (panel) panel.focus();
      if (options.onOpen) options.onOpen();
    }

    function close() {
      if (!el || !isOpen()) return;
      delete el.dataset.open;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      const back = trigger || returnFocus;
      if (back && back.focus) back.focus();
      if (options.onClose) options.onClose();
    }

    function toggle() {
      if (isOpen()) close();
      else open();
    }

    if (el) {
      // The scrim closes; the panel sitting on top of it does not.
      el.addEventListener('click', event => {
        if (event.target === el) close();
      });
      for (const btn of el.querySelectorAll('[data-close]')) {
        btn.addEventListener('click', close);
      }
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isOpen()) {
          close();
          event.preventDefault();
        }
      });
    }

    if (trigger) trigger.addEventListener('click', toggle);

    return { open, close, toggle, isOpen };
  }

  return { create };
})();
