import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestJson, previousJson, writeJson, validateRaw, nonnegative, updateLedger, aggregate, RANGES } from './data-store.mjs';

export async function collectGroups({ outDir = process.env.OUT_DIR || '_site', stateDir = process.env.STATE_DATA_DIR, siteUrl = process.env.SITE_URL || '', fetchImpl = fetch, now = Math.floor(Date.now() / 1000), groups, catalog, bootstrap } = {}) {
  const options = { outDir, stateDir, siteUrl, fetchImpl, bootstrap };
  const raw = await previousJson('group-raw.json', { ...options, validate: value => validateRaw(value, 'groups'), empty: { v: 1, groups: {}, meta: {} } });
  const previous = await previousJson('group-live.json', { ...options, optional: true });
  groups ||= JSON.parse(await readFile(new URL('./groups.json', import.meta.url), 'utf8'));
  catalog ||= JSON.parse(await readFile(new URL('./games.json', import.meta.url), 'utf8'));
  const old = new Map((previous?.groups || []).map(group => [String(group.id), group]));
  raw.meta ||= {}; raw.meta.ledger ||= {};
  const get = url => requestJson(url, { fetchImpl });
  const optional = url => get(url).catch(() => null);
  const ids = groups.map(group => group.id).join(',');
  const [batch, icons] = await Promise.all([
    optional(`https://groups.roblox.com/v2/groups?groupIds=${ids}`),
    optional(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${ids}&size=420x420&format=Png&isCircular=false`),
  ]);
  const metadata = new Map((batch?.data || []).map(group => [String(group.id), group]));
  const pictures = new Map((icons?.data || []).map(icon => [String(icon.targetId), icon.imageUrl]));
  async function publicGames(id) {
    const list = [], seen = new Set();
    let cursor = '';
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams({ accessFilter: '2', limit: '50', sortOrder: 'Asc', ...(cursor ? { cursor } : {}) });
      const data = await get(`https://games.roblox.com/v2/groups/${id}/gamesV2?${query}`);
      if (!Array.isArray(data.data)) throw new Error('Incomplete public game list');
      list.push(...data.data); cursor = data.nextPageCursor;
      if (!cursor) return [...new Map(list.map(game => [String(game.id), game])).values()];
      if (seen.has(cursor)) throw new Error('Repeated public game cursor');
      seen.add(cursor);
    }
    throw new Error('Public game pagination limit reached');
  }
  const stamp = new Date(now * 1000).toISOString();
  const liveGroups = [];
  // A failed group must not discard measurements from the other groups.
  for (const seed of groups) {
    const id = String(seed.id), cached = old.get(id), points = raw.groups[id] ||= [];
    const ledger = updateLedger(points, raw.meta.ledger[id]);
    try {
      const info = await get(`https://groups.roblox.com/v1/groups/${id}`);
      if (!nonnegative(info.memberCount)) throw new Error('Missing member count');
      let games = null;
      try { games = await publicGames(id); } catch { /* Keep totals unknown, never zero. */ }
      const details = new Map();
      if (games) for (let index = 0; index < games.length; index += 50) {
        const data = await optional(`https://games.roblox.com/v1/games?universeIds=${games.slice(index, index + 50).map(game => game.id).join(',')}`);
        for (const game of data?.data || []) details.set(String(game.id), game);
      }
      const total = key => !games ? null : games.every(game => nonnegative(details.get(String(game.id))?.[key])) ? games.reduce((sum, game) => sum + details.get(String(game.id))[key], 0) : null;
      const totalVisits = total('visits'), totalFavorites = total('favoritedCount'), totalPlayers = total('playing');
      const sample = [now, info.memberCount, totalVisits, totalFavorites, totalPlayers];
      if (points.length && now - points.at(-1)[0] < 60) points[points.length - 1] = sample;
      else points.push(sample);
      const nextLedger = updateLedger([sample], ledger); raw.meta.ledger[id] = nextLedger;
      const ownerId = info.owner?.userId ?? metadata.get(id)?.owner?.id;
      liveGroups.push({ id, name: info.name || seed.name, description: info.description || '', createdAt: metadata.get(id)?.created || cached?.createdAt || null,
        owner: ownerId ? { id: ownerId, name: info.owner?.displayName || info.owner?.username || String(ownerId), username: info.owner?.username || null, hasVerifiedBadge: info.owner?.hasVerifiedBadge === true } : null,
        members: info.memberCount, totalVisits, totalFavorites, totalPlayers,
        completeMetrics: { members: true, totalVisits: totalVisits !== null, totalFavorites: totalFavorites !== null, totalPlayers: totalPlayers !== null },
        stale: false, hasVerifiedBadge: info.hasVerifiedBadge === true, iconUrl: pictures.get(id) || cached?.iconUrl || null,
        trackingSince: nextLedger.firstTrackedAt, measuredAt: stamp,
        gameSlugs: catalog.filter(game => String(game.ownerUrl || '').includes(`/communities/${id}/`)).map(game => game.slug) });
    } catch (error) {
      const last = points.at(-1);
      raw.meta.ledger[id] = ledger;
      liveGroups.push({ ...cached, id, name: cached?.name || seed.name, members: cached?.members ?? last?.[1] ?? null,
        totalVisits: cached?.totalVisits ?? last?.[2] ?? null, totalFavorites: cached?.totalFavorites ?? last?.[3] ?? null, totalPlayers: cached?.totalPlayers ?? last?.[4] ?? null,
        stale: true, error: error.message, trackingSince: ledger.firstTrackedAt || null, measuredAt: cached?.measuredAt || (last ? new Date(last[0] * 1000).toISOString() : null) });
    }
  }
  for (const id of Object.keys(raw.groups)) raw.groups[id] = raw.groups[id].filter(point => point[0] >= now - 90 * 86400);
  const complete = liveGroups.every(group => !group.stale && Object.values(group.completeMetrics).every(Boolean));
  const times = liveGroups.map(group => Date.parse(group.measuredAt)).filter(Number.isFinite);
  const live = { ok: true, source: 'roblox', complete, checkedAt: stamp, fetchedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    warning: complete ? null : 'Some group readings are incomplete or could not be updated. Missing totals are shown as unavailable.', groups: liveGroups };
  const directory = path.join(outDir, 'data');
  await Promise.all([writeJson(directory, 'group-raw.json', raw), writeJson(directory, 'group-live.json', live),
    ...Object.keys(RANGES).map(range => writeJson(directory, `group-history-${range}.json`, aggregate(raw, range, now, { field: 'groups', metrics: ['members', 'totalVisits', 'totalFavorites', 'totalPlayers'] })))]);
  console.log(`Collected ${liveGroups.filter(group => !group.stale).length}/${groups.length} group member readings.`);
  return { raw, live };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) collectGroups().catch(error => { console.error(error.message); process.exitCode = 1; });
