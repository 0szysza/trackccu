// Where the pages load their data from.
//
// Default: the Netlify functions (/api/live and /api/history).
// The GitHub Pages workflow overwrites this file in the published site so the
// same pages read the static data/*.json files instead — see README.md.
window.TRACKER_CONFIG = {
  live: () => "/api/live",
  history: (range) => "/api/history?range=" + range,
  groupsLive: () => (window.SITE_ROOT || "") + "data/group-live.json?t=" + Date.now(),
  groupsHistory: (range) => (window.SITE_ROOT || "") + "data/group-history-" + range + ".json?t=" + Date.now(),
};
