import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSnapshot, planNotifications, CATEGORIES } from './core.mjs';
import { GitHubState } from './state.mjs';
import { loadWebhooks, deliverQueue, sendNotification } from './delivery.mjs';
import { addNotificationDetails } from './details.mjs';
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
  await Promise.all(result.added.map(addNotificationDetails));
  result.state.checkedAt = snapshot.observedAt;
  await store.write(result.state);
  console.log(`BGSI checked: ${successful.join(', ')}; ${result.added.length} new notification(s); ${result.state.queue.filter(job => job.status === 'pending').length} pending.`);
  for (const category of ['events', 'passes', 'products']) if (snapshot[category]) console.log(`${category}: ${snapshot[category].length} current item(s), ${result.state.seen[category].length} known ID(s).`);
  return result.state;
}

export async function main(mode = process.argv[2] || '--prepare') {
  const hooks = await loadWebhooks();
  const store = new GitHubState();
  const state = mode === '--deliver' ? await store.read() : await prepare({ store, force: process.env.BGSI_FORCE_CHECK === 'true' });
  const uncertain = state.queue.filter(job => job.status === 'sending' || job.status === 'uncertain');
  for (const job of uncertain) console.warn(`::warning::${job.category} delivery ${job.key} needs review after an interrupted send; it will not be automatically pinged again.`);
  const pending = state.queue.filter(job => job.status === 'pending');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `has_notifications=${pending.length > 0}\nhas_update_images=${pending.some(job => job.category === 'updates')}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### BGSI Discord notifications\n\n- Last check: ${state.checkedAt || 'not checked'}\n- Known IDs: ${state.seen.passes.length} passes, ${state.seen.products.length} developer products, ${state.seen.events.length} events\n- Pending Discord notifications: ${pending.length}\n- Delivery confirmations requiring review: ${uncertain.length}\n- All four channel routes configured\n\n`);
  }
  if (mode !== '--deliver' || !pending.length) return;
  let renderer;
  const renderUpdate = async job => {
    renderer ??= await createRenderer();
    return (await renderer.render(job)).bytes;
  };
  try {
    await deliverQueue(state, { store, hooks, send: (webhook, jobs) => sendNotification(webhook, jobs, { renderUpdate }) });
  } finally {
    await renderer?.close();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(error => { console.error(error.message); process.exitCode = 1; });
