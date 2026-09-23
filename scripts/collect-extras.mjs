// Public game passes and badges for the game detail pages. Refreshing once an
// hour keeps the five-minute CCU build quick and avoids hammering Roblox.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = process.env.OUT_DIR || "_site";
const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");
const REFRESH_MS = 60 * 60 * 1000;
const games = JSON.parse(await readFile(new URL("./games.json", import.meta.url), "utf8"));
const output = path.join(OUT_DIR, "data", "extras.json");

async function getJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function previousData() {
  try {
    if (SITE_URL) return await getJson(`${SITE_URL}/data/extras.json?t=${Date.now()}`);
    return JSON.parse(await readFile(output, "utf8"));
  } catch { return { games: {} }; }
}

async function allPages(firstUrl, listKey, tokenKey, param) {
  const items = [];
  let token = "";
  const seen = new Set();
  for (let page = 0; page < 100; page++) {
    const url = new URL(firstUrl);
    if (token) url.searchParams.set(param, token);
    const result = await getJson(url);
    if (!Array.isArray(result[listKey])) throw new Error(`Missing ${listKey} in ${url}`);
    items.push(...result[listKey]);
    token = result[tokenKey] || "";
    if (!token) return items;
    if (seen.has(token)) throw new Error(`Repeated page token in ${url}`);
    seen.add(token);
  }
  throw new Error(`Too many pages for ${firstUrl}`);
}

async function thumbnails(kind, ids) {
  const urls = new Map();
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    const url = new URL(`https://thumbnails.roblox.com/v1/${kind}`);
    url.searchParams.set(kind === "game-passes" ? "gamePassIds" : "badgeIds", batch.join(","));
    url.searchParams.set("size", "150x150");
    url.searchParams.set("format", "Png");
    url.searchParams.set("isCircular", "false");
    const result = await getJson(url);
    for (const item of result.data || []) if (item.imageUrl) urls.set(String(item.targetId), item.imageUrl);
  }
  return urls;
}

async function collectGame(universeId) {
  const [passes, badges] = await Promise.all([
    allPages(`https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes?passView=Full&pageSize=100`, "gamePasses", "nextPageToken", "pageToken"),
    allPages(`https://badges.roblox.com/v1/universes/${universeId}/badges?limit=100&sortOrder=Desc`, "data", "nextPageCursor", "cursor"),
  ]);
  const [passIcons, badgeIcons] = await Promise.all([
    thumbnails("game-passes", passes.map(item => item.id)),
    thumbnails("badges/icons", badges.map(item => item.id)),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    passes: passes.map(item => ({
      id: item.id,
      name: item.displayName || item.name || "Untitled pass",
      price: Number.isFinite(item.price) ? item.price : null,
      isForSale: item.isForSale === true,
      created: item.created || null,
      updated: item.updated || null,
      iconUrl: passIcons.get(String(item.id)) || null,
    })).sort((a, b) => Number(b.isForSale) - Number(a.isForSale) || Date.parse(b.created || 0) - Date.parse(a.created || 0)),
    badges: badges.map(item => ({
      id: item.id,
      name: item.displayName || item.name || "Untitled badge",
      created: item.created || null,
      updated: item.updated || null,
      iconUrl: badgeIcons.get(String(item.id)) || null,
    })),
  };
}

const previous = await previousData();
const live = JSON.parse(await readFile(path.join(OUT_DIR, "data", "live.json"), "utf8"));
const ids = new Map((live.games || []).map(game => [game.slug, game.universeId]));
const result = { ok: true, generatedAt: new Date().toISOString(), games: {} };
for (const game of games) {
  const cached = previous.games?.[game.slug];
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < REFRESH_MS) {
    result.games[game.slug] = cached;
    continue;
  }
  try {
    const universeId = game.universeId || ids.get(game.slug);
    if (!universeId) throw new Error("Missing universe ID");
    result.games[game.slug] = await collectGame(universeId);
    console.log(`${game.slug}: ${result.games[game.slug].passes.length} passes, ${result.games[game.slug].badges.length} badges`);
  } catch (error) {
    console.warn(`${game.slug}: ${String(error)}`);
    result.games[game.slug] = cached || { error: true, passes: [], badges: [] };
  }
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result));
console.log(`Wrote ${output}`);
