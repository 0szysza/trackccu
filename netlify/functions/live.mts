import type { Config, Context } from "@netlify/functions";
import { getTrackedGames } from "../../lib/games.js";
import { fetchLiveStats, type LiveGameStats } from "../../lib/roblox.js";
import {
  getCachedGames,
  getLatestSnapshots,
  getPeaks,
  recordSnapshots,
  saveGameMetadata,
} from "../../lib/store.js";

interface GamePayload extends LiveGameStats {
  ratingPercent: number | null;
  sharePercent: number;
  peak24h: number | null;
  peak24hAt: string | null;
  peak7d: number | null;
  peak7dAt: string | null;
  peak30d: number | null;
  peak30dAt: string | null;
  peakAllTime: number | null;
  peakAllTimeAt: string | null;
  average24h: number | null;
  low24h: number | null;
  samples: number;
  trackingSince: string | null;
  stale: boolean;
  measuredAt: string;
}

export default async (_req: Request, context: Context) => {
  const fetchedAt = new Date().toISOString();

  let stats: LiveGameStats[];
  let source: "roblox" | "database" = "roblox";
  let warning: string | null = null;

  try {
    stats = await fetchLiveStats();
    context.waitUntil(
      (async () => {
        try {
          await saveGameMetadata(stats);
          await recordSnapshots(stats);
        } catch (error) {
          console.error("Failed to persist snapshot:", error);
        }
      })(),
    );
  } catch (error) {
    console.error("Live fetch from Roblox failed, serving stored data:", error);
    source = "database";
    warning = "Roblox did not respond — showing the last stored reading.";
    stats = await buildFallbackStats();
  }

  const [peaks, latest] = await Promise.all([
    getPeaks().catch(() => ({})),
    source === "database" ? getLatestSnapshots().catch(() => ({})) : Promise.resolve({}),
  ]);

  const totalPlaying = stats.reduce((sum, game) => sum + game.playing, 0);

  const games: GamePayload[] = stats.map((game) => {
    const peak = peaks[game.universeId];
    const votesTotal = (game.upVotes ?? 0) + (game.downVotes ?? 0);
    const stored = latest[game.universeId];

    return {
      ...game,
      ratingPercent: votesTotal > 0 ? Math.round(((game.upVotes ?? 0) / votesTotal) * 100) : null,
      sharePercent: totalPlaying > 0 ? Math.round((game.playing / totalPlaying) * 1000) / 10 : 0,
      peak24h: peak?.peak24h ?? null,
      peak24hAt: peak?.peak24hAt ?? null,
      peak7d: peak?.peak7d ?? null,
      peak7dAt: peak?.peak7dAt ?? null,
      peak30d: peak?.peak30d ?? null,
      peak30dAt: peak?.peak30dAt ?? null,
      peakAllTime: peak?.peakAllTime ?? null,
      peakAllTimeAt: peak?.peakAllTimeAt ?? null,
      average24h: peak?.average24h ?? null,
      low24h: peak?.low24h ?? null,
      samples: peak?.samples ?? 0,
      trackingSince: peak?.trackingSince ?? null,
      stale: source === "database",
      measuredAt: stored?.recordedAt ?? fetchedAt,
    };
  });

  const sorted = [...games].sort((a, b) => b.playing - a.playing);
  const leader = sorted[0] ?? null;
  const runnerUp = sorted[1] ?? null;

  return Response.json(
    {
      ok: true,
      source,
      warning,
      fetchedAt,
      totalPlaying,
      games,
      leaderSlug: leader?.slug ?? null,
      delta: leader && runnerUp ? leader.playing - runnerUp.playing : 0,
    },
    { headers: { "cache-control": "no-store" } },
  );
};

async function buildFallbackStats(): Promise<LiveGameStats[]> {
  const [trackedGames, cached, latest] = await Promise.all([
    getTrackedGames(),
    getCachedGames().catch(() => []),
    getLatestSnapshots().catch(() => ({})),
  ]);

  const cachedById = new Map(cached.map((row) => [row.universeId, row]));
  const knownUniverseIds = new Set(trackedGames.map((game) => game.universeId));

  return trackedGames.map((game) => {
    const row = cachedById.get(game.universeId);
    const snapshot = latest[game.universeId];

    return {
      slug: game.slug,
      universeId: game.universeId,
      placeId: game.placeId,
      name: game.name,
      liveName: row?.name ?? null,
      description: null,
      creator: row?.creator ?? null,
      creatorId: null,
      creatorType: null,
      createdAt: null,
      playing: snapshot?.playing ?? 0,
      visits: row?.visits ?? null,
      favorites: row?.favorites ?? null,
      upVotes: row?.upVotes ?? null,
      downVotes: row?.downVotes ?? null,
      iconUrl: row?.iconUrl ?? null,
    } satisfies LiveGameStats;
  }).filter((game) => knownUniverseIds.has(game.universeId));
}

export const config: Config = {
  path: "/api/live",
  method: "GET",
};
