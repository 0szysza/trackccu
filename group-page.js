(() => {
  "use strict";
  const { CATALOG, groupById, groupIdForGame, $, fmt, niceAxis, dayLabel, clockLabel, chartDateTime, relativeTime, fullDateTime, iconFallback, gameChipHtml } = Tracker;
  Tracker.mountChrome("groups");
  const id = location.pathname.replace(/\/+$/, "").split("/").pop();
  const group = groupById.get(id);
  if (!group) { $("notFound").classList.remove("hidden"); return; }
  $("page").classList.remove("hidden");
  $("groupName").textContent = group.label;
  $("robloxLink").href = group.url;
  const icon = $("groupIcon");
  icon.src = iconFallback;
  icon.alt = group.label + " icon";
  icon.onerror = () => { icon.onerror = null; icon.src = iconFallback; };
  const HOUR = 3600000, DAY = 86400000;
  let latest = null, range = "1d", rangePoints = [], visible = [], trendPoints = [], navStart = 0, navEnd = 1, navDrag = null, requestId = 0;

  function appendVerified(element, verified) {
    if (verified !== true) return;
    const badge = document.createElement("img");
    badge.src = `${Tracker.ROOT}assets/roblox-verified.svg`;
    badge.alt = "Verified on Roblox";
    badge.title = "Verified on Roblox";
    badge.className = "roblox-verified-badge";
    element.append(" ", badge);
  }

  function showDate(label, exact, value) {
    $(label).textContent = relativeTime(value);
    $(exact).textContent = fullDateTime(value);
    $(label).title = fullDateTime(value);
  }
  function paintTrend() {
    for (const [id, span, label, tolerance] of [["trend1h", HOUR, "1h", 20 * 60000], ["trend24h", DAY, "24h", 20 * 60000]]) {
      const el = $(id);
      if (!latest || !trendPoints.length) { el.textContent = ""; continue; }
      const target = Date.now() - span;
      let near = trendPoints[0];
      for (const point of trendPoints) if (Math.abs(point.x - target) < Math.abs(near.x - target)) near = point;
      if (Math.abs(near.x - target) > tolerance) { el.textContent = ""; continue; }
      const delta = latest.members - near.y;
      el.textContent = delta === 0 ? `No change in ${label}` : `${delta > 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(delta))} in ${label}`;
      el.className = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-slate-400";
    }
  }
  function paintGroup(payload) {
    const data = (payload.groups || []).find((item) => String(item.id) === id);
    if (!data) return;
    latest = data;
    $("groupName").textContent = data.name || group.label;
    appendVerified($("groupName"), data.hasVerifiedBadge);
    document.title = `${data.name || group.label} | CCU Tracker`;
    if (data.iconUrl) icon.src = data.iconUrl;
    $("membersNow").textContent = fmt(data.members);
    $("membersStat").textContent = fmt(data.members);
    $("totalVisits").textContent = fmt(data.totalVisits);
    $("totalFavorites").textContent = fmt(data.totalFavorites);
    $("description").textContent = data.description || "No description available.";
    showDate("created", "createdExact", data.createdAt);
    showDate("trackingSince", "trackingExact", data.trackingSince);
    if (data.owner?.id) {
      const link = document.createElement("a");
      link.href = `https://www.roblox.com/users/${data.owner.id}/profile`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = data.owner.name || data.owner.username || String(data.owner.id);
      appendVerified(link, data.owner.hasVerifiedBadge);
      $("ownerName").replaceChildren(link);
    }
    renderGames();
    paintTrend();
  }

  function renderGames() {
    const allowed = new Set(latest?.gameSlugs || CATALOG.filter((game) => groupIdForGame(game) === id).map((game) => game.slug));
    const games = CATALOG.filter((game) => allowed.has(game.slug));
    const live = new Map((Tracker.live.payload?.games || []).map((game) => [game.slug, game]));
    const strip = $("groupGames");
    strip.innerHTML = games.map((game) => gameChipHtml(game, live.get(game.slug))).join("");
  }
  $("groupGames").addEventListener("error", (event) => {
    const image = event.target;
    if (image.tagName !== "IMG") return;
    const chip = image.closest("[data-slug]");
    if (image.dataset.fallback === "0") { image.dataset.fallback = "1"; image.src = `../../assets/${chip.dataset.slug}-icon.png`; }
    else { image.onerror = null; image.src = iconFallback; }
  }, true);
  Tracker.onGroups(paintGroup);
  Tracker.onLive(renderGames);
  renderGames();

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  function paintNavigator() {
    const panel = $("chartNavigatorPanel");
    if (rangePoints.length < 2) { panel.hidden = true; return; }
    panel.hidden = false;
    const host = $("chartHost"), W = Math.max(260, host.clientWidth), PL = 70, PR = 32;
    panel.style.width = `${W - PL - PR}px`;
    panel.style.marginLeft = `${PL}px`;
    panel.style.marginRight = "0";
    const first = rangePoints[0].x, last = rangePoints.at(-1).x;
    let low = Infinity, high = -Infinity;
    for (const point of rangePoints) { low = Math.min(low, point.y); high = Math.max(high, point.y); }
    const spread = high - low || 1;
    const path = rangePoints.map((point, i) => `${i ? "L" : "M"}${((point.x - first) / (last - first || 1) * 1000).toFixed(1)} ${(62 - (point.y - low) / spread * 50).toFixed(1)}`).join(" ");
    $("chartNavigatorPlot").innerHTML = `<path d="${path}" fill="none" stroke="#34bfe5" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
    $("chartNavigatorSelection").style.left = `${navStart * 100}%`;
    $("chartNavigatorSelection").style.width = `${(navEnd - navStart) * 100}%`;
    $("chartNavigatorShadeLeft").style.width = `${navStart * 100}%`;
    $("chartNavigatorShadeRight").style.width = `${(1 - navEnd) * 100}%`;
    for (const [handle, value] of [["navStartHandle", navStart], ["navEndHandle", navEnd]]) {
      $(handle).setAttribute("aria-valuenow", String(Math.round(value * 100)));
      $(handle).setAttribute("aria-valuetext", chartDateTime(first + value * (last - first)));
    }
  }
  function selectPoints() {
    if (rangePoints.length < 2 || (navStart === 0 && navEnd === 1)) visible = rangePoints;
    else {
      const first = rangePoints[0].x, last = rangePoints.at(-1).x;
      const from = first + (last - first) * navStart, to = first + (last - first) * navEnd;
      visible = rangePoints.filter((point) => point.x >= from && point.x <= to);
      if (visible.length < 2) {
        const mid = (from + to) / 2;
        let nearest = 0;
        for (let i = 1; i < rangePoints.length; i++) if (Math.abs(rangePoints[i].x - mid) < Math.abs(rangePoints[nearest].x - mid)) nearest = i;
        visible = rangePoints.slice(clamp(nearest, 0, rangePoints.length - 2), clamp(nearest, 0, rangePoints.length - 2) + 2);
      }
    }
    drawChart();
  }
  function drawChart() {
    const host = $("chartHost"), note = $("chartNote"), tooltip = $("chartTooltip");
    tooltip.classList.add("hidden");
    paintNavigator();
    if (visible.length < 2) { host.innerHTML = ""; $("chartStats").innerHTML = ""; note.classList.remove("hidden"); return; }
    note.classList.add("hidden");
    const W = Math.max(260, host.clientWidth), H = Math.max(220, host.clientHeight);
    const PL = 70, PR = 32, PT = 18, PB = 34;
    const first = visible[0].x, last = visible.at(-1).x;
    let low = Infinity, high = -Infinity, sum = 0;
    for (const point of visible) { low = Math.min(low, point.y); high = Math.max(high, point.y); sum += point.y; }
    const margin = (high - low) * .12 || Math.max(1, high * .02);
    const axis = niceAxis(Math.max(0, low - margin), high + margin, Math.min(10, Math.max(4, Math.floor((H - PT - PB) / 90))));
    const minY = axis.min, maxY = axis.max;
    const x = (time) => PL + (time - first) / (last - first || 1) * (W - PL - PR);
    const y = (value) => PT + (1 - (value - minY) / (maxY - minY || 1)) * (H - PT - PB);
    let grid = "";
    for (const value of axis.ticks) { const yy = y(value); grid += `<line x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}" stroke="#283047" stroke-width="1"/><text x="${PL - 7}" y="${yy + 4}" text-anchor="end" fill="#64748b" font-size="11">${fmt(value)}</text>`; }
    const xTicks = Math.min(11, Math.max(3, Math.floor((W - PL - PR) / 155)));
    let labels = "";
    for (let i = 0; i < xTicks; i++) { const time = first + i * (last - first) / (xTicks - 1); labels += `<text x="${x(time)}" y="${H - 10}" text-anchor="middle" fill="#64748b" font-size="11">${range === "1d" ? clockLabel(time) : dayLabel(time)}</text>`; }
    const line = visible.map((point, i) => `${i ? "L" : "M"}${x(point.x).toFixed(1)} ${y(point.y).toFixed(1)}`).join(" ");
    const area = `${line} L${x(last)} ${H - PB} L${x(first)} ${H - PB} Z`;
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="Members history chart"><defs><linearGradient id="groupArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34bfe5" stop-opacity=".28"/><stop offset="1" stop-color="#34bfe5" stop-opacity="0"/></linearGradient></defs>${grid}${labels}<path d="${area}" fill="url(#groupArea)"/><path d="${line}" fill="none" stroke="#34bfe5" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><line id="hoverLine" x1="0" x2="0" y1="${PT}" y2="${H - PB}" stroke="#94a3b8" stroke-dasharray="4 4" visibility="hidden"/><circle id="hoverHalo" r="9" fill="#34bfe5" opacity=".24" visibility="hidden"/><circle id="hoverDot" r="4.5" fill="#34bfe5" stroke="#15192d" stroke-width="2" visibility="hidden"/></svg>`;
    $("chartStats").innerHTML = `<span class="chart-stat">High <b>${fmt(high)}</b></span><span class="chart-stat">Low <b>${fmt(low)}</b></span><span class="chart-stat">Avg <b>${fmt(Math.round(sum / visible.length))}</b></span>`;
    const svg = host.querySelector("svg"), cross = host.querySelector("#hoverLine"), halo = host.querySelector("#hoverHalo"), dot = host.querySelector("#hoverDot");
    svg.addEventListener("pointermove", (event) => {
      const rect = svg.getBoundingClientRect(), px = (event.clientX - rect.left) / rect.width * W;
      let best = visible[0];
      for (const point of visible) if (Math.abs(x(point.x) - px) < Math.abs(x(best.x) - px)) best = point;
      const xx = x(best.x), yy = y(best.y);
      cross.setAttribute("x1", xx); cross.setAttribute("x2", xx); cross.setAttribute("visibility", "visible");
      for (const marker of [halo, dot]) { marker.setAttribute("cx", xx); marker.setAttribute("cy", yy); marker.setAttribute("visibility", "visible"); }
      tooltip.innerHTML = `<b>${fmt(best.y)} members</b><br><span class="text-slate-400">${chartDateTime(best.x)}</span>`;
      tooltip.classList.remove("hidden"); tooltip.style.left = Math.min(rect.width - 160, Math.max(8, xx / W * rect.width + 10)) + "px"; tooltip.style.top = "14px";
    });
    svg.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); halo.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tooltip.classList.add("hidden"); });
  }

  const navigator = $("chartNavigator");
  const minSpan = () => Math.max(.03, 40 / Math.max(1, navigator.clientWidth), 1 / Math.max(1, rangePoints.length - 1));
  navigator.addEventListener("pointerdown", (event) => {
    if (rangePoints.length < 2 || event.button !== 0) return;
    let part = event.target.closest("[data-nav-part]")?.dataset.navPart;
    if (!part) { const rect = navigator.getBoundingClientRect(), width = navEnd - navStart; navStart = clamp((event.clientX - rect.left) / rect.width - width / 2, 0, 1 - width); navEnd = navStart + width; selectPoints(); part = "move"; }
    navDrag = { part, id: event.pointerId, x: event.clientX, start: navStart, end: navEnd };
    navigator.setPointerCapture(event.pointerId); event.preventDefault();
  });
  navigator.addEventListener("pointermove", (event) => {
    if (!navDrag || navDrag.id !== event.pointerId) return;
    const delta = (event.clientX - navDrag.x) / navigator.getBoundingClientRect().width, minimum = minSpan();
    if (navDrag.part === "start") navStart = clamp(navDrag.start + delta, 0, navDrag.end - minimum);
    else if (navDrag.part === "end") navEnd = clamp(navDrag.end + delta, navDrag.start + minimum, 1);
    else { const width = navDrag.end - navDrag.start; navStart = clamp(navDrag.start + delta, 0, 1 - width); navEnd = navStart + width; }
    selectPoints();
  });
  for (const type of ["pointerup", "pointercancel"]) navigator.addEventListener(type, (event) => { if (navDrag?.id === event.pointerId) navDrag = null; });
  for (const [handle, edge] of [["navStartHandle", "start"], ["navEndHandle", "end"]]) $(handle).addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = (event.shiftKey ? .05 : .01) * (event.key === "ArrowLeft" ? -1 : 1), minimum = minSpan();
    if (edge === "start") navStart = clamp(navStart + delta, 0, navEnd - minimum);
    else navEnd = clamp(navEnd + delta, navStart + minimum, 1);
    selectPoints();
  });
  async function loadRange(next, reset = false) {
    if (reset || next !== range) { navStart = 0; navEnd = 1; }
    range = next;
    const current = ++requestId;
    $("groupRanges").setAttribute("aria-busy", "true");
    document.querySelectorAll("#groupRanges .range-btn").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.range === range)));
    try {
      const response = await fetch(Tracker.CONFIG.groupsHistory(next), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (current !== requestId) return;
      rangePoints = (payload.series?.[id] || []).map((row) => ({ x: Date.parse(row.t), y: row.members })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).sort((a, b) => a.x - b.x);
      if (next === "1d") { trendPoints = rangePoints; paintTrend(); }
      selectPoints();
    } catch (error) { if (current === requestId) { console.error("Group history request failed:", error); rangePoints = []; selectPoints(); } }
    finally { if (current === requestId) $("groupRanges").removeAttribute("aria-busy"); }
  }
  async function loadTrend() {
    if (range === "1d") return;
    try { const response = await fetch(Tracker.CONFIG.groupsHistory("1d"), { cache: "no-store" }); if (!response.ok) return; const payload = await response.json(); trendPoints = (payload.series?.[id] || []).map((row) => ({ x: Date.parse(row.t), y: row.members })); paintTrend(); }
    catch (error) { console.error("Group trend request failed:", error); }
  }
  document.querySelectorAll("#groupRanges .range-btn").forEach((button) => button.addEventListener("click", () => loadRange(button.dataset.range, true)));
  Tracker.setupChartFullscreen($("groupChartPanel"), $("groupFullscreenToggle"));
  if (typeof ResizeObserver === "function") {
    let size = "";
    new ResizeObserver(() => { const wrap = $("chartWrap"), next = `${wrap.clientWidth}x${wrap.clientHeight}`; if (next === size) return; size = next; requestAnimationFrame(drawChart); }).observe($("chartWrap"));
  }
  Tracker.every(() => { Tracker.loadLive(); Tracker.loadGroups(); loadRange(range); loadTrend(); });
})();

