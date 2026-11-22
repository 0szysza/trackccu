import { requestJson } from './data-store.mjs';
const base = (process.env.SITE_URL || 'https://0szysza.github.io/trackccu').replace(/\/$/, '');
for (const name of ['live.json','group-live.json']) {
  const payload = await requestJson(`${base}/data/${name}?t=${Date.now()}`);
  const age = Date.now()-Date.parse(payload.fetchedAt);
  if (!Number.isFinite(age) || age < -60000 || age > 20*60000) throw new Error(`${name}: published data is over 20 minutes old or has an invalid timestamp`);
  if (payload.complete === false) console.warn(`::warning::${name}: latest snapshot is incomplete`);
  console.log(`${name}: ${Math.round(age/60000)} minutes old`);
}
