import { webhookUrl } from '../shared/discord-webhook.mjs';
import { CATEGORIES, GAME, postEmbeds, postUpdateImage, UPDATE_IMAGE_PREVIEW, webhookPayload } from '../shared/bgsi-embeds.mjs';
export { CATEGORIES };
export const GUILD_ID = '1426160845196623885';

export function validateRoutes(routes) {
  if (!routes || typeof routes !== 'object') throw new Error('Could not load Discord channels.');
  for (const category of CATEGORIES) {
    if (!routes[category]) throw new Error(`Missing configuration for the ${category} channel.`);
    try { webhookUrl(routes[category], category); } catch { throw new Error(`Invalid configuration for the ${category} channel.`); }
  }
  return routes;
}

export async function loadSamples({ fetchImpl = fetch } = {}) {
  const [live, extras] = await Promise.all(['live', 'extras'].map(async name => {
    const response = await fetchImpl(`../data/${name}.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${name} data (${response.status}).`);
    return response.json();
  }));
  const game = live.games?.find(item => item.slug === GAME.slug);
  const items = extras.games?.[GAME.slug];
  return {
    updates: game ? [{ ...game, name: game.liveName || game.name }] : [],
    events: items?.events || [],
    passes: items?.passes || [],
    products: items?.products || [],
  };
}

export function randomJob(samples, category, random = Math.random) {
  if (!CATEGORIES.includes(category)) throw new Error('Unknown test message type.');
  const items = samples[category];
  if (!items?.length) throw new Error(`No sample data for the ${category} channel.`);
  return { category, item: items[Math.floor(random() * items.length)], detectedAt: new Date().toISOString() };
}

export async function sendDebugMessage({ job, webhook, ping = false, fetchImpl = fetch } = {}) {
  let message;
  if (job.category === 'updates') {
    const response = await fetchImpl(UPDATE_IMAGE_PREVIEW);
    if (!response.ok) throw new Error(`Could not load the sample update image (${response.status}).`);
    const image = await response.blob();
    if (image.type !== 'image/png') throw new Error('The sample update image is not a PNG.');
    message = await postUpdateImage(webhook, image, { ping, test: true, fetchImpl });
  } else {
    message = await postEmbeds(webhook, webhookPayload([job], { ping, test: true }), { fetchImpl });
  }
  return { ...message, url: `https://discord.com/channels/${GUILD_ID}/${message.channelId}/${message.id}` };
}
