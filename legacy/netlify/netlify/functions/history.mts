import type { Config } from "@netlify/functions";
import { getTrackedGames } from "../../lib/games.js";
import { DEFAULT_RANGE, RANGES, getHistory } from "../../lib/store.js";

/**
 * Time series behind the chart. `?range=` accepts 1d, 7d or all; anything else
 * falls back to the default range instead of erroring, so a stale bookmark
 * still renders a chart.
 */
export default async (req: Request) => {
  const requested = new URL(req.url).searchParams.get("range") ?? DEFAULT_RANGE;
  const rangeKey = requested in RANGES ? requested : DEFAULT_RANGE;

  try {
    const [{ range, bucketSeconds, since, series }, trackedGames] = await Promise.all([
      getHistory(rangeKey),
      getTrackedGames(),
    ]);

    // Key the payload by slug so the front-end never has to know universe IDs.
    const bySlug: Record<string, unknown> = {};
    for (const game of trackedGames) {
      bySlug[game.slug] = series[game.universeId] ?? [];
    }

    return Response.json(
      {
        ok: true,
        range: range.key,
        bucketSeconds,
        since,
        generatedAt: new Date().toISOString(),
        series: bySlug,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("History query failed:", error);
    return Response.json(
      { ok: false, range: rangeKey, series: {}, error: "history_unavailable" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
};

export const config: Config = {
  path: "/api/history",
  method: "GET",
};
