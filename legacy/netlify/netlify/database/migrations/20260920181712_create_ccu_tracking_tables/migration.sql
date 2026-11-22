CREATE TABLE "ccu_snapshots" (
	"id" serial PRIMARY KEY,
	"universe_id" text NOT NULL,
	"playing" integer NOT NULL,
	"visits" bigint,
	"favorites" bigint,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_games" (
	"universe_id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"place_id" text NOT NULL,
	"name" text NOT NULL,
	"creator" text,
	"icon_url" text,
	"visits" bigint,
	"favorites" bigint,
	"up_votes" integer,
	"down_votes" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ccu_snapshots_universe_recorded_idx" ON "ccu_snapshots" ("universe_id","recorded_at");--> statement-breakpoint
CREATE INDEX "ccu_snapshots_recorded_idx" ON "ccu_snapshots" ("recorded_at");