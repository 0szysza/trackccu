import { GAME, getJson } from './core.mjs';

export async function getPublishedPlaceVersion({ apiKey = process.env.BGSI_PLACE_HISTORY_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey?.trim()) return null;
  const url = new URL(`https://apis.roblox.com/place-version-history-api/v1/${GAME.placeId}/history`);
  url.search = new URLSearchParams({ isPublished: 'true', pageSize: '100' });
  const signal = AbortSignal.timeout(15000);
  const cursors = new Set();
  let newest = null;
  for (let page = 0; page < 200; page++) {
    const response = await fetchImpl(url, { headers: { 'x-api-key': apiKey.trim() }, signal });
    if (!response.ok) throw new Error(`Place version history returned HTTP ${response.status}.`);
    const { placeVersions, hasMore, nextCursor } = await response.json();
    if (!Array.isArray(placeVersions)) throw new Error('Incomplete place version history.');
    for (const entry of placeVersions) {
      const version = Number(entry.version);
      if (Number.isSafeInteger(version) && version > 0 && (newest === null || version > newest)) newest = version;
    }
    if (!hasMore) return newest;
    if (!nextCursor || cursors.has(nextCursor)) throw new Error('Invalid place version history cursor.');
    cursors.add(nextCursor);
    url.searchParams.set('cursor', nextCursor);
  }
  throw new Error('Place version history exceeded 200 pages.');
}

export async function addNotificationDetails(job) {
  const { category, item } = job;
  if (category === 'updates') {
    try {
      const version = await getPublishedPlaceVersion();
      if (version !== null) item.placeVersion = version;
    } catch {
      console.warn('::warning::Could not read the published BGSI place version; sending the update without a version number.');
    }
    return;
  }
  if (item.iconUrl || !/^\d+$/.test(item.id)) return;
  const urls = {
    passes: `game-passes?gamePassIds=${item.id}`,
    products: `developer-products/icons?developerProductIds=${item.id}`,
  };
  if (!urls[category]) return;
  try {
    const result = await getJson(`https://thumbnails.roblox.com/v1/${urls[category]}&size=150x150&format=Png&isCircular=false`, { attempts: 2 });
    const image = result.data?.find(entry => String(entry.targetId) === String(item.id) && entry.state === 'Completed');
    if (image?.imageUrl) item.iconUrl = image.imageUrl;
  } catch {
    console.warn(`::warning::Could not load the BGSI ${category} thumbnail.`);
  }
}
