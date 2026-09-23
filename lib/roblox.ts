import { getTrackedGames, type TrackedGame } from "./games.js";

export interface LiveGameStats {
  slug: string;
  universeId: string;
  placeId: string;
  name: string;
  /** Name currently shown on Roblox, including event prefixes. */
  liveName: string | null;
  description: string | null;
  creator: string | null;
  creatorId: number | null;
  creatorType: string | null;
  createdAt: string | null;
  playing: number;
  visits: number | null;
  favorites: number | null;
  upVotes: number | null;
  downVotes: number | null;
  iconUrl: string | null;
}

const REQUEST_TIMEOUT_MS = 8000;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      console.warn(`Roblox API ${response.status} for ${url}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`Roblox API request failed for ${url}:`, error);
    return null;
  }
}

interface GamesResponse {
  data?: Array<{
    id: number;
    name?: string;
    description?: string;
    playing?: number;
    visits?: number;
    favoritedCount?: number;
    created?: string;
    creator?: { id?: number; name?: string; type?: string };
  }>;
}

interface VotesResponse {
  data?: Array<{ id: number; upVotes?: number; downVotes?: number }>;
}

interface IconsResponse {
  data?: Array<{ targetId: number; state?: string; imageUrl?: string }>;
}

export async function fetchLiveStats(
  games?: TrackedGame[],
): Promise<LiveGameStats[]> {
  const list = games ?? (await getTrackedGames());
  const universeIds = list.map((game) => game.universeId).join(",");

  const [details, votes, icons] = await Promise.all([
    fetchJson<GamesResponse>(
      `https://games.roblox.com/v1/games?universeIds=${universeIds}`,
    ),
    fetchJson<VotesResponse>(
      `https://games.roblox.com/v1/games/votes?universeIds=${universeIds}`,
    ),
    fetchJson<IconsResponse>(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeIds}&size=256x256&format=Png&isCircular=false&returnPolicy=PlaceHolder`,
    ),
  ]);

  if (!details?.data?.length) {
    throw new Error("Roblox games API returned no data");
  }

  const detailsById = new Map(
    details.data.map((entry) => [String(entry.id), entry]),
  );
  const votesById = new Map(
    (votes?.data ?? []).map((entry) => [String(entry.id), entry]),
  );
  const iconsById = new Map(
    (icons?.data ?? [])
      .filter((entry) => entry.imageUrl)
      .map((entry) => [String(entry.targetId), entry.imageUrl as string]),
  );

  const stats: LiveGameStats[] = [];

  for (const game of list) {
    const detail = detailsById.get(game.universeId);
    if (!detail || typeof detail.playing !== "number") continue;

    const vote = votesById.get(game.universeId);

    stats.push({
      slug: game.slug,
      universeId: game.universeId,
      placeId: game.placeId,
      name: game.name,
      liveName: detail.name ?? null,
      description: detail.description ?? null,
      creator: detail.creator?.name ?? null,
      creatorId: detail.creator?.id ?? null,
      creatorType: detail.creator?.type ?? null,
      createdAt: detail.created ?? null,
      playing: detail.playing,
      visits: detail.visits ?? null,
      favorites: detail.favoritedCount ?? null,
      upVotes: vote?.upVotes ?? null,
      downVotes: vote?.downVotes ?? null,
      iconUrl: iconsById.get(game.universeId) ?? null,
    });
  }

  if (stats.length === 0) {
    throw new Error("Roblox games API returned no data for tracked universes");
  }

  return stats;
}
