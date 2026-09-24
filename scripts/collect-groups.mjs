// Public Roblox group data for the GitHub Pages build. History starts when a
// group is first tracked; visits and favorites include its public experiences.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || "_site";
const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");
const GROUPS = JSON.parse(await readFile(path.join(here, "groups.json"), "utf8"));
const GAMES = JSON.parse(await readFile(path.join(here, "games.json"), "utf8"));
const DAY = 86400;
const RETENTION_DAYS = 90;
const LADDER = [300, 900, 1800, 3600, 10800, 21600, 43200, 86400];
const RANGES = { "1d": [DAY, 300], "7d": [7 * DAY, 1800], all: [null, null] };

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: "application/json" } });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
}

async function groupGames(id) {
  const games = [];
  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ accessFilter: "2", limit: "50", sortOrder: "Asc" });
    if (cursor) params.set("cursor", cursor);
    const response = await getJson(`https://games.roblox.com/v2/groups/${id}/gamesV2?${params}`);
    games.push(...(response.data || []));
    cursor = response.nextPageCursor;
    if (!cursor) return games;
    if (seen.has(cursor)) throw new Error(`Repeated game cursor for group ${id}`);
    seen.add(cursor);
  }
  throw new Error(`Too many game pages for group ${id}`);
}

async function previousRaw() {
  const empty = { v: 1, groups: {} };
  if (SITE_URL) {
    const url = `${SITE_URL}/data/group-raw.json?t=${Date.now()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (response.status === 404) return empty;
    if (!response.ok) throw new Error(`Could not read previous group history: HTTP ${response.status}`);
    return { ...empty, ...(await response.json()) };
  }
  try { return { ...empty, ...JSON.parse(await readFile(path.join(OUT_DIR, "data", "group-raw.json"), "utf8")) }; }
  catch { return empty; }
}

function history(raw, range, now) {
  const [seconds, fixedBucket] = RANGES[range];
  const since = seconds === null ? null : now - seconds;
  let bucket = fixedBucket;
  if (!bucket) {
    let first = now;
    for (const points of Object.values(raw.groups)) if (points.length) first = Math.min(first, points[0][0]);
    bucket = LADDER.find((size) => (now - first) / size <= 420) ?? LADDER.at(-1);
  }
  const series = {};
  for (const [id, points] of Object.entries(raw.groups)) {
    const buckets = new Map();
    for (const [t, members, totalVisits, totalFavorites] of points) {
      if (since !== null && t < since) continue;
      const key = Math.floor(t / bucket) * bucket;
      const entry = buckets.get(key) || { members: 0, visits: 0, favorites: 0, count: 0 };
      entry.members += members;
      entry.visits += totalVisits;
      entry.favorites += totalFavorites;
      entry.count++;
      buckets.set(key, entry);
    }
    series[id] = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, value]) => ({
      t: new Date(t * 1000).toISOString(),
      members: Math.round(value.members / value.count),
      totalVisits: Math.round(value.visits / value.count),
      totalFavorites: Math.round(value.favorites / value.count),
    }));
  }
  return { ok: true, range, bucketSeconds: bucket, generatedAt: new Date(now * 1000).toISOString(), series };
}

const raw = await previousRaw();
raw.groups ||= {};
const now = Math.floor(Date.now() / 1000);
const ids = GROUPS.map((group) => group.id).join(",");
const [batch, icons, ...details] = await Promise.all([
  getJson(`https://groups.roblox.com/v2/groups?groupIds=${ids}`),
  getJson(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${ids}&size=420x420&format=Png&isCircular=false`),
  ...GROUPS.map((group) => getJson(`https://groups.roblox.com/v1/groups/${group.id}`)),
]);
const batchById = new Map((batch.data || []).map((group) => [String(group.id), group]));
const iconById = new Map((icons.data || []).map((icon) => [String(icon.targetId), icon.imageUrl || null]));
const publicGames = new Map(await Promise.all(GROUPS.map(async (group) => [String(group.id), await groupGames(group.id)])));
const universeIds = [...new Set([...publicGames.values()].flatMap((games) => games.map((game) => String(game.id))))];
const gameDetails = new Map();
for (let i = 0; i < universeIds.length; i += 50) {
  const response = await getJson(`https://games.roblox.com/v1/games?universeIds=${universeIds.slice(i, i + 50).join(",")}`);
  for (const game of response.data || []) gameDetails.set(String(game.id), game);
}

const liveGroups = GROUPS.map((seed, index) => {
  const id = String(seed.id);
  const info = details[index];
  const created = batchById.get(id);
  if (!created || !Number.isFinite(info.memberCount)) throw new Error(`Incomplete Roblox data for group ${id}`);
  const games = publicGames.get(id) || [];
  const totalVisits = games.reduce((sum, game) => sum + (gameDetails.get(String(game.id))?.visits ?? game.placeVisits ?? 0), 0);
  const totalFavorites = games.reduce((sum, game) => sum + (gameDetails.get(String(game.id))?.favoritedCount ?? 0), 0);
  const points = (raw.groups[id] ||= []);
  const sample = [now, info.memberCount, totalVisits, totalFavorites];
  if (points.length && now - points.at(-1)[0] < 60) points[points.length - 1] = sample;
  else points.push(sample);
  const ownerId = info.owner?.userId ?? created.owner?.id ?? null;
  return {
    id, name: info.name || created.name || seed.name,
    description: info.description || created.description || "",
    createdAt: created.created || null,
    owner: ownerId ? { id: ownerId, name: info.owner?.displayName || info.owner?.username || String(ownerId), username: info.owner?.username || null, hasVerifiedBadge: info.owner?.hasVerifiedBadge === true } : null,
    members: info.memberCount, totalVisits, totalFavorites,
    hasVerifiedBadge: info.hasVerifiedBadge === true,
    iconUrl: iconById.get(id) || null,
    trackingSince: new Date(points[0][0] * 1000).toISOString(),
    gameSlugs: GAMES.filter((game) => String(game.ownerUrl || "").includes(`/communities/${id}/`)).map((game) => game.slug),
    measuredAt: new Date(now * 1000).toISOString(),
  };
});

const cutoff = now - RETENTION_DAYS * DAY;
for (const id of Object.keys(raw.groups)) raw.groups[id] = raw.groups[id].filter(([time]) => time >= cutoff);
const dataDir = path.join(OUT_DIR, "data");
await mkdir(dataDir, { recursive: true });
await Promise.all([
  writeFile(path.join(dataDir, "group-raw.json"), JSON.stringify(raw)),
  writeFile(path.join(dataDir, "group-live.json"), JSON.stringify({ ok: true, source: "roblox", fetchedAt: new Date(now * 1000).toISOString(), groups: liveGroups })),
  ...Object.keys(RANGES).map((range) => writeFile(path.join(dataDir, `group-history-${range}.json`), JSON.stringify(history(raw, range, now)))),
]);
console.log(`Stored ${liveGroups.length} groups and ${Object.values(raw.groups).reduce((sum, points) => sum + points.length, 0)} group history points.`);
