import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSnapshot, planNotifications, CATEGORIES } from './core.mjs';
import { GitHubState } from './state.mjs';
import { loadWebhooks, deliverQueue } from './delivery.mjs';
import { createRenderer } from './render.mjs';

export async function prepare({ store, force = false, collect = collectSnapshot } = {}) {
  const state = await store.read();
  const lastCheck = Date.parse(state.checkedAt);
  if (!force && Number.isFinite(lastCheck) && Date.now() - lastCheck < 150000) {
    console.log('BGSI was checked less than 150 seconds ago; reusing the pending notification queue.');
    return state;
  }
  const snapshot = await collect();
  const successful = CATEGORIES.filter(category => snapshot[category] !== undefined);
  if (!successful.length) throw new Error('All BGSI sources failed; keeping the saved state intact');
  for (const [category, message] of Object.entries(snapshot.errors)) console.warn(`::warning::${category}: ${message}; previous state retained`);
  const result = planNotifications(state, snapshot);
  result.state.checkedAt = snapshot.observedAt;
  await store.write(result.state);
  console.log(`BGSI checked: ${successful.join(', ')}; ${result.added.length} new notification(s); ${result.state.queue.filter(job => job.status === 'pending').length} pending.`);
  for (const category of ['events', 'passes', 'products']) if (snapshot[category]) console.log(`${category}: ${snapshot[category].length} current item(s), ${result.state.seen[category].length} known ID(s).`);
  return result.state;
}

export async function main(mode = process.argv[2] || '--prepare') {
  await loadWebhooks();
  const store = new GitHubState();
  const state = mode === '--deliver' ? await store.read() : await prepare({ store, force: process.env.BGSI_FORCE_CHECK === 'true' });
  const uncertain = state.queue.filter(job => job.status === 'sending' || job.status === 'uncertain');
  for (const job of uncertain) console.warn(`::warning::${job.category} delivery ${job.key} needs review after an interrupted send; it will not be automatically pinged again.`);
  const pending = state.queue.filter(job => job.status === 'pending');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `has_notifications=${pending.length > 0}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### BGSI image notifications\n\n- Last check: ${state.checkedAt || 'not checked'}\n- Known IDs: ${state.seen.passes.length} passes, ${state.seen.products.length} developer products, ${state.seen.events.length} events\n- Pending image notifications: ${pending.length}\n- Delivery confirmations requiring review: ${uncertain.length}\n- All four channel routes configured\n\n`);
  }
  if (mode !== '--deliver' || !pending.length) return;
  const hooks = await loadWebhooks();
  const directory = path.resolve(process.env.BGSI_IMAGE_DIR || '_bgsi-alert-images');
  await mkdir(directory, { recursive: true });
  const renderer = await createRenderer();
  try { await deliverQueue(state, { store, hooks, render: renderer.render, directory }); }
  finally { await renderer.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(error => { console.error(error.message); process.exitCode = 1; });
