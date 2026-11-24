import { readFile } from 'node:fs/promises';
import { CATEGORIES, WEBHOOK_ENV } from './core.mjs';
import { webhookUrl } from '../../shared/discord-webhook.mjs';
import { postEmbeds, webhookPayload } from '../../shared/bgsi-embeds.mjs';

export function validateWebhook(url, category) {
  return webhookUrl(url, category).href.replace('?wait=true', '');
}
export async function loadWebhooks(configPath = process.env.BGSI_WEBHOOK_CONFIG || '.github/bgsi-webhooks.json') {
  let configured = {};
  try { configured = JSON.parse(await readFile(configPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read BGSI webhook configuration'); }
  return Object.fromEntries(CATEGORIES.map(category => [category, validateWebhook(process.env[WEBHOOK_ENV[category]] || configured[category], category)]));
}

export async function sendNotification(webhook, jobs, options = {}) {
  return postEmbeds(webhook, webhookPayload(jobs), { ...options, attempts: 4, requirePing: true });
}

export async function deliverQueue(state, { store, hooks, send = sendNotification, maxMessages = 8 } = {}) {
  let sent = 0;
  for (const category of CATEGORIES) {
    const pending = state.queue.filter(job => job.category === category && job.status === 'pending');
    for (let offset = 0; offset < pending.length && sent < maxMessages; offset += 10) {
      const jobs = pending.slice(offset, offset + 10);
      for (const job of jobs) job.status = 'sending';
      await store.write(state);
      let message;
      try { message = await send(hooks[category], jobs); }
      catch (error) {
        for (const job of jobs) job.status = error.uncertain ? 'uncertain' : 'pending';
        await store.write(state);
        throw error;
      }
      for (const job of jobs) { state.delivered.push(job.key); job.status = 'sent'; }
      state.queue = state.queue.filter(job => job.status !== 'sent');
      await store.write(state);
      sent++;
      console.log(`${category}: delivered ${jobs.length} embed(s) to channel ${message.channelId}; message ${message.id}`);
    }
  }
  return sent;
}
