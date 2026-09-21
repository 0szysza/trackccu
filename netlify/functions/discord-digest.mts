import type { Config } from "@netlify/functions";
import { sendDiscordDigest } from "../../lib/discord.js";

// Posts the CCU digest to Discord once an hour (on the hour, UTC).
//
// To change how often it posts, edit the cron expression in `config` below:
//   "0 * * * *"      every hour
//   "0 0,6,12,18 * * *"   every 6 hours
//   "0 9,21 * * *"   09:00 and 21:00 UTC
export default async () => {
  try {
    const result = await sendDiscordDigest();
    if (result.sent) {
      console.log(`Discord digest sent (${result.games} games).`);
    } else {
      console.log(`Discord digest skipped: ${result.reason}.`);
    }
  } catch (error) {
    console.error("Discord digest failed:", error);
  }

  return new Response(null, { status: 204 });
};

export const config: Config = {
  schedule: "0 * * * *",
};
