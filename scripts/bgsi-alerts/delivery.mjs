import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CATEGORIES, WEBHOOK_ENV, webhookPayload, delay } from './core.mjs';
import { executeWebhook, webhookUrl } from '../../shared/discord-webhook.mjs';

export function validateWebhook(url, category) {
  return webhookUrl(url, category).href.replace('?wait=true', '');
}
export async function loadWebhooks(configPath = process.env.BGSI_WEBHOOK_CONFIG || '.github/bgsi-webhooks.json') {
  let configured = {};
  try { configured = JSON.parse(await readFile(configPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read BGSI webhook configuration'); }
  return Object.fromEntries(CATEGORIES.map(category => [category, validateWebhook(process.env[WEBHOOK_ENV[category]] || configured[category], category)]));
}

export async function postImages(webhook, jobs, images, { fetchImpl = fetch, wait = delay } = {}) {
  if (!images.length || images.length > 10) throw new Error('Discord image batch must contain 1–10 PNG files');
  const filenames = images.map(image => path.basename(image.filename));
  const payload = webhookPayload(jobs, filenames);
  const message = await executeWebhook(webhook, () => {
    const form = new FormData();
    form.set('payload_json', JSON.stringify(payload));
    images.forEach((image, index) => form.set(`files[${index}]`, new Blob([image.bytes], { type: 'image/png' }), filenames[index]));
    return form;
  }, { fetchImpl, wait, attempts: 4, verify: message => message.attachments?.length === images.length && message.mention_everyone === true });
  return { id: message.id, channelId: message.channel_id, attachmentCount: message.attachments.length };
}

export async function deliverQueue(state, { store, hooks, render, directory, send = postImages, readImage = file => readFile(file), maxMessages = 8 } = {}) {
  let sent = 0;
  for (const category of CATEGORIES) {
    const pending = state.queue.filter(job => job.category === category && job.status === 'pending');
    for (let offset = 0; offset < pending.length && sent < maxMessages; offset += 10) {
      const jobs = pending.slice(offset, offset + 10);
      const images = [];
      for (const job of jobs) {
        const filename = path.join(directory, `bgsi-${category}-${job.key}.png`);
        await render(job, filename);
        images.push({ filename, bytes: await readImage(filename) });
      }
      for (const job of jobs) job.status = 'sending';
      await store.write(state);
      let message;
      try { message = await send(hooks[category], jobs, images); }
      catch (error) {
        for (const job of jobs) job.status = error.uncertain ? 'uncertain' : 'pending';
        await store.write(state);
        throw error;
      }
      for (const job of jobs) { state.delivered.push(job.key); job.status = 'sent'; }
      state.queue = state.queue.filter(job => job.status !== 'sent');
      await store.write(state);
      sent++;
      console.log(`${category}: delivered ${jobs.length} image(s) to channel ${message.channelId}; message ${message.id}`);
    }
  }
  return sent;
}
