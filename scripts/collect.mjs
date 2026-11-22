import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestJson, previousJson, writeJson, validateRaw, nonnegative, updateLedger, summarise, aggregate, RANGES } from './data-store.mjs';

export async function collectGames({ outDir = process.env.OUT_DIR || '_site', siteUrl = process.env.SITE_URL || '', stateDir = process.env.STATE_DATA_DIR, fetchImpl = fetch, now = Math.floor(Date.now() / 1000), seeds, bootstrap } = {}) {
  const options = { outDir, siteUrl, stateDir, fetchImpl, bootstrap };
  const raw = await previousJson('raw.json', { ...options, validate: validateRaw, empty: { v: 1, games: {}, universes: {}, meta: {} } });
  const previous = await previousJson('live.json', { ...options, optional: true });
  const cached = new Map((previous?.games || []).map(game => [game.slug, game]));
  const catalog = seeds || JSON.parse(await readFile(new URL('./games.json', import.meta.url), 'utf8'));
  raw.meta ||= {}; raw.universes ||= {}; raw.meta.ledger ||= {};
  const get = url => requestJson(url, { fetchImpl });
  const optional = url => get(url).catch(() => null);
  const games = [];
  for (const seed of catalog) {
    let universeId = String(seed.universeId || raw.universes[seed.slug] || '');
    if (!universeId) {
      const resolved = await optional(`https://apis.roblox.com/universes/v1/places/${seed.placeId}/universe`);
      if (resolved?.universeId) universeId = String(resolved.universeId);
    }
    if (universeId) raw.universes[seed.slug] = universeId;
    games.push({ ...seed, universeId });
  }
  const details = new Map(), votes = new Map(), icons = new Map(), thumbs = new Map();
  for (let index = 0; index < games.length; index += 50) {
    const ids = games.slice(index, index + 50).map(game => game.universeId).filter(Boolean).join(',');
    if (!ids) continue;
    const responses = await Promise.all([
      optional(`https://games.roblox.com/v1/games?universeIds=${ids}`),
      optional(`https://games.roblox.com/v1/games/votes?universeIds=${ids}`),
      optional(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&size=256x256&format=Png&isCircular=false&returnPolicy=PlaceHolder`),
      optional(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids}&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false`),
    ]);
    for (const item of responses[0]?.data || []) details.set(String(item.id), item);
    for (const item of responses[1]?.data || []) votes.set(String(item.id), item);
    for (const item of responses[2]?.data || []) if (item.imageUrl) icons.set(String(item.targetId), item.imageUrl);
    for (const item of responses[3]?.data || []) thumbs.set(String(item.universeId || item.targetId), item.thumbnails?.find(image => image.imageUrl)?.imageUrl || item.imageUrl);
  }
  const missingIds = [], stamp = new Date(now * 1000).toISOString();
  const payloadGames = games.map(seed => {
    const detail = details.get(seed.universeId), vote = votes.get(seed.universeId), old = cached.get(seed.slug);
    const fresh = detail && nonnegative(detail.playing);
    const points = raw.games[seed.slug] ||= [];
    let ledger = updateLedger(points, raw.meta.ledger[seed.slug]);
    let game;
    if (fresh) {
      game = { ...seed, liveName: detail.name ?? seed.name, creator: detail.creator?.name ?? null, creatorId: detail.creator?.id ?? null, creatorType: detail.creator?.type ?? null,
        description: detail.description ?? null, createdAt: detail.created ?? null, updatedAt: detail.updated ?? null, playing: detail.playing,
        visits: nonnegative(detail.visits) ? detail.visits : null, favorites: nonnegative(detail.favoritedCount) ? detail.favoritedCount : null,
        upVotes: nonnegative(vote?.upVotes) ? vote.upVotes : null, downVotes: nonnegative(vote?.downVotes) ? vote.downVotes : null,
        iconUrl: icons.get(seed.universeId) || old?.iconUrl || null, thumbnailUrl: thumbs.get(seed.universeId) || old?.thumbnailUrl || null, stale: false, measuredAt: stamp };
      const sample = [now, game.playing, game.favorites, game.visits];
      if (points.length && now - points.at(-1)[0] < 60) points[points.length - 1] = sample;
      else points.push(sample);
      ledger = updateLedger([sample], ledger);
    } else {
      missingIds.push(seed.universeId || seed.placeId);
      const last = points.at(-1);
      game = { ...old, ...seed, playing: old?.playing ?? last?.[1] ?? null, favorites: old?.favorites ?? last?.[2] ?? null, visits: old?.visits ?? last?.[3] ?? null,
        stale: true, measuredAt: old?.measuredAt || (last ? new Date(last[0] * 1000).toISOString() : null) };
    }
    raw.meta.ledger[seed.slug] = ledger;
    raw.games[seed.slug] = points.filter(point => point[0] >= now - 90 * 86400);
    const hasVotes = nonnegative(game.upVotes) && nonnegative(game.downVotes) && game.upVotes + game.downVotes > 0;
    return { ...game, ratingPercent: hasVotes ? Math.round(game.upVotes / (game.upVotes + game.downVotes) * 100) : null, ...summarise(raw.games[seed.slug], now, ledger) };
  });
  for (const slug of Object.keys(raw.games)) raw.games[slug] = raw.games[slug].filter(point => point[0] >= now - 90 * 86400);
  const complete = missingIds.length === 0;
  const knownTotal = payloadGames.reduce((sum, game) => sum + (game.playing ?? 0), 0);
  for (const game of payloadGames) game.sharePercent = complete && knownTotal > 0 ? Math.round(game.playing / knownTotal * 1000) / 10 : complete ? 0 : null;
  const freshTimes = payloadGames.map(game => Date.parse(game.measuredAt)).filter(Number.isFinite);
  const live = { ok: true, source: 'roblox', complete, missingIds, checkedAt: stamp, fetchedAt: freshTimes.length ? new Date(Math.max(...freshTimes)).toISOString() : null,
    warning: complete ? null : `${missingIds.length} game${missingIds.length === 1 ? '' : 's'} could not be updated. Last known readings are marked as stale.`,
    totalPlaying: complete ? knownTotal : null, games: payloadGames };
  const ranked = [...payloadGames].filter(game => nonnegative(game.playing)).sort((a, b) => b.playing - a.playing);
  live.leaderSlug = complete ? ranked[0]?.slug ?? null : null;
  live.delta = complete && ranked.length > 1 ? ranked[0].playing - ranked[1].playing : null;
  if (complete) raw.meta.lastSuccessfulAt = stamp;
  const directory = path.join(outDir, 'data');
  await Promise.all([writeJson(directory, 'raw.json', raw), writeJson(directory, 'live.json', live), ...Object.keys(RANGES).map(range => writeJson(directory, `history-${range}.json`, aggregate(raw, range, now)))]);
  console.log(`Collected ${payloadGames.length - missingIds.length}/${games.length} games; history preserved for ${Object.keys(raw.games).length} games.`);
  return { raw, live };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) collectGames().catch(error => { console.error(error.message); process.exitCode = 1; });
