// Used on GitHub Pages: the pages read the static files that the scheduled
// workflow (scripts/collect.mjs) writes next to them, instead of Netlify functions.
// The ?t= keeps the browser and the CDN from serving an older copy.
window.TRACKER_CONFIG = {
  live: () => (window.SITE_ROOT || "") + "data/live.json?t=" + Date.now(),
  history: (range) => (window.SITE_ROOT || "") + "data/history-" + range + ".json?t=" + Date.now(),
  groupsLive: () => (window.SITE_ROOT || "") + "data/group-live.json?t=" + Date.now(),
  groupsHistory: (range) => (window.SITE_ROOT || "") + "data/group-history-" + range + ".json?t=" + Date.now(),
};
