const config = structuredClone(require('./lighthouserc.cjs'));
config.ci.collect.settings.preset = 'desktop';
config.ci.upload.outputDir = './lighthouse-results-desktop';

module.exports = config;
