const baseUrl = process.env.PORTFOLIO_LHCI_BASE_URL ?? 'http://127.0.0.1:4173';
// /reproduce/ is an external Experiments redirect, covered by routing checks.
// Qualify only the UI served by this exact Portfolio source/bundle.
const routes = ['/', '/about/', '/atlas/', '/research/'];

module.exports = {
  ci: {
    collect: {
      url: routes.map((route) => new URL(route, baseUrl).href),
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --headless --use-angle=swiftshader --enable-unsafe-swiftshader --disable-webgpu',
        // Lighthouse enlarges the viewport to document height for this report
        // image, which also reallocates the live native-DPR canvas. Dedicated
        // visual audits own screenshot evidence without changing this profile.
        disableFullPageScreenshot: true,
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        'color-contrast': 'error',
        'link-name': 'error',
        'heading-order': 'error',
        'html-has-lang': 'error',
        'document-title': 'error',
      },
    },
    upload: { target: 'filesystem', outputDir: './lighthouse-results' },
  },
};
