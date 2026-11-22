import type { Config } from "@netlify/functions";
import { fetchLiveStats } from "../../lib/roblox.js";
import {
  pruneOldSnapshots,
  recordSnapshots,
  saveGameMetadata,
} from "../../lib/store.js";

/**
 * Scheduled poll. Without this the history would only have points for the
 * minutes somebody happened to have the page open; with it the series keeps
 * growing at a steady five minute cadence around the clock.
 *
 * Old rows are pruned once an hour (on the :00 run) rather than every time.
 */
export default async () => {
  try {
    const stats = await fetchLiveStats();
    await saveGameMetadata(stats);
    const written = await recordSnapshots(stats, { force: true });

    if (new Date().getUTCMinutes() < 5) {
      await pruneOldSnapshots().catch((error) =>
        console.error("Prune failed:", error),
      );
    }

    console.log(`Scheduled poll stored ${written} snapshot(s).`);
  } catch (error) {
    console.error("Scheduled poll failed:", error);
  }

  return new Response(null, { status: 204 });
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
