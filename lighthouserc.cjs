module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npx serve site -l 4173',
      url: ['http://127.0.0.1:4173/'],
      numberOfRuns: 3,
      settings: { chromeFlags: '--no-sandbox --headless' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'color-contrast': 'error',
        'link-name': 'error',
        'heading-order': 'error',
        'html-has-lang': 'error',
        'document-title': 'error',
        'resource-summary:total:size': ['error', { maxNumericValue: 500000 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './lighthouse-results' },
  },
};
