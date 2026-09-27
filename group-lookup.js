(() => {
  "use strict";
  const { $, fmt, relativeTime, fullDateTime, GROUP_CATALOG, ROOT } = Tracker;
  Tracker.mountChrome("groups");

  const input = location.pathname.match(/\/groups\/lookup\/([1-9]\d{0,19})\/?$/)?.[1]
    || new URLSearchParams(location.search).get("id")?.trim() || "";
  const groupId = /^\d+$/.test(input) ? input : input.match(/roblox\.com\/(?:communities|groups)\/(\d+)/i)?.[1];
  const fail = (message) => {
    $("loading").hidden = true;
    $("errorText").textContent = message;
    $("error").classList.remove("hidden");
  };
  if (!groupId || !/^[1-9]\d{0,19}$/.test(groupId)) {
    fail("Enter a valid group ID on the Groups page.");
    return;
  }
  if (GROUP_CATALOG.some(group => group.id === groupId)) {
    location.replace(`${ROOT}groups/${groupId}/`);
    return;
  }
  const canonicalPath = new URL(`groups/lookup/${groupId}`, document.baseURI).pathname;
  if (location.pathname !== canonicalPath) history.replaceState(null, "", canonicalPath);

  const getJson = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store", headers: { "Accept-Language": "en-US,en;q=0.9" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const optional = url => getJson(url).catch(() => null);
  const safeImage = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && (parsed.hostname === "rbxcdn.com" || parsed.hostname.endsWith(".rbxcdn.com")) ? parsed.href : null;
    } catch { return null; }
  };
  const badge = () => {
    const img = document.createElement("img");
    img.src = `${ROOT}assets/roblox-verified.svg`;
    img.className = "roblox-verified-badge";
    img.alt = "Verified on Roblox";
    img.title = "Verified on Roblox";
    img.addEventListener("error", () => img.remove());
    return img;
  };

  async function loadTotals() {
    try {
      const games = [];
      let cursor = null;
      const seen = new Set();
      for (let page = 0; page < 100; page++) {
        const params = new URLSearchParams({ accessFilter: "2", limit: "50", sortOrder: "Asc" });
        if (cursor) params.set("cursor", cursor);
        const response = await getJson(`https://games.roproxy.com/v2/groups/${groupId}/gamesV2?${params}`);
        games.push(...(response.data || []));
        cursor = response.nextPageCursor;
        if (!cursor) break;
        if (seen.has(cursor) || page === 99) throw new Error("Could not read every public game in this group");
        seen.add(cursor);
      }
      if (!games.length) {
        for (const id of ["totalVisits", "totalFavorites", "totalPlayers"]) $(id).textContent = "0";
        return;
      }
      const ids = [...new Set(games.map(game => Number(game.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
      const details = new Map();
      let complete = true;
      for (let index = 0; index < ids.length; index += 50) {
        try {
          const response = await getJson(`https://games.roproxy.com/v1/games?universeIds=${ids.slice(index, index + 50).join(",")}`);
          for (const game of response.data || []) details.set(Number(game.id), game);
        } catch { complete = false; }
      }
      let visits = 0, favorites = 0, players = 0;
      let visitsComplete = true;
      for (const game of games) {
        const detail = details.get(Number(game.id));
        const gameVisits = detail?.visits ?? game.placeVisits;
        if (Number.isFinite(gameVisits)) visits += gameVisits;
        else visitsComplete = false;
        if (Number.isFinite(detail?.favoritedCount) && Number.isFinite(detail?.playing)) {
          favorites += detail.favoritedCount;
          players += detail.playing;
        } else complete = false;
      }
      $("totalVisits").textContent = visitsComplete ? fmt(visits) : "—";
      $("totalFavorites").textContent = complete ? fmt(favorites) : "—";
      $("totalPlayers").textContent = complete ? fmt(players) : "—";
    } catch (error) {
      console.warn("Group totals unavailable:", error);
    }
  }

  async function load() {
    try {
      const [group, batch, icon] = await Promise.all([
        getJson(`https://groups.roproxy.com/v1/groups/${groupId}`),
        optional(`https://groups.roproxy.com/v2/groups?groupIds=${groupId}`),
        optional(`https://thumbnails.roproxy.com/v1/groups/icons?groupIds=${groupId}&size=420x420&format=Png&isCircular=false`),
      ]);
      if (String(group?.id) !== groupId || !Number.isFinite(group.memberCount)) {
        fail("No public Roblox group was found for this ID.");
        return;
      }
      document.title = `${group.name} | CCU Tracker`;
      $("groupName").textContent = group.name || "Roblox group";
      if (group.hasVerifiedBadge === true) $("groupName").append(badge());
      $("membersNow").textContent = fmt(group.memberCount);
      $("membersStat").textContent = fmt(group.memberCount);
      $("description").textContent = group.description || "No description available.";
      $("robloxLink").href = `https://www.roblox.com/communities/${groupId}/`;
      const created = batch?.data?.find(item => String(item.id) === groupId)?.created;
      $("created").textContent = relativeTime(created);
      $("createdExact").textContent = fullDateTime(created);
      $("created").title = fullDateTime(created);

      const owner = group.owner || {};
      const ownerId = Number(owner.userId);
      if (Number.isSafeInteger(ownerId) && ownerId > 0) {
        const link = document.createElement("a");
        link.href = `https://www.roblox.com/users/${ownerId}/profile`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = owner.displayName || owner.username || String(ownerId);
        $("ownerName").replaceChildren(link);
        if (owner.hasVerifiedBadge === true) $("ownerName").append(badge());
      } else $("ownerName").textContent = "—";

      const iconUrl = safeImage(icon?.data?.find(item => String(item.targetId) === groupId)?.imageUrl);
      if (iconUrl) $("groupIcon").src = iconUrl;
      $("groupIcon").alt = `${group.name} icon`;
      const checkedAt = Date.now();
      $("checked").textContent = "Just now";
      $("checkedExact").textContent = fullDateTime(checkedAt);
      $("checked").title = fullDateTime(checkedAt);
      setInterval(() => { $("checked").textContent = relativeTime(checkedAt); }, 60000);
      $("loading").hidden = true;
      $("page").classList.remove("hidden");
      loadTotals();
    } catch (error) {
      console.error("Group lookup failed:", error);
      fail("Could not load this group right now. Please try again later.");
    }
  }
  load();
})();
