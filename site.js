/* Shared by every page: game catalog, formatting helpers, the live-data
 * store (one /api/live request feeds whatever the page shows), the refresh
 * scheduler, and the header + footer. Exposes window.Tracker. */
(() => {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000;
  const ROOT = window.SITE_ROOT || "";
  const CONFIG = window.TRACKER_CONFIG || {
    live: () => "/api/live",
    history: (range) => "/api/history?range=" + range,
  };
  const ACCENT = "#00f0ff";
  const ACCENT_RGB = "0, 240, 255";

  /* GENERATED:CATALOG:START */
  const CATALOG = [
    { slug: "bgs", placeId: "2512643572", label: "Bubble Gum Simulator", short: "BGS" },
    { slug: "bgsi", placeId: "85896571713843", label: "Bubble Gum Simulator INFINITY", short: "BGSI" },
    { slug: "jailbreak", placeId: "606849621", label: "Jailbreak", short: "JB" },
    { slug: "petsim99", placeId: "8737899170", label: "Pet Simulator 99", short: "PS99" },
  ];
  /* GENERATED:CATALOG:END */

  for (const game of CATALOG) {
    game.url = `https://www.roblox.com/games/${game.placeId}/`;
    game.accent = ACCENT;
    game.rgb = ACCENT_RGB;
  }

  const bySlug = new Map(CATALOG.map((game) => [game.slug, game]));
  const byPlaceId = new Map(CATALOG.map((game) => [String(game.placeId), game]));
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat("en-US");
  const fmt = (value) => typeof value === "number" && Number.isFinite(value) ? nf.format(value) : "—";

  function compact(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (value >= 1000) return (value / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(value);
  }

  const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const clockFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dayLabel = (ms) => dayFmt.format(new Date(ms)).toUpperCase();
  const clockLabel = (ms) => clockFmt.format(new Date(ms));
  const dateLabel = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(d) : "—";
  };

  function relTime(iso) {
    if (!iso) return null;
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return null;
    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 10) return "just now";
    if (seconds < 60) return seconds + (seconds === 1 ? " second ago" : " seconds ago");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
    const days = Math.floor(hours / 24);
    if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
    const months = Math.floor(days / 30);
    if (months < 12) return months + (months === 1 ? " month ago" : " months ago");
    const years = Math.floor(months / 12);
    return years + (years === 1 ? " year ago" : " years ago");
  }

  const exactFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  function exactLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? exactFmt.format(d) : "";
  }

  function setText(el, text) {
    if (!el || el.textContent === text) return;
    const previous = el.textContent;
    el.textContent = text;
    if (previous && previous !== "—") {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
  }

  const live = { payload: null, updatedAt: null, failed: false };
  const liveIcons = new Map();
  const listeners = new Set();
  const iconFor = (slug) => liveIcons.get(slug) || `${ROOT}assets/${slug}-icon.png`;
  const iconFallback = `${ROOT}favicon.png`;

  async function loadLive() {
    try {
      const res = await fetch(CONFIG.live(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const payload = await res.json();
      live.payload = payload;
      const measured = Date.parse(payload.fetchedAt);
      live.updatedAt = Number.isFinite(measured) ? measured : Date.now();
      live.failed = false;
      for (const game of payload.games || []) {
        if (game.iconUrl) liveIcons.set(game.slug, game.iconUrl);
      }
      listeners.forEach((fn) => fn(payload));
    } catch (error) {
      console.error("Live request failed:", error);
      live.failed = true;
    }
    paintStatus();
  }

  function onLive(fn) {
    listeners.add(fn);
    if (live.payload) fn(live.payload);
  }

  function every(fn) {
    let last = 0;
    let timer = null;
    const run = () => { last = Date.now(); fn(); };
    const arm = () => { clearInterval(timer); timer = setInterval(run, REFRESH_MS); };
    run();
    arm();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - last > 20000) { run(); arm(); }
    });
  }

  const NAV = [
    { key: "games", href: ROOT + "games", label: "Games", icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>' },
    { key: "compare", href: ROOT + "compare", label: "Compare", icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h13m0 0-3-3m3 3-3 3M17 17H4m0 0 3-3m-3 3 3 3"/></svg>' },
  ];

  const LOGO_MARK = `
    <svg width="34" height="34" viewBox="0 0 40 40" class="shrink-0 sm:w-10 sm:h-10" aria-hidden="true">
      <defs><linearGradient id="logoGrad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00f0ff"/><stop offset="1" stop-color="#ff007f"/></linearGradient></defs>
      <ellipse cx="20" cy="20" rx="18.5" ry="6.2" fill="none" stroke="url(#logoGrad)" stroke-width="2" opacity="0.55" transform="rotate(-20 20 20)"/>
      <circle cx="20" cy="20" r="12.5" fill="url(#logoGrad)"/><circle cx="15.5" cy="15.5" r="2.6" fill="#fff" opacity="0.35"/>
    </svg>`;

  function mountChrome(active) {
    const header = $("site-header");
    if (header) header.innerHTML = `
<header class="border-b border-roblox-cardBorder bg-roblox-cardBg/90 backdrop-blur-md sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
    <a href="${ROOT || "."}" class="order-1 flex items-center gap-3 shrink-0" aria-label="CCU Tracker — Home">
      ${LOGO_MARK}<div class="flex flex-col justify-center"><div class="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight">CCU Tracker</div><p class="text-xs text-slate-400 leading-tight">Track any Roblox Game CCU!</p></div>
    </a>
    <nav class="order-3 w-full sm:order-2 sm:w-auto flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800" aria-label="Pages">
      ${NAV.map((item) => `<a href="${item.href}" ${item.key === active ? 'aria-current="page"' : ""} class="flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold rounded-lg transition inline-flex items-center justify-center gap-2 ${item.key === active ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"}">${item.icon}${item.label}</a>`).join("")}
    </nav>
    <div id="liveStatus" class="hidden order-2 sm:order-3 ml-auto items-center gap-2 text-xs text-slate-400" title="Player counts refresh every 5 minutes"><span class="live-dot" id="liveDot" data-state="ok"></span><span id="liveText"></span></div>
  </div>
</header>`;

    const footer = $("site-footer");
    if (footer) footer.innerHTML = `
<footer class="border-t border-roblox-cardBorder bg-roblox-cardBg/40 py-8 mt-12 text-xs text-slate-500 text-center">
  <div class="max-w-7xl mx-auto px-4 space-y-4">
    <p class="text-sm text-slate-300 font-medium">Want a new game added here? Let me know!</p>
    <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
      <a href="https://discord.com/users/0szysza" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"><span>Discord</span><span>@0szysza</span></a>
      <a href="https://x.com/0szysza" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"><span>𝕏</span><span>@0szysza</span></a>
    </div>
    <p>Player counts come from the official Roblox API (<code class="text-slate-400">games.roblox.com</code>).</p>
    <p>Not affiliated with Roblox Corporation or with the developers of any tracked game.</p>
  </div>
</footer>`;
  }

  function ago(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 5) return "just now";
    if (seconds < 60) return seconds + "s ago";
    return Math.floor(seconds / 60) + " min ago";
  }

  function paintStatus() {
    const chip = $("liveStatus"), dot = $("liveDot"), text = $("liveText");
    if (!chip || !dot || !text) return;
    const show = !live.failed && live.updatedAt !== null;
    chip.classList.toggle("hidden", !show);
    chip.classList.toggle("flex", show);
    if (!show) return;
    const age = Date.now() - live.updatedAt;
    const stale = age > REFRESH_MS * 2.5 || (live.payload && live.payload.source === "database");
    dot.dataset.state = stale ? "warn" : "ok";
    text.textContent = "Updated " + ago(age);
  }
  setInterval(paintStatus, 1000);

  window.Tracker = {
    REFRESH_MS, CONFIG, CATALOG, bySlug, byPlaceId, ROOT, ACCENT, ACCENT_RGB,
    $, fmt, compact, dayLabel, clockLabel, dateLabel, relTime, exactLabel,
    setText, iconFor, iconFallback, loadLive, onLive, every, mountChrome, live,
  };
})();