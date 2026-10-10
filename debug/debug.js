import { CATEGORIES, validateRoutes, loadPreview, sendDebugMessage } from './messages.js?v=20261010-en';

const buttons = [...document.querySelectorAll('[data-send]')];
const allButton = document.getElementById('sendAll');
const pingInput = document.getElementById('pingEveryone');
const pingDescription = document.getElementById('pingDescription');
const overall = document.getElementById('overallStatus');
let routes, ready = false, busy = false;
const images = new Map();
const setOverall = (text, state = '') => { overall.textContent = text; overall.dataset.state = state; };
function setBusy(value) {
  busy = value;
  buttons.forEach(button => { button.disabled = value || !ready; });
  allButton.disabled = value || !ready;
  pingInput.disabled = value;
}
pingInput.addEventListener('change', () => { pingDescription.textContent = pingInput.checked ? 'Each test will notify @everyone' : 'Off for tests'; });

async function sendOne(category, ping) {
  const result = document.querySelector(`[data-result="${category}"]`);
  result.textContent = 'Sending image…'; result.dataset.state = 'sending';
  try {
    if (!images.has(category)) images.set(category, await loadPreview(category));
    const message = await sendDebugMessage({ category, webhook: routes[category], image: images.get(category), ping });
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
  ready = true; setBusy(false); setOverall('Ready. Each button sends a test to its assigned channel.');
} catch (error) { setOverall(error.message || 'Could not prepare the tests.', 'error'); }
