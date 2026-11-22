import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeWebhook } from '../shared/discord-webhook.mjs';
import { writeJson } from './data-store.mjs';
import { persistState } from './checkpoint.mjs';
import { buildDigestPayload } from './discord.mjs';

export async function deliverDigest({ webhook, live, raw, history1d, games, siteUrl, state, save, send, now = Date.now() }) {
  if (!webhook || live.complete === false) return state;
  const period = new Date(Math.floor(now / 3600000) * 3600000).toISOString();
  const last = Date.parse(raw.meta?.lastDigestAt);
  if (!state.jobs.length && Number.isFinite(last) && now - last < 55 * 60000) return state;
  // Only discard old confirmed records. Uncertain sends remain inspectable.
  state.jobs = state.jobs.filter(job => job.status !== 'sent' || now - Date.parse(job.period) < 3 * 86400000);
  for (let offset = 0; offset < live.games.length; offset += 10) {
    const key = `${period}:${offset / 10}`;
    if (!state.jobs.some(job => job.key === key)) state.jobs.push({ key, period, status: 'pending', payload: buildDigestPayload({ live: live.games.slice(offset, offset + 10), raw, history1d, siteUrl, games, now }) });
  }
  await save(state);
  for (const job of state.jobs.filter(job => job.status === 'pending')) {
    job.status = 'sending'; job.attemptedAt = new Date(now).toISOString();
    await save(state);
    try {
      const message = await send(webhook, job.payload);
      job.status = 'sent'; job.messageId = message.id; delete job.payload;
    } catch (error) {
      job.status = error.uncertain ? 'uncertain' : 'pending';
      await save(state); throw error;
    }
    await save(state);
  }
  return state;
}
async function main() {
  const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhook) return;
  const checkpointDir = process.env.CHECKPOINT_DIR || '_checkpoint';
  const dataDir = path.join(checkpointDir, 'data');
  const read = async name => JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
  const [live, raw] = await Promise.all([read('live.json'), read('raw.json')]);
  const history1d = JSON.parse(await readFile(path.join(process.env.OUT_DIR || '_site', 'data/history-1d.json'), 'utf8'));
  const games = JSON.parse(await readFile(new URL('./games.json', import.meta.url), 'utf8'));
  let state = { version: 1, jobs: [] };
  try { state = JSON.parse(await readFile(path.join(dataDir, 'digest-state.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (state.version !== 1 || !Array.isArray(state.jobs) || state.jobs.some(job => !['pending', 'sending', 'sent', 'uncertain'].includes(job.status))) throw new Error('Invalid digest state; refusing to reset it');
  const save = async next => {
    await writeJson(dataDir, 'digest-state.json', next);
    if (process.env.GITHUB_ACTIONS === 'true') persistState(checkpointDir, 'Persist hourly digest state [skip ci]');
  };
  await deliverDigest({ webhook, live, raw, history1d, games, siteUrl: process.env.SITE_URL || '', state, save,
    send: (url, payload) => executeWebhook(url, () => JSON.stringify(payload), { headers: { 'content-type': 'application/json' }, attempts: 4 }) });
  const uncertain = state.jobs.filter(job => ['sending', 'uncertain'].includes(job.status));
  if (uncertain.length) console.warn(`::warning::${uncertain.length} digest deliveries need manual review. They will not be automatically repeated.`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(error => { console.error(error.message); process.exitCode = 1; });
