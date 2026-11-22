// Game events are checked on every build so short events reach the Past archive.
// Passes, developer products and badges are refreshed hourly to keep the five-minute build quick.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { previousJson, validateExtras, requestJson, writeJson } from "./data-store.mjs";

export function trackPrices(items, previousItems, observedAt) {
  const previousById = new Map((previousItems || []).map(item => [String(item.id), item]));
  items = items.filter(item => !item.unavailable);
  const currentIds = new Set(items.map(item => String(item.id)));
  const current = items.map(item => {
    const previous = previousById.get(String(item.id));
    const priceHistory = Array.isArray(previous?.priceHistory)
      ? previous.priceHistory.filter(point => Number.isFinite(Date.parse(point?.t)) && (point.price === null || Number.isFinite(point.price))).map(point => ({ ...point }))
      : [];
    const price = item.isForSale && Number.isFinite(item.price) ? item.price : null;
    if (!priceHistory.length || priceHistory.at(-1).price !== price) priceHistory.push({ t: observedAt, price });
    return { ...item, unavailable: false, lastSeenAt: observedAt, priceHistory, priceLastObservedAt: observedAt };
  });
  const absent = (previousItems || []).filter(item => !currentIds.has(String(item.id))).map(item => ({ ...item, unavailable: true }));
  return [...current, ...absent];
}

export async function collectExtras({ outDir = process.env.OUT_DIR || '_site', siteUrl = process.env.SITE_URL || '', stateDir = process.env.STATE_DATA_DIR, fetchImpl = fetch, catalog, archives, bootstrap } = {}) {
const OUT_DIR = outDir, SITE_URL = siteUrl;
const REFRESH_MS = 60 * 60 * 1000;
const games = catalog || JSON.parse(await readFile(new URL('./games.json', import.meta.url), 'utf8'));
const eventArchive = archives || JSON.parse(await readFile(new URL('./events-archive.json', import.meta.url), 'utf8'));
const output = path.join(OUT_DIR, 'data', 'extras.json');

async function getJson(url) {
  return requestJson(url, { fetchImpl });
}

async function previousData() {
  return previousJson("extras.json", { outDir: OUT_DIR, siteUrl: SITE_URL, stateDir, fetchImpl, bootstrap, validate: validateExtras, empty: { games: {} } });
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
    url.searchParams.set(kind === "game-passes" ? "gamePassIds" : kind === "developer-products/icons" ? "developerProductIds" : kind === "assets" ? "assetIds" : "badgeIds", batch.join(","));
    url.searchParams.set("size", kind === "assets" ? "768x432" : "150x150");
    url.searchParams.set("format", "Png");
    url.searchParams.set("isCircular", "false");
    const result = await getJson(url);
    for (const item of result.data || []) if (item.imageUrl) urls.set(String(item.targetId), item.imageUrl);
  }
  return urls;
}

async function collectEvents(universeId, cachedEvents = [], archivedEvents = []) {
  const items = [];
  let cursor = "";
  const seen = new Set();
  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://apis.roblox.com/virtual-events/v1/universes/${universeId}/virtual-events`);
    if (cursor) url.searchParams.set("cursor", cursor);
    url.searchParams.set("t", Date.now());
    const result = await getJson(url, true);
    if (!Array.isArray(result.data)) throw new Error(`Missing events in ${url}`);
    items.push(...result.data.filter(item => item.eventVisibility === "public"));
    cursor = result.nextPageCursor || "";
    if (!cursor) break;
    if (seen.has(cursor)) throw new Error(`Repeated event cursor for universe ${universeId}`);
    seen.add(cursor);
    if (page === 99) throw new Error(`Too many event pages for universe ${universeId}`);
  }
  const events = new Map([...archivedEvents, ...cachedEvents].map(item => [item.id, item]));
  for (const item of items) {
    const thumbnail = [...(item.thumbnails || [])].sort((a, b) => a.rank - b.rank)[0];
    const previous = events.get(String(item.id));
    const event = {
      id: String(item.id),
      name: item.displayTitle || item.title || "Untitled event",
      description: item.displayDescription || item.description || "",
      subtitle: item.displaySubtitle || item.subtitle || "",
      category: [...(item.eventCategories || [])].sort((a, b) => a.rank - b.rank)[0]?.category || null,
      start: item.eventTime?.startUtc || null,
      end: item.eventTime?.endUtc || null,
      thumbnailAssetId: thumbnail?.mediaId || null,
      thumbnailUrl: previous && previous.thumbnailAssetId === (thumbnail?.mediaId || null) ? previous.thumbnailUrl : null,
      interestedCount: Number.isFinite(previous?.interestedCount) ? previous.interestedCount : null,
    };
    if (Number.isFinite(Date.parse(event.start)) && Number.isFinite(Date.parse(event.end))) events.set(event.id, event);
  }
  const mediaIds = [...new Set([...events.values()].filter(item => !item.thumbnailUrl).map(item => item.thumbnailAssetId).filter(Boolean))];
  let images = new Map();
  try { images = await thumbnails("assets", mediaIds); }
  catch (error) { console.warn(`Event thumbnails for ${universeId}: ${String(error)}`); }
  const normalized = [...events.values()].map(item => ({ ...item, thumbnailUrl: images.get(String(item.thumbnailAssetId)) || item.thumbnailUrl || null }));
  const now = Date.now();
  const needsInterest = normalized.filter(item => Date.parse(item.end) > now || !Number.isFinite(item.interestedCount));
  for (let index = 0; index < needsInterest.length; index += 5) {
    await Promise.all(needsInterest.slice(index, index + 5).map(async item => {
      try {
        const result = await getJson(`https://apis.roblox.com/virtual-events/v1/virtual-events/${encodeURIComponent(item.id)}/rsvps/counters`);
        if (Number.isFinite(result?.counters?.going)) item.interestedCount = result.counters.going;
      } catch (error) { console.warn(`Interested count for ${item.id}: ${String(error)}`); }
    }));
  }
  return normalized;
}

async function collectGame(universeId, cached, archivedEvents) {
  const [passes, badges] = await Promise.all([
    allPages(`https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes?passView=Full&pageSize=100`, "gamePasses", "nextPageToken", "pageToken"),
    allPages(`https://badges.roblox.com/v1/universes/${universeId}/badges?limit=100&sortOrder=Desc`, "data", "nextPageCursor", "cursor"),
  ]);
  const [passIcons, badgeIcons] = await Promise.all([
    thumbnails("game-passes", passes.map(item => item.id)),
    thumbnails("badges/icons", badges.map(item => item.id)),
  ]);
  let products = cached?.products || [];
  let productsError = false;
  try {
    const rawProducts = await allPages(`https://apis.roblox.com/developer-products/v2/universes/${universeId}/developerproducts?limit=400`, "developerProducts", "nextPageCursor", "cursor");
    let productIcons = new Map();
    try { productIcons = await thumbnails("developer-products/icons", rawProducts.map(item => item.DeveloperProductId)); }
    catch (error) { console.warn(`Developer product icons for ${universeId}: ${String(error)}`); }
    const cachedIcons = new Map((cached?.products || []).map(item => [String(item.id), item.iconUrl]));
    products = rawProducts.map(item => ({
      id: item.DeveloperProductId,
      name: item.displayName || item.DisplayName || item.Name || "Untitled product",
      description: item.displayDescription || item.DisplayDescription || item.Description || "",
      price: Number.isFinite(item.PriceInRobux) ? item.PriceInRobux : null,
      isForSale: item.IsForSale === true,
      created: item.Created || null,
      updated: item.Updated || null,
      iconUrl: productIcons.get(String(item.DeveloperProductId)) || cachedIcons.get(String(item.DeveloperProductId)) || null,
    })).sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0));
  } catch (error) {
    console.warn(`Developer products for ${universeId}: ${String(error)}`);
    productsError = true;
  }
  let events = [...archivedEvents, ...(cached?.events || [])];
  let eventsError = false;
  try { events = await collectEvents(universeId, cached?.events || [], archivedEvents); }
  catch (error) { console.warn(`Events for ${universeId}: ${String(error)}`); eventsError = true; }
  return {
    fetchedAt: new Date().toISOString(),
    eventsFetchedAt: new Date().toISOString(),
    events,
    eventsError,
    products,
    productsError,
    passes: passes.map(item => ({
      id: item.id,
      name: item.displayName || item.name || "Untitled pass",
      description: item.displayDescription || item.description || "",
      price: Number.isFinite(item.price) ? item.price : null,
      isForSale: item.isForSale === true,
      created: item.created || null,
      updated: item.updated || null,
      iconUrl: passIcons.get(String(item.id)) || null,
    })).sort((a, b) => Number(b.isForSale) - Number(a.isForSale) || Date.parse(b.created || 0) - Date.parse(a.created || 0)),
    badges: badges.map(item => ({
      id: item.id,
      name: item.displayName || item.name || "Untitled badge",
      description: item.displayDescription || item.description || "",
      awardedCount: Number.isFinite(item.statistics?.awardedCount) ? item.statistics.awardedCount : null,
      winRatePercentage: Number.isFinite(item.statistics?.winRatePercentage) ? item.statistics.winRatePercentage : null,
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
  const archive = eventArchive[game.slug] || [];
  const hasBadgeDetails = cached?.badges?.every(badge => Object.hasOwn(badge, "awardedCount") && Object.hasOwn(badge, "winRatePercentage") && Object.hasOwn(badge, "description"));
  const hasPassDescriptions = cached?.passes?.every(pass => Object.hasOwn(pass, "description"));
  const hasProducts = Array.isArray(cached?.products) && !cached.productsError;
  try {
    const universeId = game.universeId || ids.get(game.slug);
    if (!universeId) throw new Error("Missing universe ID");
    if (cached && hasBadgeDetails && hasPassDescriptions && hasProducts && Array.isArray(cached.events) && Date.now() - Date.parse(cached.fetchedAt) < REFRESH_MS) {
      let events = [...new Map([...archive, ...cached.events].map(item => [item.id, item])).values()];
      let eventsError = false;
      try { events = await collectEvents(universeId, cached.events, archive); }
      catch (error) { console.warn(`Events for ${universeId}: ${String(error)}`); eventsError = true; }
      result.games[game.slug] = { ...cached, events, eventsError, eventsFetchedAt: new Date().toISOString() };
    } else result.games[game.slug] = await collectGame(universeId, cached, archive);
    result.games[game.slug].error = false;
    result.games[game.slug].passes = trackPrices(result.games[game.slug].passes, cached?.passes, result.games[game.slug].fetchedAt);
    if (!result.games[game.slug].productsError) result.games[game.slug].products = trackPrices(result.games[game.slug].products || [], cached?.products, result.games[game.slug].fetchedAt);
    console.log(`${game.slug}: ${result.games[game.slug].passes.length} passes, ${result.games[game.slug].products.length} products, ${result.games[game.slug].badges.length} badges, ${result.games[game.slug].events.length} events`);
  } catch (error) {
    console.warn(`${game.slug}: ${String(error)}`);
    const fallback = cached || { error: true, passes: [], products: [], badges: [], events: [] };
    const events = [...new Map([...archive, ...(fallback.events || [])].map(item => [item.id, item])).values()];
    result.games[game.slug] = { ...fallback, error: true, errorMessage: "Could not refresh this collection. Showing the last saved data.", events };
  }
}
await writeJson(path.dirname(output), "extras.json", result);
console.log(`Wrote ${output}`);

return result;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) collectExtras().catch(error => { console.error(error.message); process.exitCode = 1; });
