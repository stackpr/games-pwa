/*
 * "Install this app" prompt handling. Everything here is client-side —
 * no server involvement.
 *
 * Strategy:
 * - Already running installed (standalone display mode)? Show nothing.
 * - Chromium browsers fire `beforeinstallprompt`: capture it, show our own
 *   banner with an Install button, and call prompt() on click.
 * - iOS Safari never fires that event: detect iOS and show manual
 *   "Share -> Add to Home Screen" instructions instead.
 * - Dismissals are remembered in localStorage and respected for 14 days.
 * - `appinstalled` hides the banner permanently.
 */
(function () {
  const DISMISS_KEY = 'games.installBanner.dismissedAt';
  const INSTALLED_KEY = 'games.installBanner.installed';
  const DISMISS_DAYS = 14;

  const banner = document.getElementById('install-banner');
  const installBtn = document.getElementById('install-button');
  const dismissBtn = document.getElementById('install-dismiss');
  const detail = document.getElementById('install-banner-detail');
  const iosHelp = document.getElementById('ios-install-help');
  if (!banner) return;

  let deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true; // iOS Safari
  }

  function isIOS() {
    const ua = window.navigator.userAgent;
    const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/.test(ua) || iPadOS;
  }

  function recentlyDismissed() {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at && (Date.now() - at) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  }

  function hideAll() {
    banner.hidden = true;
    iosHelp.hidden = true;
  }

  if (isStandalone() || localStorage.getItem(INSTALLED_KEY) || recentlyDismissed()) {
    return; // nothing to prompt
  }

  dismissBtn.addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    hideAll();
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem(INSTALLED_KEY, '1');
    hideAll();
  });

  // Chromium path: our own button drives the captured native prompt.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.hidden = false;
    banner.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (choice.outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, '1');
    }
    hideAll();
  });

  // iOS path: no beforeinstallprompt, so show manual instructions.
  if (isIOS()) {
    detail.textContent = 'Add it to your home screen for quick, full-screen, offline use.';
    banner.hidden = false;
    iosHelp.hidden = false;
  }
})();
