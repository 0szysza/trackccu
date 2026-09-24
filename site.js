/* Shared by every page: game catalog, formatting helpers, the live-data
 * store (one /api/live request feeds whatever the page shows), the refresh
 * scheduler, and the header + footer. Exposes window.Tracker. */
(() => {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000;

  // Root-relative path prefix. Root pages (games.html, compare.html,
  // index.html) don't set this, so it defaults to "". Nested pages (each
  // game's own page, two folders deep at games/<id>/index.html) set
  // `window.SITE_ROOT = "../../";` before loading this file, so every path
  // built below still points at the real site root.
  const ROOT = window.SITE_ROOT || "";

  // Data sources come from config.js (Netlify API by default, static JSON on GitHub Pages).
  const CONFIG = window.TRACKER_CONFIG || {
    live: () => "/api/live",
    history: (range) => "/api/history?range=" + range,
    groupsLive: () => ROOT + "data/group-live.json?t=" + Date.now(),
    groupsHistory: (range) => ROOT + "data/group-history-" + range + ".json?t=" + Date.now(),
  };

  // Every tracked game now shares one accent colour (BGS's light blue) —
  // the Compare page still uses its own fixed slot colours (cyan/pink).
  const ACCENT = "#00f0ff";
  const ACCENT_RGB = "0, 240, 255";

  // To add a game: edit scripts/games.json, then run
  // `node scripts/sync-games.mjs` (or just push — the GitHub Actions
  // workflow runs it automatically every ~5 minutes). That script rewrites
  // the block below and generates that game's games/<placeId>/ page.
  // Do not hand-edit between the markers — it gets overwritten.
  /* GENERATED:CATALOG:START */
  const CATALOG = [
    { slug: "bgs", placeId: "2512643572", label: "Bubble Gum Simulator", short: "BGS", ownerName: "Rumble Studios", ownerUrl: "https://www.roblox.com/communities/3333298/Rumble-Studios" },
    { slug: "bgsi", placeId: "85896571713843", label: "Bubble Gum Simulator INFINITY", short: "BGSI", ownerName: "Rumble Studios", ownerUrl: "https://www.roblox.com/communities/3333298/Rumble-Studios" },
    { slug: "jailbreak", placeId: "606849621", label: "Jailbreak", short: "JB", ownerName: "Badimo", ownerUrl: "https://www.roblox.com/communities/3059674/Badimo" },
    { slug: "petsim99", placeId: "8737899170", label: "Pet Simulator 99", short: "PS99", ownerName: "BIG Games Pets", ownerUrl: "https://www.roblox.com/communities/3959677/BIG-Games-Pets" },
    { slug: "rcu", placeId: "74260430392611", label: "Rebirth Champions: Ultimate", short: "RCU", ownerName: "Powerful Studio", ownerUrl: "https://www.roblox.com/communities/5522949/Powerful-Studio" },
    { slug: "psx", placeId: "6284583030", label: "Pet Simulator X", short: "PSX", ownerName: "BIG Games Pets", ownerUrl: "https://www.roblox.com/communities/3959677/BIG-Games-Pets" },
    { slug: "us", placeId: "3025990139", label: "Unboxing Simulator", short: "US", ownerName: "Unsquared", ownerUrl: "https://www.roblox.com/communities/2722126/Unsquared" },
    { slug: "ms", placeId: "1417427737", label: "Mining Simulator", short: "MS", ownerName: "Rumble Studios", ownerUrl: "https://www.roblox.com/communities/3333298/Rumble-Studios" },
    { slug: "ms2", placeId: "9551640993", label: "Mining Simulator 2", short: "MS2", ownerName: "Rumble Studios", ownerUrl: "https://www.roblox.com/communities/3333298/Rumble-Studios" },
    { slug: "pc", placeId: "16510724413", label: "Pet Catchers", short: "PC", ownerName: "Rumble Studios", ownerUrl: "https://www.roblox.com/communities/3333298/Rumble-Studios" },
  ];
/* GENERATED:CATALOG:END */
  /* GENERATED:GROUP_CATALOG:START */
  const GROUP_CATALOG = [
    { id: "3959677", label: "BIG Games Pets" },
    { id: "3059674", label: "Badimo" },
    { id: "5522949", label: "Powerful Studio" },
    { id: "3333298", label: "Rumble Studios" },
    { id: "2722126", label: "Unsquared" },
  ];
/* GENERATED:GROUP_CATALOG:END */
  for (const game of CATALOG) {
    game.url = `https://www.roblox.com/games/${game.placeId}/`;
    game.accent = ACCENT;
    game.rgb = ACCENT_RGB;
  }

  const bySlug = new Map(CATALOG.map((game) => [game.slug, game]));
  const byPlaceId = new Map(CATALOG.map((game) => [String(game.placeId), game]));
  const groupById = new Map(GROUP_CATALOG.map((group) => [group.id, group]));
  const groupIdForGame = (game) => String(game?.ownerUrl || "").match(/\/communities\/(\d+)/)?.[1] || null;
  for (const group of GROUP_CATALOG) group.url = `https://www.roblox.com/communities/${group.id}/`;

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
  const clockFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const chartDateTimeFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true
  });
  const dayLabel = (ms) => dayFmt.format(new Date(ms)).toUpperCase();
  const clockLabel = (ms) => clockFmt.format(new Date(ms));
  const chartDateTime = (isoOrMs) => {
    if (!isoOrMs) return "—";
    const d = new Date(isoOrMs);
    return Number.isFinite(d.getTime()) ? chartDateTimeFmt.format(d) : "—";
  };
  const relativeTime = (isoOrMs) => {
    if (!isoOrMs) return "—";
    const ms = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
    if (!Number.isFinite(ms)) return "—";
    const delta = Date.now() - ms;
    const future = delta < 0;
    const value = Math.abs(delta);
    const years = value / 31557600000;
    if (years >= 1) {
      const amount = Math.round(years);
      return future ? `in ${amount} year${amount === 1 ? "" : "s"}` : `${amount} year${amount === 1 ? "" : "s"} ago`;
    }
    const units = [
      [86400000, "day"], [3600000, "hour"], [60000, "minute"], [1000, "second"],
    ];
    const [size, unit] = units.find(([size]) => value >= size) || units[units.length - 1];
    const amount = Math.max(1, Math.floor(value / size));
    return future ? `in ${amount} ${unit}${amount === 1 ? "" : "s"}` : `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
  };

  const fullDateTime = (isoOrMs) => {
    if (!isoOrMs) return "—";
    const d = new Date(isoOrMs);
    if (!Number.isFinite(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(d);
  };

  const dateLabel = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isFinite(d.getTime())
      ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(d)
      : "—";
  };

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
  // first /api/live response (or if Roblox has none) — and if that local
  // file doesn't exist either (a freshly added game with no custom assets
  // yet), the generic site icon so nothing shows a broken image.
  const iconFor = (slug) => liveIcons.get(slug) || `${ROOT}assets/${slug}-icon.png`;
  const iconFallback = `${ROOT}favicon.png`;
  const verifiedBadgeHtml = (verified) => verified === true ? `<img src="${ROOT}assets/roblox-verified.svg" class="roblox-verified-badge" alt="Verified on Roblox" title="Verified on Roblox">` : "";

  function gameChipHtml(game, data) {
    const rating = Number.isFinite(data?.ratingPercent) ? `${data.ratingPercent}%` : "—";
    return `<a href="${ROOT}games/${game.placeId}/" class="home-game-chip" data-slug="${game.slug}">
      <div class="home-game-art"><img src="${data?.iconUrl || iconFor(game.slug)}" data-fallback="0" alt="${game.label} icon"></div>
      <div class="home-game-meta"><strong>${game.label}</strong><div class="home-game-stats"><span class="home-game-rating" aria-label="Rating ${rating}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/></svg><b>${rating}</b></span><span class="home-game-count" aria-label="${fmt(data?.playing)} players"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><b>${fmt(data?.playing)}</b></span></div></div>
    </a>`;
  }

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

  const groupsLive = { payload: null, failed: false };
  const groupListeners = new Set();
  async function loadGroups() {
    try {
      const response = await fetch(CONFIG.groupsLive(), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      groupsLive.payload = await response.json();
      groupsLive.failed = false;
      groupListeners.forEach((fn) => fn(groupsLive.payload));
    } catch (error) {
      groupsLive.failed = true;
      console.error("Group data request failed:", error);
    }
  }
  function onGroups(fn) {
    groupListeners.add(fn);
    if (groupsLive.payload) fn(groupsLive.payload);
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
      key: "games", href: ROOT + "games", label: "Games",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon ui-icon-sm" aria-hidden="true" ><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
    },
    {
      key: "groups", href: ROOT + "groups", label: "Groups",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon ui-icon-sm" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    },
    {
      key: "compare", href: ROOT + "compare", label: "Compare",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon ui-icon-sm" aria-hidden="true" ><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>',
    },
  ];

  function mountChrome(active) {
    const header = $("site-header");
    if (header) {
      header.innerHTML = `
<header class="border-b border-roblox-cardBorder bg-roblox-cardBg/90 backdrop-blur-md sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-x-5 gap-y-2">
    <a href="${ROOT || "./"}" class="order-1 flex items-center gap-2.5 shrink-0 site-brand" aria-label="CCU Tracker — Home">
      <span class="site-logo" aria-hidden="true"><img src="${ROOT}favicon.png" alt=""></span>
      <div>
        <div class="text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight">CCU Tracker</div>
        <p class="text-[11px] text-slate-400">Track any Roblox Game CCU!</p>
      </div>
    </a>
    <nav class="order-3 w-full sm:order-2 sm:w-auto flex items-center gap-1" aria-label="Pages">
      ${NAV.map((item) => `
      <a href="${item.href}" ${item.key === active ? 'aria-current="page"' : ""}
         class="top-nav-link flex-1 sm:flex-none px-3.5 py-2 text-sm font-semibold rounded-lg transition inline-flex items-center justify-center gap-2 ${
           item.key === active ? "top-nav-link-active text-white" : "text-slate-400"
         }">${item.icon}${item.label}</a>`).join("")}
    </nav>
    <div id="liveStatus" class="hidden order-2 sm:order-3 ml-auto items-center gap-2 text-xs text-slate-400" title="Stats refresh every 5 minutes">
      <span class="live-dot" id="liveDot" data-state="ok"></span>
      <span id="liveText"></span>
    </div>
  </div>
</header>`;
    }

    const footer = $("site-footer");
    if (footer) {
      footer.innerHTML = `
<footer class="border-t border-roblox-cardBorder bg-roblox-cardBg/40 py-4 mt-10 text-xs text-slate-500">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
    <div class="flex flex-col gap-2">
      <p class="text-xs text-slate-300 font-medium">Want a new game added here? Let me know!</p>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <a href="https://discord.com/users/0szysza" target="_blank" rel="noopener"
         class="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="#5865F2" class="shrink-0"><path fill="#5865F2" d="M19.888 7.335a5.134 5.134 0 0 0-2.893-2.418a9.144 9.144 0 0 0-2.275-.508a9.963 9.963 0 0 0-.508 1.038a15.039 15.039 0 0 0-4.56 0a11.372 11.372 0 0 0-.519-1.038c-.752.082-1.493.249-2.208.497a5.123 5.123 0 0 0-2.904 2.44a16.176 16.176 0 0 0-1.91 9.717a16.562 16.562 0 0 0 4.98 2.528a4.339 4.339 0 0 0 1.104-1.777c-.54-.202-1.06-.45-1.557-.74c-.089-.122.254-.32.364-.354a11.826 11.826 0 0 0 10.037 0c.1 0 .453.232.364.354c-.441.342-1.424.585-1.59.828a7.4 7.4 0 0 0 1.105 1.69a16.628 16.628 0 0 0 4.99-2.53a16.232 16.232 0 0 0-2.02-9.727M8.669 14.7a1.943 1.943 0 0 1-1.92-1.955a1.943 1.943 0 0 1 1.92-1.91a1.942 1.942 0 0 1 1.933 1.965a1.943 1.943 0 0 1-1.933 1.9m6.625 0a1.943 1.943 0 0 1-1.932-1.944a1.932 1.932 0 1 1 3.865.034a1.932 1.932 0 0 1-1.933 1.899z"/></svg>
        <span>0szysza</span>
      </a>
      <a href="https://x.com/0szysza" target="_blank" rel="noopener"
         class="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 432 384" class="shrink-0" style="color:#1DA1F2"><path fill="currentColor" d="M383 105v11q0 45-16.5 88.5t-47 79.5t-79 58.5T134 365q-73 0-134-39q10 1 21 1q61 0 109-37q-29-1-51.5-18T48 229q8 2 16 2q12 0 23-4q-30-6-50-30t-20-55v-1q19 10 40 11q-39-27-39-73q0-24 12-44q33 40 79.5 64T210 126q-2-10-2-20q0-36 25.5-61.5T295 19q38 0 64 27q30-6 56-21q-10 31-39 48q27-3 51-13q-18 26-44 45z"/></svg>
        <span>@0szysza</span>
      </a>
      </div>
    </div>
    <div class="space-y-1 text-[11px] leading-5 md:text-right">
      <p>Player counts come from the official Roblox API (<code class="text-slate-400">games.roblox.com</code>).</p>
      <p>Not affiliated with Roblox Corporation nor with the developers of any tracked game.</p>
    </div>
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

  function setupChartFullscreen(panel, button) {
    if (!panel || !button) return;
    const isOpen = () => document.fullscreenElement === panel || panel.classList.contains("chart-fullscreen-fallback");
    const update = () => {
      const open = isOpen();
      button.setAttribute("aria-label", open ? "Exit fullscreen" : "Show fullscreen");
      button.title = open ? "Exit fullscreen" : "Show fullscreen";
      button.setAttribute("aria-pressed", String(open));
    };
    button.addEventListener("click", async () => {
      if (document.fullscreenElement === panel) {
        await document.exitFullscreen();
      } else if (panel.classList.contains("chart-fullscreen-fallback")) {
        panel.classList.remove("chart-fullscreen-fallback");
        document.body.classList.remove("chart-fullscreen-open");
      } else {
        try {
          if (!panel.requestFullscreen) throw new Error("Fullscreen unavailable");
          await panel.requestFullscreen();
        } catch {
          panel.classList.add("chart-fullscreen-fallback");
          document.body.classList.add("chart-fullscreen-open");
        }
      }
      update();
    });
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && panel.classList.contains("chart-fullscreen-fallback")) {
        panel.classList.remove("chart-fullscreen-fallback");
        document.body.classList.remove("chart-fullscreen-open");
        update();
      }
    });
    update();
  }

  window.Tracker = {
    REFRESH_MS, CONFIG, CATALOG, GROUP_CATALOG, bySlug, byPlaceId, groupById, groupIdForGame, ROOT, ACCENT, ACCENT_RGB,
    $, fmt, compact, dayLabel, clockLabel, chartDateTime, dateLabel, relativeTime, fullDateTime,
    setText, iconFor, iconFallback, verifiedBadgeHtml, gameChipHtml, loadLive, onLive, loadGroups, onGroups, groupsLive, every, mountChrome, setupChartFullscreen, live,
  };
})();
