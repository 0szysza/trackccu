import { CATEGORIES, validateRoutes, loadSamples, randomJob, sendDebugMessage } from './messages.js';
import { buildEmbed } from '../shared/bgsi-embeds.mjs';

const buttons = [...document.querySelectorAll('[data-send]')];
const allButton = document.getElementById('sendAll');
const pingInput = document.getElementById('pingEveryone');
const pingDescription = document.getElementById('pingDescription');
const overall = document.getElementById('overallStatus');
let routes, samples, ready = false, busy = false;
const setOverall = (text, state = '') => { overall.textContent = text; overall.dataset.state = state; };
function setBusy(value) {
  busy = value;
  buttons.forEach(button => { button.disabled = value || !ready; });
  allButton.disabled = value || !ready;
  pingInput.disabled = value;
}
pingInput.addEventListener('change', () => { pingDescription.textContent = pingInput.checked ? 'Each test will notify @everyone' : 'Off for tests'; });

function showPreview(job) {
  if (job.category === 'updates') return;
  const embed = buildEmbed(job, true);
  const preview = document.querySelector(`[data-preview="${job.category}"]`);
  preview.style.borderInlineStartColor = `#${embed.color.toString(16).padStart(6, '0')}`;
  preview.querySelector('strong').textContent = embed.title;
  preview.querySelector('p').textContent = embed.description || embed.fields.find(field => field.name === 'Description')?.value || '';
}

async function sendOne(category, ping) {
  const result = document.querySelector(`[data-result="${category}"]`);
  result.textContent = category === 'updates' ? 'Sending image…' : 'Sending embed…'; result.dataset.state = 'sending';
  try {
    const job = randomJob(samples, category);
    showPreview(job);
    const message = await sendDebugMessage({ job, webhook: routes[category], ping });
    const stamp = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date());
    result.textContent = `${ping && !message.pinged ? 'Sent, but the ping was not activated' : 'Test sent'} · ${stamp}`;
    result.dataset.state = ping && !message.pinged ? 'error' : 'success';
    const link = document.createElement('a'); link.href = message.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Open in Discord ↗'; result.append(link);
    return true;
  } catch (error) {
    result.textContent = error.message || 'Could not send the test.'; result.dataset.state = 'error';
    return false;
  }
}

async function send(categories) {
  if (!ready || busy) return;
  const ping = pingInput.checked;
  setBusy(true);
  setOverall(categories.length === 1 ? 'Sending test message…' : 'Sending 4 test messages…', 'sending');
  let sent = 0;
  try {
    for (const category of categories) if (await sendOne(category, ping)) sent++;
    setOverall(sent === categories.length ? (sent === 1 ? 'Test message sent.' : 'All 4 tests sent.') : `Sent ${sent}/${categories.length}. Check the relevant buttons for error details.`, sent === categories.length ? 'success' : 'error');
  } finally { setBusy(false); }
}
buttons.forEach(button => button.addEventListener('click', () => send([button.dataset.send])));
allButton.addEventListener('click', () => send(CATEGORIES));

try {
  const response = await fetch(`webhooks.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load channel configuration (${response.status}).`);
  routes = validateRoutes(await response.json());
  samples = await loadSamples();
  for (const category of CATEGORIES) if (samples[category].length) showPreview(randomJob(samples, category));
  ready = true; setBusy(false); setOverall('Ready. Each button sends a test to its assigned channel.');
} catch (error) { setOverall(error.message || 'Could not prepare the tests.', 'error'); }
