// app.json holds the real config. The web preview (hosted under /preview on the website) needs a base URL;
// native builds don't set EXPO_BASE_URL, so they're unaffected.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
