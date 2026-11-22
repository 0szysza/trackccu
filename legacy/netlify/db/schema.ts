import {
  bigint,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Cached metadata for every game we track. Refreshed from the Roblox API on
 * each poll so the UI still has real names/thumbnails/visit counts to show
 * when Roblox is briefly unreachable.
 */
export const trackedGames = pgTable("tracked_games", {
  universeId: text("universe_id").primaryKey(),
  slug: text().notNull(),
  placeId: text("place_id").notNull(),
  name: text().notNull(),
  creator: text(),
  iconUrl: text("icon_url"),
  visits: bigint({ mode: "number" }),
  favorites: bigint({ mode: "number" }),
  upVotes: integer("up_votes"),
  downVotes: integer("down_votes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per game per poll: the actual concurrent-player history that powers
 * the chart and the peaks.
 */
export const ccuSnapshots = pgTable(
  "ccu_snapshots",
  {
    id: serial().primaryKey(),
    universeId: text("universe_id").notNull(),
    playing: integer().notNull(),
    visits: bigint({ mode: "number" }),
    favorites: bigint({ mode: "number" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ccu_snapshots_universe_recorded_idx").on(
      table.universeId,
      table.recordedAt,
    ),
    index("ccu_snapshots_recorded_idx").on(table.recordedAt),
  ],
);
