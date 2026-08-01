const { defineConfig, devices } = require('@playwright/test');

// The site is served from the repo root (one level up from this folder) by
// the same plain static server used for local dev. Service workers need
// http(s), so file:// is not an option.
const PORT = Number(process.env.PORT || 8080);
const baseURL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './specs',
  // Service-worker and localStorage state is per-context, so specs are
  // independent and safe to run in parallel.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Chromium only: the PWA behaviour under test (service worker, install
    // prompt) is Chromium-specific, and it is what ships on Pages.
    ...devices['Pixel 7'],
  },

  projects: [
    // The phone is the device this site is for, so it runs everything.
    { name: 'mobile-portrait', use: { ...devices['Pixel 7'] } },
    // Desktop runs everything too, minus the blocks tagged `@nodom` — the
    // ones that never render anything, so a second viewport is running the
    // identical work twice. Nothing that touches the page is skipped here;
    // `tagging.spec.js` is what enforces that. See "The two projects" in
    // README.md.
    {
      name: 'desktop',
      grepInvert: /@nodom/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],

  // Starts the dev server for the run and shuts it down afterwards. Reuses
  // an already-running server locally so `python3 -m http.server 8080` in
  // another terminal still works.
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    cwd: '..',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
