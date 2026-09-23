// Scheduled data collector for the GitHub Pages version.
//
// Every run (GitHub Actions, roughly every 5 minutes):
//   1. loads the history saved by the previous run (from the live site),
//   2. reads current numbers from the official Roblox API,
//   3. appends one reading per game and drops anything older than 90 days,
//   4. writes data/live.json, data/history-{1d,7d,all}.json and data/raw.json
//      into OUT_DIR, which the workflow then publishes,
//   5. once an hour, posts the Discord digest if DISCORD_WEBHOOK_URL is set.
//
// Environment:
//   OUT_DIR              site folder to write into (default "_site")
//   SITE_URL             public URL of the site, used to fetch the previous raw.json
//                        (unset = look for OUT_DIR/data/raw.json, handy for local runs)
//   DISCORD_WEBHOOK_URL  optional, enables the hourly digest
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendDigest } from "./discord.mjs";

const OUT_DIR = process.env.OUT_DIR || "_site";
const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");
const RETENTION_DAYS = 90;
const DIGEST_EVERY_MS = 55 * 60 * 1000;

const here = path.dirname(fileURLToPath(import.meta.url));
const GAMES = JSON.parse(await readFile(path.join(here, "games.json"), "utf8"));
for (const game of GAMES) game.color ??= 65535; // default Discord embed colour (BGS blue)

/* ---------- Roblox ---------- */

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function tryJson(url) {
  try { return await getJson(url); } catch (error) { console.warn(String(error)); return null; }
}

async function resolveUniverse(placeId) {
  const data = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  if (!data.universeId) throw new Error(`No universe for place ${placeId}`);
  return String(data.universeId);
}

async function fetchLive(games) {
  const ids = games.map((g) => g.universeId).join(",");
  const [details, votes, icons, thumbs] = await Promise.all([
    getJson(`https://games.roblox.com/v1/games?universeIds=${ids}`),
    tryJson(`https://games.roblox.com/v1/games/votes?universeIds=${ids}`),
    tryJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&size=256x256&format=Png&isCircular=false&returnPolicy=PlaceHolder`),
    tryJson(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids}&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false`),
  ]);

  const detailsById = new Map((details.data || []).map((d) => [String(d.id), d]));
  const votesById = new Map(((votes && votes.data) || []).map((v) => [String(v.id), v]));
  const iconsById = new Map(((icons && icons.data) || []).filter((i) => i.imageUrl).map((i) => [String(i.targetId), i.imageUrl]));
  const thumbsById = new Map(((thumbs && thumbs.data) || []).map((i) => [String(i.universeId || i.targetId), (i.thumbnails || []).find((t) => t.imageUrl)?.imageUrl || i.imageUrl]).filter(([, url]) => url));

  const out = [];
  for (const game of games) {
    const detail = detailsById.get(game.universeId);
    if (!detail || typeof detail.playing !== "number") continue;
    const vote = votesById.get(game.universeId);
    out.push({
      ...game,
      liveName: detail.name ?? null,
      creator: detail.creator?.name ?? null,
      creatorId: detail.creator?.id ?? null,
      creatorType: detail.creator?.type ?? null,
      description: detail.description ?? null,
      createdAt: detail.created ?? null,
      updatedAt: detail.updated ?? null,
      playing: detail.playing,
      visits: detail.visits ?? null,
      favorites: detail.favoritedCount ?? null,
      upVotes: vote?.upVotes ?? null,
      downVotes: vote?.downVotes ?? null,
      iconUrl: iconsById.get(game.universeId) ?? null,
      thumbnailUrl: thumbsById.get(game.universeId) ?? null,
    });
  }
  if (out.length === 0) throw new Error("Roblox returned no data for the tracked games");
  return out;
}

/* ---------- previous state ---------- */

async function loadPrevious() {
  const empty = { v: 1, games: {}, universes: {}, meta: {} };

  if (SITE_URL) {
    const url = `${SITE_URL}/data/raw.json?t=${Date.now()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (response.status === 404) { console.log("No previous data on the site yet — starting fresh."); return empty; }
    // Anything else must stop the run: publishing on top of a failed read would wipe the history.
    if (!response.ok) throw new Error(`Could not read previous data (${response.status} for ${url})`);
    return { ...empty, ...(await response.json()) };
  }

  try {
    return { ...empty, ...JSON.parse(await readFile(path.join(OUT_DIR, "data", "raw.json"), "utf8")) };
  } catch {
    return empty;
  }
}

/* ---------- history maths ---------- */

const BUCKET_LADDER = [300, 900, 1800, 3600, 10800, 21600, 43200, 86400];
const TARGET_POINTS = 420;
const RANGES = {
  "1d": { seconds: 86400, bucket: 300 },
  "7d": { seconds: 604800, bucket: 1800 },
  all: { seconds: null, bucket: null },
};

function buildHistory(raw, rangeKey, nowSec) {
  const range = RANGES[rangeKey];
  const since = range.seconds === null ? null : nowSec - range.seconds;

  let bucket = range.bucket;
  if (bucket === null) {
    let first = nowSec;
    for (const points of Object.values(raw.games)) if (points.length) first = Math.min(first, points[0][0]);
    const span = Math.max(1, nowSec - first);
    bucket = BUCKET_LADDER.find((size) => span / size <= TARGET_POINTS) ?? BUCKET_LADDER[BUCKET_LADDER.length - 1];
  }

  const series = {};
  for (const [slug, points] of Object.entries(raw.games)) {
    const buckets = new Map();
    for (const [t, playing] of points) {
      if (since !== null && t < since) continue;
      const key = Math.floor(t / bucket) * bucket;
      const entry = buckets.get(key) || { sum: 0, count: 0, peak: 0 };
      entry.sum += playing; entry.count += 1; entry.peak = Math.max(entry.peak, playing);
      buckets.set(key, entry);
    }
    series[slug] = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, e]) => ({ t: new Date(key * 1000).toISOString(), playing: Math.round(e.sum / e.count), peak: e.peak }));
  }

  return {
    ok: true,
    range: rangeKey,
    bucketSeconds: bucket,
    since: since === null ? null : new Date(since * 1000).toISOString(),
    generatedAt: new Date(nowSec * 1000).toISOString(),
    series,
  };
}

function peaksFor(points, nowSec) {
  const within = (seconds) => points.filter(([t]) => t >= nowSec - seconds).map(([, v]) => v);
  const day = within(86400), week = within(604800);
  const max = (list) => (list.length ? Math.max(...list) : null);
  return {
    peak24h: max(day),
    peak7d: max(week),
    peakAllTime: max(points.map(([, v]) => v)),
    average24h: day.length ? Math.round(day.reduce((a, b) => a + b, 0) / day.length) : null,
    low24h: day.length ? Math.min(...day) : null,
    samples: points.length,
    trackingSince: points.length ? new Date(points[0][0] * 1000).toISOString() : null,
  };
}

/* ---------- main ---------- */

const raw = await loadPrevious();
const nowSec = Math.floor(Date.now() / 1000);

// Universe IDs are looked up once and remembered in raw.json.
const games = [];
for (const seed of GAMES) {
  const universeId = seed.universeId || raw.universes[seed.slug] || (await resolveUniverse(seed.placeId));
  raw.universes[seed.slug] = universeId;
  games.push({ ...seed, universeId });
}

const live = await fetchLive(games);

// Append this run's reading. A second run within a minute (e.g. a push right
// after a scheduled run) replaces the last point instead of doubling it.
for (const game of live) {
  const points = (raw.games[game.slug] ||= []);
  const last = points[points.length - 1];
  if (last && nowSec - last[0] < 60) points[points.length - 1] = [nowSec, game.playing];
  else points.push([nowSec, game.playing]);
}
const cutoff = nowSec - RETENTION_DAYS * 86400;
for (const slug of Object.keys(raw.games)) raw.games[slug] = raw.games[slug].filter(([t]) => t >= cutoff);

const total = live.reduce((sum, g) => sum + g.playing, 0);
const payloadGames = live.map((game) => {
  const votes = (game.upVotes ?? 0) + (game.downVotes ?? 0);
  return {
    slug: game.slug, universeId: game.universeId, placeId: game.placeId, name: game.name,
    liveName: game.liveName, creator: game.creator, creatorId: game.creatorId, creatorType: game.creatorType,
    createdAt: game.createdAt, updatedAt: game.updatedAt, playing: game.playing,
    visits: game.visits, favorites: game.favorites, upVotes: game.upVotes, downVotes: game.downVotes,
    iconUrl: game.iconUrl, thumbnailUrl: game.thumbnailUrl, description: game.description,
    ratingPercent: votes > 0 ? Math.round(((game.upVotes ?? 0) / votes) * 100) : null,
    sharePercent: total > 0 ? Math.round((game.playing / total) * 1000) / 10 : 0,
    ...peaksFor(raw.games[game.slug] || [], nowSec),
    stale: false,
    measuredAt: new Date(nowSec * 1000).toISOString(),
  };
});
const ranked = [...payloadGames].sort((a, b) => b.playing - a.playing);

const livePayload = {
  ok: true, source: "roblox", warning: null,
  fetchedAt: new Date(nowSec * 1000).toISOString(),
  totalPlaying: total,
  games: payloadGames,
  leaderSlug: ranked[0]?.slug ?? null,
  delta: ranked.length > 1 ? ranked[0].playing - ranked[1].playing : 0,
};

const history = Object.fromEntries(Object.keys(RANGES).map((key) => [key, buildHistory(raw, key, nowSec)]));

/* ---------- Discord (once an hour) ---------- */

const webhook = (process.env.DISCORD_WEBHOOK_URL || "").trim();
if (webhook) {
  const last = raw.meta.lastDigestAt ? Date.parse(raw.meta.lastDigestAt) : 0;
  if (Date.now() - last >= DIGEST_EVERY_MS) {
    try {
      await sendDigest({ webhook, live: payloadGames, raw, history1d: history["1d"], siteUrl: SITE_URL, games });
      raw.meta.lastDigestAt = new Date().toISOString();
      console.log("Discord digest sent.");
    } catch (error) {
      console.error("Discord digest failed:", error);
    }
  }
}

/* ---------- write ---------- */

const dataDir = path.join(OUT_DIR, "data");
await mkdir(dataDir, { recursive: true });
const write = (name, value) => writeFile(path.join(dataDir, name), JSON.stringify(value));
await Promise.all([
  write("live.json", livePayload),
  write("history-1d.json", history["1d"]),
  write("history-7d.json", history["7d"]),
  write("history-all.json", history.all),
  write("raw.json", raw),
]);

console.log(`Stored ${live.length} reading(s); ${Object.values(raw.games).reduce((n, p) => n + p.length, 0)} points in history.`);
