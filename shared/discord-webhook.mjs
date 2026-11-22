export function webhookUrl(value, label = 'Discord') {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${label} webhook configuration`); }
  if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname) || url.username || url.password || !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)) throw new Error(`Invalid ${label} webhook configuration`);
  url.search = ''; url.hash = ''; url.searchParams.set('wait', 'true');
  return url;
}

export async function executeWebhook(webhook, makeBody, { fetchImpl = fetch, headers, attempts = 1, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), signal, verify = () => true } = {}) {
  const url = webhookUrl(webhook);
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try { response = await fetchImpl(url, { method: 'POST', body: makeBody(), ...(headers ? { headers } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) }); }
    catch { const error = new Error('Could not confirm delivery. Check the channel before sending again.'); error.uncertain = true; throw error; }
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      const seconds = Math.max(1, Math.ceil(Number(data.retry_after) || 5));
      if (attempt + 1 < attempts && seconds <= 45) { await wait(seconds * 1000); continue; }
      const error = new Error(`Discord rate limit. Try again in ${seconds} s.`); error.retryAfter = seconds; throw error;
    }
    if (!response.ok) {
      const error = new Error(`Discord rejected the message (HTTP ${response.status}).`);
      error.uncertain = response.status >= 500; throw error;
    }
    let message;
    try { message = await response.json(); }
    catch { const error = new Error('Could not read the delivery confirmation. Check the channel before sending again.'); error.uncertain = true; throw error; }
    if (!message.id || !message.channel_id || !verify(message)) {
      const error = new Error('Image delivery was not confirmed. Check the channel before sending again.'); error.uncertain = true; throw error;
    }
    return message;
  }
  throw new Error('Discord rate limit did not clear.');
}
