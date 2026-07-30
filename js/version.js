// Shows which service worker version is serving this page, so a deploy can
// be confirmed from the device itself. The version comes from the worker in
// control — not from this file — so it reports what is actually loaded.
(function () {
  const el = document.getElementById('app-version');
  if (!el || !('serviceWorker' in navigator)) return;

  const hadController = !!navigator.serviceWorker.controller;

  function askVersion(worker) {
    return new Promise(resolve => {
      if (!worker) return resolve(null);
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 1500);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        resolve(event.data);
      };
      worker.postMessage({ type: 'version' }, [channel.port2]);
    });
  }

  function show(version, superseded) {
    if (!version) return;
    el.textContent = superseded ? `${version} — reload to update` : version;
    el.hidden = false;
  }

  askVersion(navigator.serviceWorker.controller).then(v => show(v, false));

  // A worker taking over mid-session means a newer version activated while
  // this page was still running the previous files.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    askVersion(navigator.serviceWorker.controller).then(v => show(v, hadController));
  });
})();
