(() => {
  "use strict";
  const { $, fmt, relativeTime, fullDateTime, byPlaceId, groupById, ROOT } = Tracker;
  Tracker.mountChrome("games");

  // Roblox game URLs contain a place ID. These public endpoints require a
  // CORS-enabled proxy when called from GitHub Pages. No credentials are sent.
  const input = new URLSearchParams(location.search).get("id")?.trim() || "";
  const placeId = /^\d+$/.test(input) ? input : input.match(/roblox\.com\/games\/(\d+)/i)?.[1];
  const fail = (message) => {
    $("loading").hidden = true;
    $("errorText").textContent = message;
    $("error").classList.remove("hidden");
  };
  if (!placeId || !/^[1-9]\d{0,19}$/.test(placeId)) {
    fail("Enter a valid game ID on the Games page.");
    return;
  }
  if (byPlaceId.has(placeId)) {
    location.replace(`${ROOT}games/${placeId}/`);
    return;
  }

  const safeImage = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && (parsed.hostname === "rbxcdn.com" || parsed.hostname.endsWith(".rbxcdn.com")) ? parsed.href : null;
    } catch { return null; }
  };
  const getJson = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store", headers: { "Accept-Language": "en-US,en;q=0.9" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const optional = (url) => getJson(url).catch(() => null);
  const setDate = (name, stamp) => {
    $(name).textContent = relativeTime(stamp);
    $(name + "Exact").textContent = fullDateTime(stamp);
    $(name).title = fullDateTime(stamp);
  };

  async function load() {
    try {
      const resolved = await getJson(`https://apis.roproxy.com/universes/v1/places/${placeId}/universe`);
      const universeId = Number(resolved?.universeId);
      if (!Number.isSafeInteger(universeId) || universeId <= 0) {
        fail("No public Roblox game was found for this ID.");
        return;
      }
      const [details, votes, icons, thumbs] = await Promise.all([
        getJson(`https://games.roproxy.com/v1/games?universeIds=${universeId}`),
        optional(`https://games.roproxy.com/v1/games/votes?universeIds=${universeId}`),
        optional(`https://thumbnails.roproxy.com/v1/games/icons?universeIds=${universeId}&size=256x256&format=Png&isCircular=false`),
        optional(`https://thumbnails.roproxy.com/v1/games/multiget/thumbnails?universeIds=${universeId}&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false`),
      ]);
      const game = details?.data?.find(item => Number(item.id) === universeId && Number(item.rootPlaceId) > 0);
      if (!game) { fail("This game is unavailable or does not have public stats."); return; }
      const rootId = String(game.rootPlaceId);
      if (byPlaceId.has(rootId)) { location.replace(`${ROOT}games/${rootId}/`); return; }

      document.title = `${game.name} | CCU Tracker`;
      $("name").textContent = game.name || "Roblox game";
      $("playing").textContent = fmt(game.playing);
      $("visits").textContent = fmt(game.visits);
      $("favourites").textContent = fmt(game.favoritedCount);
      $("description").textContent = game.description || "No description available.";
      setDate("created", game.created);
      setDate("updated", game.updated);
      $("robloxLink").href = `https://www.roblox.com/games/${rootId}/`;

      const creator = game.creator || {};
      const owner = $("owner");
      const creatorId = Number(creator.id);
      if (creator.name && Number.isSafeInteger(creatorId) && creatorId > 0) {
        const isGroup = creator.type === "Group";
        const internal = isGroup && groupById.has(String(creatorId));
        const link = document.createElement("a");
        link.href = internal ? `${ROOT}groups/${creatorId}/` : isGroup
          ? `https://www.roblox.com/communities/${creatorId}/`
          : `https://www.roblox.com/users/${creatorId}/profile`;
        link.className = "tile-link";
        if (!internal) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
        link.textContent = creator.name;
        owner.replaceChildren(link);
      } else owner.textContent = creator.name || "—";

      const vote = votes?.data?.find(item => Number(item.id) === universeId);
      const up = Number(vote?.upVotes), down = Number(vote?.downVotes);
      const hasVotes = Number.isFinite(up) && Number.isFinite(down) && up + down > 0;
      $("lookupMetrics").classList.toggle("lookup-no-votes", !vote);
      $("rating").textContent = hasVotes ? `${Math.round(up / (up + down) * 100)}%` : "—";
      $("upVotes").textContent = Number.isFinite(up) && vote ? fmt(up) : "—";
      $("downVotes").textContent = Number.isFinite(down) && vote ? fmt(down) : "—";
      $("voteFill").style.width = hasVotes ? `${up / (up + down) * 100}%` : "0%";

      const icon = safeImage(icons?.data?.find(item => Number(item.targetId) === universeId)?.imageUrl);
      const thumbnailEntry = thumbs?.data?.find(item => Number(item.universeId || item.targetId) === universeId);
      const thumbnail = safeImage(thumbnailEntry?.thumbnails?.find(item => item.imageUrl)?.imageUrl || thumbnailEntry?.imageUrl);
      if (icon) $("icon").src = icon;
      if (thumbnail) $("thumbnail").src = thumbnail;
      else if (icon) $("thumbnail").src = icon;
      $("icon").alt = `${game.name} icon`;
      const checkedAt = Date.now();
      $("checked").textContent = "Just now";
      $("checkedExact").textContent = fullDateTime(checkedAt);
      $("checked").title = fullDateTime(checkedAt);
      setInterval(() => { $("checked").textContent = relativeTime(checkedAt); }, 60000);
      $("loading").hidden = true;
      $("page").classList.remove("hidden");
    } catch (error) {
      console.error("Game lookup failed:", error);
      fail("Could not load this game right now. Please try again later.");
    }
  }
  load();
})();
