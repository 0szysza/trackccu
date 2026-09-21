// Discord digest: one message, one embed per game — players now, change vs
// one hour ago, 24h and 7d peaks, rating and a 24h sparkline of block characters.
const WEBHOOK_PREFIXES = ["https://discord.com/api/webhooks/", "https://discordapp.com/api/webhooks/"];
const BLOCKS = "▁▂▃▄▅▆▇█";
const nf = new Intl.NumberFormat("en-US");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? nf.format(v) : "—");

function sparkline(points) {
  if (!points || points.length === 0) return "";
  const HOURS = 24;
  const end = Date.now();
  const start = end - HOURS * 3600000;
  const sums = new Array(HOURS).fill(0);
  const counts = new Array(HOURS).fill(0);
  for (const point of points) {
    const index = Math.min(HOURS - 1, Math.floor((Date.parse(point.t) - start) / 3600000));
    if (index < 0) continue;
    sums[index] += point.playing;
    counts[index] += 1;
  }
  const values = sums.map((s, i) => (counts[i] ? s / counts[i] : null)).filter((v) => v !== null);
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  return values.map((v) => (span === 0 ? BLOCKS[3] : BLOCKS[Math.round(((v - min) / span) * (BLOCKS.length - 1))])).join("");
}

function readingNear(points, secondsAgo) {
  const target = Date.now() / 1000 - secondsAgo;
  let best = null;
  for (const [t, playing] of points || []) {
    const distance = Math.abs(t - target);
    if (distance <= 600 && (!best || distance < best.distance)) best = { playing, distance };
  }
  return best ? best.playing : undefined;
}

function trendLine(now, before) {
  if (before === undefined) return "No reading from 1h ago yet";
  const diff = now - before;
  if (diff === 0) return "▬ unchanged vs 1h ago";
  const pct = before > 0 ? ` (${diff > 0 ? "+" : ""}${((diff / before) * 100).toFixed(1)}%)` : "";
  return `${diff > 0 ? "▲" : "▼"} ${diff > 0 ? "+" : "−"}${num(Math.abs(diff))}${pct} vs 1h ago`;
}

export async function sendDigest({ webhook, live, raw, history1d, siteUrl, games }) {
  if (!WEBHOOK_PREFIXES.some((prefix) => webhook.startsWith(prefix))) {
    throw new Error("DISCORD_WEBHOOK_URL is not a Discord webhook URL");
  }

  const embeds = live.map((game) => {
    const seed = games.find((g) => g.slug === game.slug);
    const spark = sparkline(history1d.series[game.slug]);
    const lines = [`**${num(game.playing)}** playing now`, trendLine(game.playing, readingNear(raw.games[game.slug], 3600))];
    if (spark) lines.push(`\`${spark}\` last 24h`);
    return {
      title: `${seed.short} · ${seed.name}`,
      url: `https://www.roblox.com/games/${seed.placeId}`,
      description: lines.join("\n"),
      color: seed.color,
      thumbnail: game.iconUrl ? { url: game.iconUrl } : undefined,
      fields: [
        { name: "24h peak", value: num(game.peak24h), inline: true },
        { name: "7d peak", value: num(game.peak7d), inline: true },
        { name: "Rating", value: game.ratingPercent === null ? "—" : `${game.ratingPercent}%`, inline: true },
      ],
    };
  });

  const site = siteUrl || "";
  const last = embeds[embeds.length - 1];
  last.footer = { text: "Data from the official Roblox API · updated every 5 minutes", ...(site ? { icon_url: `${site}/favicon.png` } : {}) };
  last.timestamp = new Date().toISOString();

  const total = live.reduce((sum, g) => sum + g.playing, 0);
  const unix = Math.floor(Date.now() / 1000);
  const payload = {
    username: "ROBLOX CCU Tracker",
    ...(site ? { avatar_url: `${site}/favicon.png` } : {}),
    content: `**${num(total)} players** across ${embeds.length} tracked games · <t:${unix}:t>${site ? `\n<${site}>` : ""}`,
    embeds,
    allowed_mentions: { parse: [] },
  };

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Discord webhook responded ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
}
