export const CATEGORIES = ['updates', 'events', 'passes', 'products'];
export const GUILD_ID = '1426160845196623885';

export function validateRoutes(routes) {
  if (!routes || typeof routes !== 'object') throw new Error('Could not load Discord channels.');
  for (const category of CATEGORIES) {
    let url;
    try { url = new URL(routes[category]); } catch { throw new Error(`Missing configuration for the ${category} channel.`); }
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)) throw new Error(`Invalid configuration for the ${category} channel.`);
  }
  return routes;
}

export function debugPayload(category, ping = false) {
  if (!CATEGORIES.includes(category)) throw new Error('Unknown test message type.');
  const filename = `bgsi-test-${category}.png`;
  return { username: 'BGSI · CCU Tracker', content: ping ? '@everyone' : '', allowed_mentions: { parse: ping ? ['everyone'] : [] }, attachments: [{ id: 0, filename }] };
}

export async function loadPreview(category, { fetchImpl = fetch, baseUrl = '../assets/debug/' } = {}) {
  if (!CATEGORIES.includes(category)) throw new Error('Unknown image type.');
  const response = await fetchImpl(`${baseUrl}bgsi-${category}.png`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not download the image (${response.status}).`);
  const blob = await response.blob();
  const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => signature[index] !== value)) throw new Error('The preview is not a valid PNG image.');
  return new Blob([blob], { type: 'image/png' });
}

export async function sendDebugMessage({ category, webhook, image, ping = false, fetchImpl = fetch } = {}) {
  validateRoutes(Object.fromEntries(CATEGORIES.map(key => [key, webhook])));
  if (!image || image.type !== 'image/png') throw new Error('Missing PNG image to send.');
  const payload = debugPayload(category, ping);
  const form = new FormData();
  form.set('payload_json', JSON.stringify(payload));
  form.set('files[0]', image, payload.attachments[0].filename);
  const url = new URL(webhook); url.searchParams.set('wait', 'true');
  let response;
  try { response = await fetchImpl(url, { method: 'POST', body: form, signal: AbortSignal.timeout(45000) }); }
  catch { throw new Error('Could not confirm delivery. Check the channel before sending another test.'); }
  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Discord rate limit. Try again in ${Math.max(1, Math.ceil(Number(data.retry_after) || 5))} s.`);
  }
  if (!response.ok) throw new Error(`Discord rejected the test (${response.status}).`);
  let message;
  try { message = await response.json(); } catch { throw new Error('Could not read the confirmation. Check the channel before sending another test.'); }
  if (!message.id || !message.channel_id || message.attachments?.length !== 1) throw new Error('Image delivery was not confirmed. Check the channel before sending another test.');
  return { id: message.id, channelId: message.channel_id, pinged: message.mention_everyone === true, url: `https://discord.com/channels/${GUILD_ID}/${message.channel_id}/${message.id}` };
}
