/* Shared by every page: game catalog, formatting helpers, the live-data
 * store (one /api/live request feeds whatever the page shows), the refresh
 * scheduler, and the header + footer. Exposes window.Tracker. */
(() => {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000;

  // Data sources come from config.js (Netlify API by default, static JSON on GitHub Pages).
  const CONFIG = window.TRACKER_CONFIG || {
    live: () => "/api/live",
    history: (range) => "/api/history?range=" + range,
  };

  // Every game this tracker can show. `accent`/`rgb` colour the All Games
  // tiles; the Compare page uses fixed slot colours instead (a = cyan, b = pink).
  // To add a game: add it here, in SEEDS in lib/games.ts, and drop
  // <slug>-thumbnail.png / <slug>-icon.png into /assets.
  const CATALOG = [
    { slug: "bgs", label: "Bubble Gum Simulator", short: "BGS", url: "https://www.roblox.com/games/2512643572/", accent: "#00f0ff", rgb: "0, 240, 255" },
    { slug: "bgsi", label: "Bubble Gum Simulator INFINITY", short: "BGSI", url: "https://www.roblox.com/games/85896571713843/", accent: "#ff007f", rgb: "255, 0, 127" },
    { slug: "jailbreak", label: "Jailbreak", short: "JB", url: "https://www.roblox.com/games/606849621/Jailbreak", accent: "#ffb020", rgb: "255, 176, 32" },
    { slug: "petsim99", label: "Pet Simulator 99", short: "PS99", url: "https://www.roblox.com/games/8737899170/Pet-Simulator-99", accent: "#a78bfa", rgb: "167, 139, 250" },
  ];
  const bySlug = new Map(CATALOG.map((game) => [game.slug, game]));

  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat("en-US");

  const fmt = (value) =>
    typeof value === "number" && Number.isFinite(value) ? nf.format(value) : "—";

  function compact(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (value >= 1000) return (value / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(value);
  }

  const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const clockFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dayLabel = (ms) => dayFmt.format(new Date(ms)).toUpperCase();
  const clockLabel = (ms) => clockFmt.format(new Date(ms));

  // Sets text and briefly brightens the element when the value changed
  // (but not on the first fill from the "—" placeholder).
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

  /* ---------- live data ---------- */

  const live = { payload: null, updatedAt: null, failed: false };
  const liveIcons = new Map();
  const listeners = new Set();

  // The icon a game currently uses on Roblox, or the local file until the
  // first /api/live response (or if Roblox has none).
  const iconFor = (slug) => liveIcons.get(slug) || `assets/${slug}-icon.png`;

  async function loadLive() {
    try {
      const res = await fetch(CONFIG.live(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const payload = await res.json();
      live.payload = payload;
      // When the numbers were actually measured (matters on GitHub Pages,
      // where a scheduled job produces them, not the visit itself).
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

  // Runs `fn` now, every REFRESH_MS, and again when the tab becomes visible
  // after being hidden for a while.
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

  /* ---------- header + footer ---------- */

  const NAV = [
    {
      key: "all", href: "index.html", label: "All Games",
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
    },
    {
      key: "compare", href: "compare.html", label: "Compare",
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h13m0 0-3-3m3 3-3 3M17 17H4m0 0 3-3m-3 3 3 3"/></svg>',
    },
  ];

  function mountChrome(active) {
    const header = $("site-header");
    if (header) {
      header.innerHTML = `
<header class="border-b border-roblox-cardBorder bg-roblox-cardBg/90 backdrop-blur-md sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
    <a href="index.html" class="order-1 flex items-center gap-3 shrink-0" aria-label="ROBLOX CCU Tracker — All Games">
      <i class="fi fi-rr-globe text-4xl sm:text-5xl bg-clip-text text-transparent bg-gradient-to-tr from-roblox-bgs to-roblox-bgsi"></i>
      <div>
        <div class="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight">ROBLOX CCU Tracker</div>
        <p class="text-xs text-slate-400">Track any Roblox Game CCU!</p>
      </div>
    </a>
    <nav class="order-3 w-full sm:order-2 sm:w-auto flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800" aria-label="Pages">
      ${NAV.map((item) => `
      <a href="${item.href}" ${item.key === active ? 'aria-current="page"' : ""}
         class="flex-1 sm:flex-none px-3.5 py-1.5 text-sm font-semibold rounded-lg transition inline-flex items-center justify-center gap-2 ${
           item.key === active ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"
         }">${item.icon}${item.label}</a>`).join("")}
    </nav>
    <div id="liveStatus" class="hidden order-2 sm:order-3 ml-auto items-center gap-2 text-xs text-slate-400" title="Player counts refresh every 5 minutes">
      <span class="live-dot" id="liveDot" data-state="ok"></span>
      <span id="liveText"></span>
    </div>
  </div>
</header>`;
    }

    const footer = $("site-footer");
    if (footer) {
      footer.innerHTML = `
<footer class="border-t border-roblox-cardBorder bg-roblox-cardBg/40 py-8 mt-12 text-xs text-slate-500 text-center">
  <div class="max-w-7xl mx-auto px-4 space-y-4">
    <p class="text-sm text-slate-300 font-medium">Want a new game added here? Let me know!</p>
    <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
      <a href="https://discord.com/users/0szysza" target="_blank" rel="noopener"
         class="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="#5865F2" class="shrink-0"><path fill="#5865F2" d="M19.888 7.335a5.134 5.134 0 0 0-2.893-2.418a9.144 9.144 0 0 0-2.275-.508a9.963 9.963 0 0 0-.508 1.038a15.039 15.039 0 0 0-4.56 0a11.372 11.372 0 0 0-.519-1.038c-.752.082-1.493.249-2.208.497a5.123 5.123 0 0 0-2.904 2.44a16.176 16.176 0 0 0-1.91 9.717a16.562 16.562 0 0 0 4.98 2.528a4.339 4.339 0 0 0 1.104-1.777c-.54-.202-1.06-.45-1.557-.74c-.089-.122.254-.32.364-.354a11.826 11.826 0 0 0 10.037 0c.1 0 .453.232.364.354c-.441.342-1.424.585-1.59.828a7.4 7.4 0 0 0 1.105 1.69a16.628 16.628 0 0 0 4.99-2.53a16.232 16.232 0 0 0-2.02-9.727M8.669 14.7a1.943 1.943 0 0 1-1.92-1.955a1.943 1.943 0 0 1 1.92-1.91a1.942 1.942 0 0 1 1.933 1.965a1.943 1.943 0 0 1-1.933 1.9m6.625 0a1.943 1.943 0 0 1-1.932-1.944a1.932 1.932 0 1 1 3.865.034a1.932 1.932 0 0 1-1.933 1.899z"/></svg>
        <span>@0szysza</span>
      </a>
      <a href="https://x.com/0szysza" target="_blank" rel="noopener"
         class="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 432 384" class="shrink-0" style="color:#1DA1F2"><path fill="currentColor" d="M383 105v11q0 45-16.5 88.5t-47 79.5t-79 58.5T134 365q-73 0-134-39q10 1 21 1q61 0 109-37q-29-1-51.5-18T48 229q8 2 16 2q12 0 23-4q-30-6-50-30t-20-55v-1q19 10 40 11q-39-27-39-73q0-24 12-44q33 40 79.5 64T210 126q-2-10-2-20q0-36 25.5-61.5T295 19q38 0 64 27q30-6 56-21q-10 31-39 48q27-3 51-13q-18 26-44 45z"/></svg>
        <span>@0szysza</span>
      </a>
    </div>
    <p>Player counts come from the official Roblox API (<code class="text-slate-400">games.roblox.com</code>).</p>
    <p>Not affiliated with Roblox Corporation or with the developers of any tracked game.</p>
  </div>
</footer>`;
    }
  }

  /* ---------- header status ---------- */

  function ago(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 5) return "just now";
    if (seconds < 60) return seconds + "s ago";
    return Math.floor(seconds / 60) + " min ago";
  }

  // The header chip only says when the numbers were last measured. It stays
  // hidden until the first successful load, and again if a load fails.
  function paintStatus() {
    const chip = $("liveStatus");
    const dot = $("liveDot");
    const text = $("liveText");
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
    REFRESH_MS, CONFIG, CATALOG, bySlug, $, fmt, compact, dayLabel, clockLabel,
    setText, iconFor, loadLive, onLive, every, mountChrome, live,
  };
})();
