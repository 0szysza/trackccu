import { readFile } from 'node:fs/promises';
import { CATEGORIES, WEBHOOK_ENV } from './core.mjs';
import { webhookUrl } from '../../shared/discord-webhook.mjs';
import { buildEmbed, EMBED_CHARACTER_LIMIT, embedCharacters, postEmbeds, postUpdateImage, webhookPayload } from '../../shared/bgsi-embeds.mjs';

export function validateWebhook(url, category) {
  return webhookUrl(url, category).href.replace('?wait=true', '');
}
export async function loadWebhooks(configPath = process.env.BGSI_WEBHOOK_CONFIG || '.github/bgsi-webhooks.json') {
  let configured = {};
  try { configured = JSON.parse(await readFile(configPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read BGSI webhook configuration'); }
  return Object.fromEntries(CATEGORIES.map(category => [category, validateWebhook(process.env[WEBHOOK_ENV[category]] || configured[category], category)]));
}

export async function sendNotification(webhook, jobs, { renderUpdate, ...options } = {}) {
  const delivery = { ...options, attempts: 4, requirePing: true };
  if (jobs[0].category === 'updates') {
    const bytes = await renderUpdate(jobs[0]);
    return postUpdateImage(webhook, new Blob([bytes], { type: 'image/png' }), delivery);
  }
  return postEmbeds(webhook, webhookPayload(jobs), delivery);
}

function* batches(category, pending) {
  if (category === 'updates') {
    for (const job of pending) yield [job];
    return;
  }
  let jobs = [], size = 0;
  for (const job of pending) {
    const chars = embedCharacters(buildEmbed(job));
    if (jobs.length === 10 || size + chars > EMBED_CHARACTER_LIMIT) {
      yield jobs;
      jobs = [];
      size = 0;
    }
    jobs.push(job);
    size += chars;
  }
  if (jobs.length) yield jobs;
}

export async function deliverQueue(state, { store, hooks, send = sendNotification, maxMessages = 8 } = {}) {
  let sent = 0;
  for (const category of CATEGORIES) {
    const pending = state.queue.filter(job => job.category === category && job.status === 'pending');
    for (const jobs of batches(category, pending)) {
      if (sent >= maxMessages) return sent;
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
      console.log(`${category}: delivered ${jobs.length} notification(s) to channel ${message.channelId}; message ${message.id}`);
    }
  }
  return sent;
}
