import { getTrackedGames, type TrackedGame } from "./games.js";
import { fetchLiveStats, type LiveGameStats } from "./roblox.js";
import { getHistory, getPeaks, getReadingsNear, type GamePeaks } from "./store.js";

/**
 * Discord webhook digest: one message with one embed per tracked game —
 * players now, change vs one hour ago, 24h and 7d peaks, rating and a 24h
 * sparkline drawn with block characters.
 *
 * Needs the DISCORD_WEBHOOK_URL environment variable (Netlify → Site
 * configuration → Environment variables). Nothing is sent without it.
 */

const WEBHOOK_PREFIXES = [
  "https://discord.com/api/webhooks/",
  "https://discordapp.com/api/webhooks/",
];

const BLOCKS = "▁▂▃▄▅▆▇█";
const nf = new Intl.NumberFormat("en-US");

const num = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? nf.format(value) : "—";

/** Public site URL, used for the avatar and the embed link. */
function siteUrl(): string | null {
  const raw = process.env.SITE_URL || process.env.URL || "";
  return raw ? raw.replace(/\/+$/, "") : null;
}

/** 24 hourly averages of a series → a string like ▂▃▅▆▇█▇▅▄▃. */
function sparkline(points: Array<{ t: string; playing: number }>): string {
  if (points.length === 0) return "";

  const HOURS = 24;
  const end = Date.now();
  const start = end - HOURS * 3600 * 1000;
  const sums = new Array<number>(HOURS).fill(0);
  const counts = new Array<number>(HOURS).fill(0);

  for (const point of points) {
    const time = new Date(point.t).getTime();
    const index = Math.min(HOURS - 1, Math.floor((time - start) / 3600000));
    if (index < 0) continue;
    sums[index] += point.playing;
    counts[index] += 1;
  }

  const values = sums
    .map((sum, index) => (counts[index] ? sum / counts[index] : null))
    .filter((value): value is number => value !== null);
  if (values.length < 2) return "";

  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  return values
    .map((value) =>
      span === 0
        ? BLOCKS[3]
        : BLOCKS[Math.round(((value - min) / span) * (BLOCKS.length - 1))],
    )
    .join("");
}

function trendLine(now: number, before: number | undefined): string {
  if (before === undefined) return "No reading from 1h ago yet";
  const diff = now - before;
  if (diff === 0) return "▬ unchanged vs 1h ago";
  const pct = before > 0 ? ` (${diff > 0 ? "+" : ""}${((diff / before) * 100).toFixed(1)}%)` : "";
  return `${diff > 0 ? "▲" : "▼"} ${diff > 0 ? "+" : "−"}${num(Math.abs(diff))}${pct} vs 1h ago`;
}

function buildEmbed(
  game: TrackedGame,
  stats: LiveGameStats,
  extras: {
    peak24h: number | null;
    peak7d: number | null;
    hourAgo: number | undefined;
    spark: string;
  },
) {
  const gameUrl = `https://www.roblox.com/games/${game.placeId}`;
  const votes = (stats.upVotes ?? 0) + (stats.downVotes ?? 0);
  const rating = votes > 0 ? `${Math.round(((stats.upVotes ?? 0) / votes) * 100)}%` : "—";

  const lines = [
    `**${num(stats.playing)}** playing now`,
    trendLine(stats.playing, extras.hourAgo),
  ];
  if (extras.spark) lines.push(`\`${extras.spark}\` last 24h`);

  return {
    title: `${game.short} · ${game.name}`,
    url: gameUrl,
    description: lines.join("\n"),
    color: game.color,
    thumbnail: stats.iconUrl ? { url: stats.iconUrl } : undefined,
    fields: [
      { name: "24h peak", value: num(extras.peak24h), inline: true },
      { name: "7d peak", value: num(extras.peak7d), inline: true },
      { name: "Rating", value: rating, inline: true },
    ],
  };
}

/** Builds the webhook body from live Roblox data plus stored history. */
export async function buildDigestPayload() {
  const games = await getTrackedGames();
  const [stats, peaks, hourAgo, history] = await Promise.all([
    fetchLiveStats(games),
    getPeaks().catch((): Record<string, GamePeaks> => ({})),
    getReadingsNear(3600).catch((): Record<string, number> => ({})),
    getHistory("1d").catch(() => null),
  ]);

  const statsBySlug = new Map(stats.map((entry) => [entry.slug, entry]));
  const embeds = [];
  let total = 0;

  for (const game of games) {
    const live = statsBySlug.get(game.slug);
    if (!live) continue;
    total += live.playing;

    embeds.push(
      buildEmbed(game, live, {
        peak24h: peaks[game.universeId]?.peak24h ?? null,
        peak7d: peaks[game.universeId]?.peak7d ?? null,
        hourAgo: hourAgo[game.universeId],
        spark: sparkline(history?.series[game.universeId] ?? []),
      }),
    );
  }

  if (embeds.length === 0) throw new Error("No game data available for the digest");

  // Only the last embed carries the footer + timestamp, so it reads as the
  // signature of the whole message.
  const site = siteUrl();
  const last = embeds[embeds.length - 1] as Record<string, unknown>;
  last.footer = {
    text: "Data from the official Roblox API · updated every 5 minutes",
    ...(site ? { icon_url: `${site}/favicon.png` } : {}),
  };
  last.timestamp = new Date().toISOString();

  const unix = Math.floor(Date.now() / 1000);
  return {
    username: "ROBLOX CCU Tracker",
    ...(site ? { avatar_url: `${site}/favicon.png` } : {}),
    content: `**${num(total)} players** across ${embeds.length} tracked games · <t:${unix}:t>${site ? `\n<${site}>` : ""}`,
    embeds,
    // Never ping anyone from an automated post.
    allowed_mentions: { parse: [] as string[] },
  };
}

export type DigestResult =
  | { sent: true; games: number }
  | { sent: false; reason: "no_webhook" | "invalid_webhook" };

export async function sendDiscordDigest(): Promise<DigestResult> {
  const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhook) return { sent: false, reason: "no_webhook" };
  if (!WEBHOOK_PREFIXES.some((prefix) => webhook.startsWith(prefix))) {
    return { sent: false, reason: "invalid_webhook" };
  }

  const payload = await buildDigestPayload();
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord webhook responded ${response.status}: ${body.slice(0, 300)}`);
  }

  return { sent: true, games: payload.embeds.length };
}
