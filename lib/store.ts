import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { ccuSnapshots, trackedGames } from "../db/schema.js";
import type { LiveGameStats } from "./roblox.js";

/**
 * Minimum gap between two stored points for the same game. Sits just under the
 * 5 minute polling cadence, so page views cannot pack the series with extra
 * samples.
 */
export const MIN_SNAPSHOT_GAP_SECONDS = 240;

/** History older than this is pruned by the scheduled job. */
const RETENTION_DAYS = 90;

export interface RangeConfig {
  key: string;
  label: string;
  /** null means "everything we have stored". */
  seconds: number | null;
  bucketSeconds: number | null;
}

/** The three ranges offered by the chart. */
export const RANGES: Record<string, RangeConfig> = {
  "1d": { key: "1d", label: "1D", seconds: 86400, bucketSeconds: 300 },
  "7d": { key: "7d", label: "7D", seconds: 604800, bucketSeconds: 1800 },
  all: { key: "all", label: "All", seconds: null, bucketSeconds: null },
};

export const DEFAULT_RANGE = "1d";

/** Bucket sizes used for the all-time range, smallest first. */
const BUCKET_LADDER = [300, 900, 1800, 3600, 10800, 21600, 43200, 86400];

/** Aim for roughly this many points per line so long ranges stay readable. */
const TARGET_POINTS = 420;

/** Refresh the cached per-game metadata used as an offline fallback. */
export async function saveGameMetadata(stats: LiveGameStats[]): Promise<void> {
  for (const game of stats) {
    await db
      .insert(trackedGames)
      .values({
        universeId: game.universeId,
        slug: game.slug,
        placeId: game.placeId,
        name: game.liveName ?? game.name,
        creator: game.creator,
        iconUrl: game.iconUrl,
        visits: game.visits,
        favorites: game.favorites,
        upVotes: game.upVotes,
        downVotes: game.downVotes,
      })
      .onConflictDoUpdate({
        target: trackedGames.universeId,
        set: {
          slug: game.slug,
          placeId: game.placeId,
          name: game.liveName ?? game.name,
          creator: game.creator,
          iconUrl: game.iconUrl,
          visits: game.visits,
          favorites: game.favorites,
          upVotes: game.upVotes,
          downVotes: game.downVotes,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Append the current readings to the history table. Skips games that already
 * got a point within MIN_SNAPSHOT_GAP_SECONDS unless `force` is set, so a busy
 * page (or many visitors) cannot flood the series with duplicates.
 */
export async function recordSnapshots(
  stats: LiveGameStats[],
  { force = false }: { force?: boolean } = {},
): Promise<number> {
  let candidates = stats;

  if (!force) {
    const recent = await db
      .select({
        universeId: ccuSnapshots.universeId,
        lastRecordedAt: sql<string>`max(${ccuSnapshots.recordedAt})`,
      })
      .from(ccuSnapshots)
      .where(
        gte(
          ccuSnapshots.recordedAt,
          new Date(Date.now() - MIN_SNAPSHOT_GAP_SECONDS * 1000),
        ),
      )
      .groupBy(ccuSnapshots.universeId);

    const blocked = new Set(recent.map((row) => row.universeId));
    candidates = stats.filter((game) => !blocked.has(game.universeId));
  }

  if (candidates.length === 0) return 0;

  await db.insert(ccuSnapshots).values(
    candidates.map((game) => ({
      universeId: game.universeId,
      playing: game.playing,
      visits: game.visits,
      favorites: game.favorites,
    })),
  );

  return candidates.length;
}

export interface GamePeaks {
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
}

/**
 * Peaks and averages computed over the stored history, per game — plus,
 * for each peak window, *when* that peak was actually reached. `array_agg`
 * ordered by playing desc (ties broken by the earliest time) and filtered
 * to the window gives the recordedAt of the top row in one pass.
 */
export async function getPeaks(): Promise<Record<string, GamePeaks>> {
  const rows = await db
    .select({
      universeId: ccuSnapshots.universeId,
      peak24h: sql<number | null>`max(${ccuSnapshots.playing}) filter (where ${ccuSnapshots.recordedAt} >= now() - interval '24 hours')`,
      peak24hAt: sql<string | null>`(array_agg(${ccuSnapshots.recordedAt} order by ${ccuSnapshots.playing} desc, ${ccuSnapshots.recordedAt} asc) filter (where ${ccuSnapshots.recordedAt} >= now() - interval '24 hours'))[1]`,
      peak7d: sql<number | null>`max(${ccuSnapshots.playing}) filter (where ${ccuSnapshots.recordedAt} >= now() - interval '7 days')`,
      peak7dAt: sql<string | null>`(array_agg(${ccuSnapshots.recordedAt} order by ${ccuSnapshots.playing} desc, ${ccuSnapshots.recordedAt} asc) filter (where ${ccuSnapshots.recordedAt} >= now() - interval '7 days'))[1]`,
      peak30d: sql<number | null>`max(${ccuSnapshots.playing}) filter (where ${ccuSnapshots.recordedAt} >= now() - interval '30 days')`,
      peak30dAt: sql<string | null>`(array_agg(${ccuSnapshots.recordedAt} order by ${ccuSnapshots.playing} desc, ${ccuSnapshots.recordedAt} asc) filter (where ${ccuSnapshots.recordedAt} >= now() - interval '30 days'))[1]`,
      low24h: sql<number | null>`min(${ccuSnapshots.playing}) filter (where ${ccuSnapshots.recordedAt} >= now() - interval '24 hours')`,
      average24h: sql<number | null>`cast(round(avg(${ccuSnapshots.playing}) filter (where ${ccuSnapshots.recordedAt} >= now() - interval '24 hours')) as int)`,
      peakAllTime: sql<number | null>`max(${ccuSnapshots.playing})`,
      peakAllTimeAt: sql<string | null>`(array_agg(${ccuSnapshots.recordedAt} order by ${ccuSnapshots.playing} desc, ${ccuSnapshots.recordedAt} asc))[1]`,
      samples: sql<number>`count(*)`,
      trackingSince: sql<string | null>`min(${ccuSnapshots.recordedAt})`,
    })
    .from(ccuSnapshots)
    .groupBy(ccuSnapshots.universeId);

  const result: Record<string, GamePeaks> = {};

  const iso = (value: string | null) => (value ? new Date(value).toISOString() : null);

  for (const row of rows) {
    result[row.universeId] = {
      peak24h: numberOrNull(row.peak24h),
      peak24hAt: iso(row.peak24hAt),
      peak7d: numberOrNull(row.peak7d),
      peak7dAt: iso(row.peak7dAt),
      peak30d: numberOrNull(row.peak30d),
      peak30dAt: iso(row.peak30dAt),
      low24h: numberOrNull(row.low24h),
      average24h: numberOrNull(row.average24h),
      peakAllTime: numberOrNull(row.peakAllTime),
      peakAllTimeAt: iso(row.peakAllTimeAt),
      samples: Number(row.samples ?? 0),
      trackingSince: row.trackingSince ? new Date(row.trackingSince).toISOString() : null,
    };
  }

  return result;
}

export interface HistoryPoint {
  t: string;
  playing: number;
  peak: number;
}

/**
 * Time-bucketed series for one range, keyed by universe ID. Averaging inside
 * each bucket keeps long ranges readable without dropping real samples.
 */
export async function getHistory(
  rangeKey: string,
): Promise<{
  range: RangeConfig;
  bucketSeconds: number;
  since: string | null;
  series: Record<string, HistoryPoint[]>;
}> {
  const range = RANGES[rangeKey] ?? RANGES[DEFAULT_RANGE];

  let since: Date | null = null;
  let bucketSeconds: number;

  if (range.seconds !== null) {
    since = new Date(Date.now() - range.seconds * 1000);
    bucketSeconds = range.bucketSeconds ?? 300;
  } else {
    const [oldest] = await db
      .select({ first: sql<string | null>`min(${ccuSnapshots.recordedAt})` })
      .from(ccuSnapshots);

    const firstAt = oldest?.first ? new Date(oldest.first).getTime() : Date.now();
    const spanSeconds = Math.max(1, (Date.now() - firstAt) / 1000);
    bucketSeconds =
      BUCKET_LADDER.find((size) => spanSeconds / size <= TARGET_POINTS) ??
      BUCKET_LADDER[BUCKET_LADDER.length - 1];
  }

  const bucket = sql<string>`to_timestamp(floor(extract(epoch from ${ccuSnapshots.recordedAt}) / ${bucketSeconds}) * ${bucketSeconds})`;

  const base = db
    .select({
      universeId: ccuSnapshots.universeId,
      bucket,
      playing: sql<number>`cast(round(avg(${ccuSnapshots.playing})) as int)`,
      peak: sql<number>`max(${ccuSnapshots.playing})`,
    })
    .from(ccuSnapshots);

  const rows = await (since ? base.where(gte(ccuSnapshots.recordedAt, since)) : base)
    .groupBy(ccuSnapshots.universeId, bucket)
    .orderBy(bucket);

  const series: Record<string, HistoryPoint[]> = {};

  for (const row of rows) {
    const list = (series[row.universeId] ??= []);
    list.push({
      t: new Date(row.bucket).toISOString(),
      playing: Number(row.playing),
      peak: Number(row.peak),
    });
  }

  return {
    range,
    bucketSeconds,
    since: since ? since.toISOString() : null,
    series,
  };
}

export async function getLatestSnapshots(): Promise<
  Record<string, { playing: number; recordedAt: string }>
> {
  const rows = await db
    .select({
      universeId: ccuSnapshots.universeId,
      playing: sql<number>`(array_agg(${ccuSnapshots.playing} order by ${ccuSnapshots.recordedAt} desc))[1]`,
      recordedAt: sql<string>`max(${ccuSnapshots.recordedAt})`,
    })
    .from(ccuSnapshots)
    .groupBy(ccuSnapshots.universeId);

  const result: Record<string, { playing: number; recordedAt: string }> = {};
  for (const row of rows) {
    result[row.universeId] = {
      playing: Number(row.playing),
      recordedAt: new Date(row.recordedAt).toISOString(),
    };
  }
  return result;
}

export async function getReadingsNear(
  secondsAgo: number,
): Promise<Record<string, number>> {
  const target = Date.now() - secondsAgo * 1000;
  const windowMs = 10 * 60 * 1000;

  const rows = await db
    .select({
      universeId: ccuSnapshots.universeId,
      playing: ccuSnapshots.playing,
      recordedAt: ccuSnapshots.recordedAt,
    })
    .from(ccuSnapshots)
    .where(
      and(
        gte(ccuSnapshots.recordedAt, new Date(target - windowMs)),
        lte(ccuSnapshots.recordedAt, new Date(target + windowMs)),
      ),
    );

  const best = new Map<string, { playing: number; distance: number }>();
  for (const row of rows) {
    const distance = Math.abs(new Date(row.recordedAt).getTime() - target);
    const current = best.get(row.universeId);
    if (!current || distance < current.distance) {
      best.set(row.universeId, { playing: row.playing, distance });
    }
  }

  return Object.fromEntries(
    [...best].map(([universeId, value]) => [universeId, value.playing]),
  );
}

export async function getCachedGames() {
  return db.select().from(trackedGames);
}

export async function pruneOldSnapshots(): Promise<void> {
  await db
    .delete(ccuSnapshots)
    .where(
      and(
        sql`${ccuSnapshots.recordedAt} < now() - interval '${sql.raw(String(RETENTION_DAYS))} days'`,
      ),
    );
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
