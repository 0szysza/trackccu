import { CATEGORIES, validateRoutes, loadPreview, sendDebugMessage } from './messages.js?v=20261010-clean';

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
pingInput.addEventListener('change', () => { pingDescription.textContent = pingInput.checked ? 'Każdy test powiadomi @everyone' : 'Wyłączony dla testów'; });

async function sendOne(category, ping) {
  const result = document.querySelector(`[data-result="${category}"]`);
  result.textContent = 'Wysyłanie obrazka…'; result.dataset.state = 'sending';
  try {
    if (!images.has(category)) images.set(category, await loadPreview(category));
    const message = await sendDebugMessage({ category, webhook: routes[category], image: images.get(category), ping });
    const stamp = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date());
    result.textContent = `${ping && !message.pinged ? 'Wysłano, ale ping nie został aktywowany' : 'Test wysłany'} · ${stamp}`;
    result.dataset.state = ping && !message.pinged ? 'error' : 'success';
    const link = document.createElement('a'); link.href = message.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Otwórz na Discordzie ↗'; result.append(link);
    return true;
  } catch (error) {
    result.textContent = error.message || 'Nie udało się wysłać testu.'; result.dataset.state = 'error';
    return false;
  }
}

async function send(categories) {
  if (!ready || busy) return;
  const ping = pingInput.checked;
  setBusy(true);
  setOverall(categories.length === 1 ? 'Wysyłanie wiadomości testowej…' : 'Wysyłanie 4 wiadomości testowych…', 'sending');
  let sent = 0;
  try {
    for (const category of categories) if (await sendOne(category, ping)) sent++;
    setOverall(sent === categories.length ? (sent === 1 ? 'Wiadomość testowa została wysłana.' : 'Wysłano wszystkie 4 testy.') : `Wysłano ${sent}/${categories.length}. Szczegóły błędów są przy odpowiednich przyciskach.`, sent === categories.length ? 'success' : 'error');
  } finally { setBusy(false); }
}
buttons.forEach(button => button.addEventListener('click', () => send([button.dataset.send])));
allButton.addEventListener('click', () => send(CATEGORIES));

try {
  const response = await fetch(`webhooks.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Nie udało się wczytać kanałów (${response.status}).`);
  routes = validateRoutes(await response.json());
  ready = true; setBusy(false); setOverall('Gotowe. Każdy przycisk wysyła test na swój kanał.');
} catch (error) { setOverall(error.message || 'Nie udało się przygotować testów.', 'error'); }
