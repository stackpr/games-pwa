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
    // Desktop runs only what a wider window can actually change: anything
    // that measures the page. Rules, scoring and persistence read the same
    // DOM at any width, and running them twice cost about half the suite's
    // wall clock for no signal. `tagging.spec.js` keeps the tag honest —
    // see "The two projects" in README.md.
    {
      name: 'desktop',
      grep: /@layout/,
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
