import { createHash } from 'node:crypto';

export const GAME = { slug: 'bgsi', universeId: '6504986360', placeId: '85896571713843', name: 'Bubble Gum Simulator INFINITY', siteUrl: 'https://0szysza.github.io/trackccu/games/85896571713843/' };
export const CATEGORIES = ['updates', 'events', 'passes', 'products'];
export const LABELS = { updates: 'GAME UPDATE', events: 'NEW EVENT', passes: 'NEW GAME PASS', products: 'NEW DEVELOPER PRODUCT' };
export const WEBHOOK_ENV = { updates: 'BGSI_UPDATES_WEBHOOK', events: 'BGSI_EVENTS_WEBHOOK', passes: 'BGSI_PASSES_WEBHOOK', products: 'BGSI_PRODUCTS_WEBHOOK' };
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function getJson(url, { fetchImpl = fetch, attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
    if (response.ok) return response.json();
    if (attempt + 1 < attempts && (response.status === 429 || response.status >= 500)) {
      await delay(Math.min(10000, Number(response.headers.get('retry-after')) * 1000 || 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`Roblox request failed (HTTP ${response.status})`);
  }
}

export async function allPages(firstUrl, listKey, tokenKey, parameter, request = getJson) {
  const items = [], seen = new Set();
  let cursor = '';
  for (let page = 0; page < 100; page++) {
    const url = new URL(firstUrl);
    if (cursor) url.searchParams.set(parameter, cursor);
    const response = await request(url.href);
    if (!Array.isArray(response[listKey])) throw new Error(`Incomplete Roblox ${listKey} response`);
    items.push(...response[listKey]);
    cursor = response[tokenKey] || '';
    if (!cursor) return items;
    if (seen.has(cursor)) throw new Error(`Repeated Roblox ${listKey} cursor`);
    seen.add(cursor);
  }
  throw new Error(`Roblox ${listKey} pagination exceeded 100 pages`);
}

export function normalizePass(item) {
  if (item.id == null) throw new Error('Game pass without ID');
  return { id: String(item.id), name: item.displayName || item.name || 'Untitled pass', description: item.displayDescription || item.description || '', price: Number.isFinite(item.price) ? item.price : null, isForSale: item.isForSale === true, created: item.created || null, updated: item.updated || null };
}
export function normalizeProduct(item) {
  if (item.DeveloperProductId == null) throw new Error('Developer product without ID');
  return { id: String(item.DeveloperProductId), name: item.displayName || item.DisplayName || item.Name || 'Untitled product', description: item.displayDescription || item.DisplayDescription || item.Description || '', price: Number.isFinite(item.PriceInRobux) ? item.PriceInRobux : null, isForSale: item.IsForSale === true, created: item.Created || null, updated: item.Updated || null };
}
export function normalizeEvent(item) {
  if (item.id == null) throw new Error('Event without ID');
  const thumbnail = [...(item.thumbnails || [])].sort((a, b) => a.rank - b.rank)[0];
  return { id: String(item.id), name: item.displayTitle || item.title || 'Untitled event', description: item.displayDescription || item.description || '', subtitle: item.displaySubtitle || item.subtitle || '', start: item.eventTime?.startUtc || null, end: item.eventTime?.endUtc || null, category: [...(item.eventCategories || [])].sort((a, b) => a.rank - b.rank)[0]?.category || null, thumbnailAssetId: thumbnail?.mediaId || null };
}

export async function collectSnapshot(request = getJson) {
  const tasks = {
    updates: async () => {
      const response = await request(`https://games.roblox.com/v1/games?universeIds=${GAME.universeId}`);
      const game = response.data?.find(item => String(item.id) === GAME.universeId);
      if (!game || !Number.isFinite(Date.parse(game.updated))) throw new Error('Incomplete BGSI game details');
      return { ...GAME, name: game.name || GAME.name, description: game.description || '', updatedAt: game.updated, createdAt: game.created || null, playing: game.playing, visits: game.visits, favorites: game.favoritedCount, creator: game.creator?.name || 'Rumble Studios' };
    },
    passes: async () => (await allPages(`https://apis.roblox.com/game-passes/v1/universes/${GAME.universeId}/game-passes?passView=Full&pageSize=100`, 'gamePasses', 'nextPageToken', 'pageToken', request)).map(normalizePass),
    products: async () => (await allPages(`https://apis.roblox.com/developer-products/v2/universes/${GAME.universeId}/developerproducts?limit=400`, 'developerProducts', 'nextPageCursor', 'cursor', request)).map(normalizeProduct),
    events: async () => (await allPages(`https://apis.roblox.com/virtual-events/v1/universes/${GAME.universeId}/virtual-events?t=${Date.now()}`, 'data', 'nextPageCursor', 'cursor', request)).filter(item => item.eventVisibility === 'public').map(normalizeEvent),
  };
  const snapshot = { observedAt: new Date().toISOString(), errors: {} };
  await Promise.all(Object.entries(tasks).map(async ([category, task]) => {
    try { snapshot[category] = await task(); }
    catch (error) { snapshot.errors[category] = error.message; }
  }));
  return snapshot;
}

export function emptyState() {
  return { version: 1, universeId: GAME.universeId, baseline: {}, seen: { events: [], passes: [], products: [] }, game: null, lastUpdateAt: null, queue: [], delivered: [] };
}

export function notificationKey(category, id) {
  return createHash('sha256').update(`${GAME.universeId}:${category}:${id}`).digest('hex').slice(0, 24);
}

export function planNotifications(previous, snapshot, now = new Date().toISOString()) {
  if (previous.version !== 1 || previous.universeId !== GAME.universeId || !Array.isArray(previous.queue) || !Array.isArray(previous.delivered)) throw new Error('Invalid BGSI alert state; refusing to reset it');
  const state = structuredClone(previous), added = [];
  const knownKeys = new Set([...state.delivered, ...state.queue.map(job => job.key)]);
  const enqueue = (category, item, id) => {
    const key = notificationKey(category, id);
    if (knownKeys.has(key)) return;
    knownKeys.add(key);
    const job = { key, category, item, detectedAt: now, status: 'pending', game: snapshot.updates || state.game || GAME };
    state.queue.push(job); added.push(job);
  };
  if (snapshot.updates) {
    const current = snapshot.updates;
    if (!state.baseline.updates) {
      state.baseline.updates = now;
      state.lastUpdateAt = current.updatedAt;
      state.game = current;
    } else if (Date.parse(current.updatedAt) > Date.parse(state.lastUpdateAt)) {
      enqueue('updates', { ...current, previousUpdatedAt: state.lastUpdateAt, previousName: state.game?.name || null }, current.updatedAt);
      state.lastUpdateAt = current.updatedAt;
      state.game = current;
    }
  }
  for (const category of ['events', 'passes', 'products']) {
    if (!Array.isArray(snapshot[category])) continue;
    if (!Array.isArray(state.seen[category])) throw new Error(`Invalid BGSI ${category} state`);
    const seen = new Set(state.seen[category].map(String));
    const isBaseline = !state.baseline[category];
    for (const item of snapshot[category]) {
      const id = String(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      if (!isBaseline && (category !== 'events' || !item.end || Date.parse(item.end) > Date.parse(now))) enqueue(category, item, id);
    }
    state.seen[category] = [...seen];
    if (isBaseline) state.baseline[category] = now;
  }
  return { state, added, changed: JSON.stringify(state) !== JSON.stringify(previous) };
}

export function notificationUrl(job) {
  if (job.category === 'passes') return `https://www.roblox.com/game-pass/${encodeURIComponent(job.item.id)}`;
  if (job.category === 'events') return `https://www.roblox.com/events/${encodeURIComponent(job.item.id)}`;
  return GAME.siteUrl;
}

export function webhookPayload(jobs, filenames) {
  const category = jobs[0].category;
  if (jobs.some(job => job.category !== category)) throw new Error('Mixed notification categories');
  const links = [...new Set(jobs.map(notificationUrl))].map(url => `<${url}>`).join('\n');
  const count = jobs.length > 1 ? ` · ${jobs.length} changes` : '';
  return { username: 'BGSI · CCU Tracker', content: `@everyone **BGSI · ${LABELS[category]}${count}**\n${links}`.slice(0, 2000), allowed_mentions: { parse: ['everyone'] }, attachments: filenames.map((filename, id) => ({ id, filename })) };
}
