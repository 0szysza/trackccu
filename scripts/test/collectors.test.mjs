import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectGames } from '../collect.mjs';
import { collectGroups } from '../collect-groups.mjs';
import { collectExtras, trackPrices } from '../collect-extras.mjs';
import { aggregate, summarise, updateLedger, previousJson, requestJson, validateRaw } from '../data-store.mjs';
import { encodeBackup, decodeBackup, restoreBackup, saveCheckpoint, markBackup, persistState } from '../checkpoint.mjs';
import { deliverDigest } from '../digest.mjs';
const now = 1800000000;
const seeds = [{ slug: 'one', name: 'One', placeId: '1', universeId: '11', short: 'ONE' }, { slug: 'two', name: 'Two', placeId: '2', universeId: '22', short: 'TWO' }];
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
async function fixture(t, values = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tracker-')); t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'data'));
  for (const [name, value] of Object.entries(values)) await writeFile(path.join(directory, 'data', name), JSON.stringify(value));
  return directory;
}
const raw = () => ({ v: 1, games: { one: [[now - 91 * 86400, 9999, 2, 3], [now - 300, 10, 2, 3]], two: [[now - 300, 50, 4, 5]] }, universes: {}, meta: {} });
const live = () => ({ games: seeds.map((seed, i) => ({ ...seed, playing: i ? 50 : 10, measuredAt: new Date((now - 300) * 1000).toISOString() })) });

test('partial details preserve missing games, measured time and independent lifetime records', async t => {
  const outDir = await fixture(t, { 'raw.json': raw(), 'live.json': live() });
  const result = await collectGames({ outDir, now, seeds, fetchImpl: async url => String(url).includes('/v1/games?') ? json({ data: [{ id: 11, playing: 12 }] }) : json({ data: [] }) });
  assert.equal(result.live.games.length, 2); assert.equal(result.live.complete, false); assert.equal(result.live.totalPlaying, null);
  const missing = result.live.games[1]; assert.equal(missing.stale, true); assert.equal(missing.playing, 50); assert.equal(missing.measuredAt, live().games[1].measuredAt);
  assert.equal(result.raw.games.two.length, 1); assert.equal(result.live.games[0].peakAllTime, 9999);
  assert.equal(result.live.games[0].trackingSince, new Date((now - 91 * 86400) * 1000).toISOString());
  assert.equal(result.raw.games.one.length, 2); assert.equal(result.live.games[0].sharePercent, null);
  const again = await collectGames({ outDir, now: now + 86400, seeds, fetchImpl: async url => String(url).includes('/v1/games?') ? json({ data: [{ id: 11, playing: 20 }, { id: 22, playing: 0 }] }) : json({ data: [] }) });
  assert.equal(again.live.complete, true); assert.equal(again.live.totalPlaying, 20); assert.equal(again.live.games[0].peakAllTime, 9999);
});

test('missing/corrupt history is refused unless bootstrap was explicitly requested', async t => {
  const outDir = await fixture(t);
  await assert.rejects(previousJson('raw.json', { outDir, siteUrl: 'https://example.test', fetchImpl: async () => new Response('', { status: 404 }), empty: raw(), validate: validateRaw }), /404/);
  await writeFile(path.join(outDir, 'data/raw.json'), '{broken');
  await assert.rejects(previousJson('raw.json', { outDir, bootstrap: true, empty: raw(), validate: validateRaw }), /JSON/);
  const emptyDir = await fixture(t);
  assert.deepEqual(await previousJson('raw.json', { outDir: emptyDir, bootstrap: true, empty: raw() }), raw());
});

test('checkpoint remains source of truth while the public site is unavailable', async t => {
  const outDir = await fixture(t), state = await fixture(t, { 'raw.json': raw() });
  const saved = await previousJson('raw.json', { outDir, stateDir: path.join(state, 'data'), siteUrl: 'https://example.test', fetchImpl: async () => { throw Error('must not fetch'); }, validate: validateRaw });
  assert.deepEqual(saved, raw());
});

test('429 and temporary HTTP failures retry; network failures cannot initialize a fresh archive', async () => {
  let calls = 0, waits = [];
  const value = await requestJson('https://example.test/', { fetchImpl: async () => ++calls < 3 ? new Response('', { status: 429, headers: { 'retry-after': '1' } }) : json({ ok: true }), wait: async ms => waits.push(ms) });
  assert.equal(calls, 3); assert.deepEqual(waits, [1000, 1000]); assert.equal(value.ok, true);
  await assert.rejects(requestJson('https://example.test/', { fetchImpl: async () => { throw Error('offline'); }, wait: async () => {} }), /offline/);
});

test('peakAt preserves the real sample timestamp and rolling windows use raw timestamps', () => {
  const points = [[now - 86400 - 1, 900], [now - 86400 + 1, 100], [now - 123, 200]];
  const result = summarise(points, now, updateLedger(points));
  assert.equal(result.peak24h, 200); assert.equal(result.peak24hAt, new Date((now - 123) * 1000).toISOString());
  const rows = aggregate({ games: { one: points } }, 'all', now).series.one;
  assert.ok(rows.some(row => row.peakAt === result.peak24hAt));
});

test('incomplete group totals remain null rather than becoming zero', async t => {
  const outDir = await fixture(t, { 'group-raw.json': { v: 1, groups: {} } });
  const fetchImpl = async url => {
    url = String(url);
    if (url.includes('/v1/groups/1')) return json({ id: 1, name: 'Group', memberCount: 100 });
    if (url.includes('gamesV2')) return json({ data: [{ id: 11 }, { id: 22 }] });
    if (url.includes('/v1/games?')) return json({ data: [{ id: 11, playing: 10, visits: 100, favoritedCount: 2 }] });
    return json({ data: [] });
  };
  const result = await collectGroups({ outDir, now, groups: [{ id: '1', name: 'Group' }], catalog: [], fetchImpl });
  assert.equal(result.live.groups[0].members, 100); assert.equal(result.live.groups[0].totalPlayers, null); assert.equal(result.live.complete, false);
  assert.equal(result.raw.groups['1'][0][2], null);
});

test('extras HTTP failure preserves the prior archive without a scope error', async t => {
  const item = { id: 'p', name: 'Pass', isForSale: true, price: 5, priceHistory: [{ t: '2026-01-01T00:00:00Z', price: 5 }] };
  const cached = { fetchedAt: '2020-01-01T00:00:00Z', passes: [item], products: [], badges: [], events: [{ id: 'event', end: '2026-01-02T00:00:00Z' }] };
  const outDir = await fixture(t, { 'extras.json': { games: { one: cached } }, 'live.json': { games: seeds } });
  const result = await collectExtras({ outDir, catalog: seeds.slice(0, 1), archives: {}, fetchImpl: async () => new Response('', { status: 400 }) });
  assert.equal(result.games.one.error, true); assert.deepEqual(result.games.one.passes, cached.passes); assert.deepEqual(result.games.one.events, cached.events);
});

test('disappearing and returning products retain history without inventing an offsale change', () => {
  const original = trackPrices([{ id: 1, price: 10, isForSale: true }], [], '2026-01-01T00:00:00Z');
  const missing = trackPrices([], original, '2026-01-02T00:00:00Z');
  assert.equal(missing[0].unavailable, true); assert.equal(missing[0].priceHistory.length, 1); assert.equal(missing[0].priceLastObservedAt, original[0].priceLastObservedAt);
  const returned = trackPrices([{ id: 1, price: 20, isForSale: true }], missing, '2026-01-03T00:00:00Z');
  assert.equal(returned[0].unavailable, false); assert.deepEqual(returned[0].priceHistory.map(point => point.price), [10, 20]);
  assert.equal(original[0].priceHistory.length, 1);
});

test('daily backups round trip and cannot silently overwrite existing files', async t => {
  const bundle = { version: 1, files: { 'raw.json': raw(), 'group-raw.json': { v: 1, groups: {} }, 'extras.json': { games: {} }, 'live.json': live(), 'group-live.json': { groups: [] } } };
  const encoded = encodeBackup(bundle); assert.deepEqual(decodeBackup(encoded), bundle);
  const outDir = await fixture(t); await restoreBackup(encoded, path.join(outDir, 'data'));
  await assert.rejects(restoreBackup(encoded, path.join(outDir, 'data')), /Refusing/);
  const checkpoint = await fixture(t), backups = await fixture(t);
  const first = await saveCheckpoint(path.join(outDir, 'data'), checkpoint, { backupDir: backups }); assert.equal(first.required, true);
  await markBackup(checkpoint, first.day);
  const second = await saveCheckpoint(path.join(outDir, 'data'), checkpoint, { backupDir: backups }); assert.equal(second.required, false);
  assert.deepEqual(decodeBackup(await readFile(first.filename)).files, bundle.files);
});

test('digest saves sending state before delivery and never repeats an uncertain send', async () => {
  const state = { version: 1, jobs: [] }, saved = [];
  const options = { webhook: 'https://discord.com/api/webhooks/123/fake', live: { complete: true, games: [{ ...seeds[0], playing: 5 }] }, raw: { games: { one: [] }, meta: {} }, history1d: { series: { one: [] } }, games: seeds, state,
    now: now * 1000, save: async value => saved.push(structuredClone(value)), send: async () => { const error = Error('unknown'); error.uncertain = true; throw error; } };
  await assert.rejects(deliverDigest(options), /unknown/);
  assert.equal(saved.at(-2).jobs[0].status, 'sending'); assert.equal(state.jobs[0].status, 'uncertain');
  await deliverDigest({ ...options, send: async () => { throw Error('must not send again'); } });
  assert.equal(state.jobs.length, 1);
});

test('a valid older checkpoint and a damaged stored snapshot cannot replace newer history', async t => {
  const files = { 'raw.json': raw(), 'group-raw.json': {v:1,groups:{}}, 'extras.json':{games:{}}, 'live.json':live(), 'group-live.json':{groups:[]} };
  const source = await fixture(t, files), checkpoint = await fixture(t), backups = await fixture(t);
  await saveCheckpoint(path.join(source,'data'), checkpoint, {backupDir:backups});
  const before = await readFile(path.join(checkpoint,'data/raw.json'),'utf8');
  const older = raw(); older.games.one.pop();
  await writeFile(path.join(source,'data/raw.json'),JSON.stringify(older));
  await assert.rejects(saveCheckpoint(path.join(source,'data'),checkpoint,{backupDir:backups}), /older checkpoint/);
  assert.equal(await readFile(path.join(checkpoint,'data/raw.json'),'utf8'),before);
  await writeFile(path.join(checkpoint,'data/raw.json'),before+' ');
  await assert.rejects(saveCheckpoint(path.join(source,'data'),checkpoint,{backupDir:backups}), /checksum mismatch/);
});


test('checkpoint publishing keeps one reachable snapshot and rejects a stale writer', async t => {
  const base = await fixture(t), remote = path.join(base,'remote.git'), local = path.join(base,'writer');
  const git = (directory,args) => execFileSync('git',['-C',directory,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(base,['init','--bare',remote]); git(base,['clone',remote,local]);
  git(local,['config','user.name','Test']); git(local,['config','user.email','test@example.test']);
  await mkdir(path.join(local,'data')); await writeFile(path.join(local,'data/value.json'),'1'); await writeFile(path.join(local,'manifest.json'),'{}');
  git(local,['add','.']); git(local,['commit','-m','initial']); git(local,['push','origin','HEAD:tracker-data']);
  const stale = path.join(base,'stale'); git(base,['clone','--branch','tracker-data',remote,stale]);
  await writeFile(path.join(local,'data/value.json'),'2'); persistState(local);
  assert.equal(git(local,['rev-list','--count','HEAD']),'1');
  assert.equal(git(base,['--git-dir='+remote,'show','tracker-data:data/value.json']),'2');
  await writeFile(path.join(stale,'data/value.json'),'3');
  assert.throws(() => persistState(stale), /Command failed/);
  assert.equal(git(base,['--git-dir='+remote,'show','tracker-data:data/value.json']),'2');
});
