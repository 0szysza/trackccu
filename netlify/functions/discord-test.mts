import type { Config } from "@netlify/functions";
import { sendDiscordDigest } from "../../lib/discord.js";

/**
 * Sends the Discord digest right now, so the webhook can be checked without
 * waiting for the top of the hour:
 *
 *   https://<your-site>.netlify.app/api/discord-test?key=<ADMIN_KEY>
 *
 * Requires the ADMIN_KEY environment variable; without it the endpoint
 * behaves as if it does not exist, so nobody can trigger posts by guessing.
 */
export default async (req: Request) => {
  const adminKey = process.env.ADMIN_KEY;
  const provided = new URL(req.url).searchParams.get("key");

  if (!adminKey || provided !== adminKey) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await sendDiscordDigest();
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Discord test failed:", error);
    return Response.json(
      { sent: false, reason: "error", message: String(error) },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
};

export const config: Config = {
  path: "/api/discord-test",
  method: "GET",
};
