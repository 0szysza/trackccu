export const CATEGORIES = ['updates', 'events', 'passes', 'products'];
export const GUILD_ID = '1426160845196623885';

export function validateRoutes(routes) {
  if (!routes || typeof routes !== 'object') throw new Error('Nie udało się wczytać kanałów Discorda.');
  for (const category of CATEGORIES) {
    let url;
    try { url = new URL(routes[category]); } catch { throw new Error(`Brakuje konfiguracji kanału ${category}.`); }
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)) throw new Error(`Nieprawidłowa konfiguracja kanału ${category}.`);
  }
  return routes;
}

export function debugPayload(category, ping = false) {
  if (!CATEGORIES.includes(category)) throw new Error('Nieznany typ wiadomości testowej.');
  const filename = `bgsi-test-${category}.png`;
  return { username: 'BGSI · CCU Tracker', content: ping ? '@everyone' : '', allowed_mentions: { parse: ping ? ['everyone'] : [] }, attachments: [{ id: 0, filename }] };
}

export async function loadPreview(category, { fetchImpl = fetch, baseUrl = '../assets/debug/' } = {}) {
  if (!CATEGORIES.includes(category)) throw new Error('Nieznany typ obrazka.');
  const response = await fetchImpl(`${baseUrl}bgsi-${category}.png`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Nie udało się pobrać obrazka (${response.status}).`);
  const blob = await response.blob();
  const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => signature[index] !== value)) throw new Error('Podgląd nie jest poprawnym obrazkiem PNG.');
  return new Blob([blob], { type: 'image/png' });
}

export async function sendDebugMessage({ category, webhook, image, ping = false, fetchImpl = fetch } = {}) {
  validateRoutes(Object.fromEntries(CATEGORIES.map(key => [key, webhook])));
  if (!image || image.type !== 'image/png') throw new Error('Brakuje obrazka PNG do wysłania.');
  const payload = debugPayload(category, ping);
  const form = new FormData();
  form.set('payload_json', JSON.stringify(payload));
  form.set('files[0]', image, payload.attachments[0].filename);
  const url = new URL(webhook); url.searchParams.set('wait', 'true');
  let response;
  try { response = await fetchImpl(url, { method: 'POST', body: form, signal: AbortSignal.timeout(45000) }); }
  catch { throw new Error('Nie udało się potwierdzić wysyłki. Sprawdź kanał przed kolejnym testem.'); }
  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Discord ograniczył wysyłanie. Spróbuj za ${Math.max(1, Math.ceil(Number(data.retry_after) || 5))} s.`);
  }
  if (!response.ok) throw new Error(`Discord odrzucił test (${response.status}).`);
  let message;
  try { message = await response.json(); } catch { throw new Error('Nie udało się odczytać potwierdzenia. Sprawdź kanał przed kolejnym testem.'); }
  if (!message.id || !message.channel_id || message.attachments?.length !== 1) throw new Error('Brakuje potwierdzenia obrazka. Sprawdź kanał przed kolejnym testem.');
  return { id: message.id, channelId: message.channel_id, pinged: message.mention_everyone === true, url: `https://discord.com/channels/${GUILD_ID}/${message.channel_id}/${message.id}` };
}
