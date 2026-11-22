import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

export async function requestJson(url, { fetchImpl = fetch, attempts = 3, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
      if (response.ok) return await response.json();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt + 1 === attempts) {
        const error = new Error(`HTTP ${response.status} for ${new URL(url).hostname}`);
        error.status = response.status;
        throw error;
      }
      await wait(Math.min(4000, Math.max(250, Number(response.headers.get('retry-after')) * 1000 || 500 * 2 ** attempt)));
    } catch (error) {
      if (error.status || attempt + 1 === attempts) throw error;
      await wait(500 * 2 ** attempt);
    }
  }
}

export function validateRaw(value, field = 'games') {
  if (!value || value.v !== 1 || !value[field] || typeof value[field] !== 'object' || Array.isArray(value[field])) throw new Error(`Invalid ${field} history; refusing to reset it`);
  for (const points of Object.values(value[field])) {
    if (!Array.isArray(points)) throw new Error(`Invalid ${field} series`);
    let previous = -Infinity;
    for (const point of points) {
      if (!Array.isArray(point) || point.length < 2 || !Number.isSafeInteger(point[0]) || point[0] < previous || !Number.isFinite(point[1]) || point[1] < 0 || point.slice(2).some(value => value != null && (!Number.isFinite(value) || value < 0))) throw new Error(`Invalid ${field} sample`);
      previous = point[0];
    }
  }
  return value;
}

export function validateExtras(value) {
  if (!value?.games || typeof value.games !== 'object' || Array.isArray(value.games)) throw new Error('Invalid extras archive; refusing to reset it');
  for (const game of Object.values(value.games)) {
    if (!game || ['passes', 'products', 'badges', 'events'].some(key => game[key] !== undefined && !Array.isArray(game[key]))) throw new Error('Invalid extras collection');
  }
  return value;
}

export async function previousJson(name, { outDir = '_site', stateDir = process.env.STATE_DATA_DIR, siteUrl = process.env.SITE_URL || '', fetchImpl = fetch, validate = value => value, empty, optional = false, bootstrap = process.env.ALLOW_DATA_BOOTSTRAP === 'true' } = {}) {
  const directory = stateDir || path.join(outDir, 'data');
  try { return validate(JSON.parse(await readFile(path.join(directory, name), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (siteUrl) {
    try { return validate(await requestJson(`${siteUrl.replace(/\/+$/, '')}/data/${name}?t=${Date.now()}`, { fetchImpl })); }
    catch (error) { if (error.status !== 404 || (!optional && !bootstrap)) throw error; }
  }
  if (optional) return null;
  if (!bootstrap) throw new Error(`Missing ${name}. Restore a checkpoint or explicitly set ALLOW_DATA_BOOTSTRAP=true for a new tracker.`);
  return structuredClone(empty);
}

export async function writeJson(directory, name, value, { readable = false } = {}) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, name);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, readable ? 2 : undefined) + '\n');
  await rename(temporary, target);
}

export const nonnegative = value => Number.isFinite(value) && value >= 0;

export function updateLedger(points, previous = {}) {
  const ledger = { ...previous };
  for (const [time, value] of points) {
    const stamp = new Date(time * 1000).toISOString();
    if (!ledger.firstTrackedAt || Date.parse(stamp) < Date.parse(ledger.firstTrackedAt)) ledger.firstTrackedAt = stamp;
    if (!nonnegative(ledger.peakAllTime) || value > ledger.peakAllTime) { ledger.peakAllTime = value; ledger.peakAllTimeAt = stamp; }
  }
  return ledger;
}

export function summarise(points, now, ledger = updateLedger(points)) {
  const result = { peakAllTime: ledger.peakAllTime ?? null, peakAllTimeAt: ledger.peakAllTimeAt ?? null, trackingSince: ledger.firstTrackedAt ?? null, samples: points.length };
  for (const [suffix, days] of [['24h', 1], ['7d', 7], ['30d', 30]]) {
    let best = null, low = Infinity, sum = 0, count = 0;
    for (const point of points) {
      if (point[0] < now - days * 86400 || point[0] > now) continue;
      if (!best || point[1] > best[1]) best = point;
      low = Math.min(low, point[1]); sum += point[1]; count++;
    }
    result[`peak${suffix}`] = best?.[1] ?? null;
    result[`peak${suffix}At`] = best ? new Date(best[0] * 1000).toISOString() : null;
    if (days === 1) { result.average24h = count ? Math.round(sum / count) : null; result.low24h = count ? low : null; }
  }
  return result;
}

export const RANGES = { '1d': [86400, 300], '7d': [604800, 1800], all: [null, 3600] };

export function aggregate(raw, range, now, { field = 'games', metrics = ['playing', 'favorites', 'visits'] } = {}) {
  const [seconds, bucket] = RANGES[range];
  const series = {};
  for (const [id, points] of Object.entries(raw[field])) {
    const buckets = new Map();
    for (const point of points) {
      if (seconds !== null && point[0] < now - seconds) continue;
      const key = Math.floor(point[0] / bucket) * bucket;
      if (!buckets.has(key)) buckets.set(key, { sums: metrics.map(() => 0), counts: metrics.map(() => 0), peak: -Infinity, peakAt: null, first: point[0], last: point[0] });
      const entry = buckets.get(key); entry.last = point[0];
      metrics.forEach((_, i) => { if (nonnegative(point[i + 1])) { entry.sums[i] += point[i + 1]; entry.counts[i]++; } });
      if (point[1] > entry.peak) { entry.peak = point[1]; entry.peakAt = new Date(point[0] * 1000).toISOString(); }
    }
    series[id] = [...buckets].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({
      t: new Date(time * 1000).toISOString(),
      ...Object.fromEntries(metrics.map((name, i) => [name, value.counts[i] ? Math.round(value.sums[i] / value.counts[i]) : null])),
      ...(field === 'games' ? { peak: value.peak, peakAt: value.peakAt } : {}),
      firstSampleAt: new Date(value.first * 1000).toISOString(), lastSampleAt: new Date(value.last * 1000).toISOString(), samples: value.counts[0],
    }));
  }
  return { ok: true, range, bucketSeconds: bucket, retentionDays: 90, generatedAt: new Date(now * 1000).toISOString(), series };
}
