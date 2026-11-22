# TrackCCU operations

## Build and checks

Use Node 24. `npm ci --ignore-scripts`, `npm run check`, then `npm run build` produces `_site/`. Tailwind is compiled to `utility.css`; there is no runtime Tailwind CDN. Static assets and module imports receive a content version during the build. Do not publish the source tree: the output whitelist excludes collectors, tests, operational state and legacy backend code.

Edit `scripts/games.json` or `scripts/groups.json` to change the catalog. `scripts/sync-games.mjs` generates the per-game/per-group pages from the templates and synchronizes the catalog in `site.js`. `npm run build` runs it automatically for `_site`; `node scripts/sync-games.mjs` updates the tracked generated source copies. Most artwork comes from Roblox; local icons are optional fallbacks. See `assets/README.md`.

## Data lifecycle

`update.yml` accepts the existing `ping` dispatch, a five-minute schedule fallback, source pushes and manual runs. One serialized writer collects data. Scheduled/dispatch duplicates within 150 seconds of a saved checkpoint skip collection and deployment. GitHub schedules are best effort, not an exact clock.

Collectors validate the prior state, then fetch Roblox with timeouts and bounded retries. On the first migration they read the published `data/` files. Afterwards `tracker-data/data/` is the source of truth, even when Pages is unavailable. A missing archive is an error, including a public 404; do not use bootstrap as a recovery shortcut.

Before application checks/build/deployment, the validated snapshot is saved on `tracker-data`. Failed frontend checks or a failed Pages deployment do not discard it. Its manifest contains per-file SHA-256 checksums and `savedAt`; a stale snapshot cannot replace newer retained samples. The managed branch contains **one reachable snapshot**, written with a compare-and-swap (`--force-with-lease`) against its previously read commit. Do not keep manual source changes on that branch. This bounds reachable Git history rather than appending large JSON snapshots every five minutes. GitHub controls eventual collection of unreachable Git objects.

Once per UTC day, the workflow also uploads `tracker-checkpoint-YYYY-MM-DD` as an independent Actions artifact with 14-day retention. The backup is marked complete only after upload succeeds. The archive contains raw game/group history, offers/events archive and cached live metadata; projections are regenerated from raw data. Download the artifact when investigating an incident. Artifacts expire: save an external copy for retention beyond 14 days. Monitor repository/artifact storage as the catalog grows.

Raw samples retain 90 days. `meta.ledger` preserves the earliest known tracking timestamp and lifetime CCU peak independently of this window. The All chart is the retained hourly projection, not an unlimited raw archive. This migration cannot reconstruct samples or earlier records that had already been lost before it ran. New aggregates preserve `peakAt`, the actual measurement time; older buckets with no such field are labelled as an approximate hour.

Partial API responses preserve the catalog and cached values with `stale` and `measuredAt`. They do not append invented measurements. A missing metric is `null`; incomplete game totals/shares/leaderboards and group sums are unavailable rather than zero. Offer archives preserve missing products and their price histories, marking them unavailable. Price charts extend only to the last successful observation of that item, never to the current clock by assumption.

## Recovery

1. Keep a copy of the current `tracker-data` snapshot and download a daily recovery artifact.
2. Unzip the Actions artifact to obtain `checkpoint-YYYY-MM-DD.json.gz`.
3. Inspect it in a fresh directory: `node scripts/checkpoint.mjs restore checkpoint-YYYY-MM-DD.json.gz recovered/data`. Existing files are refused unless `--replace` is explicitly supplied. This command never pushes by itself.
4. Validate the chosen archive and compare newest sample times to the currently saved snapshot. Restore deliberately in a maintenance window with automatic writers stopped; do not silently replace newer state. A normal workflow save rejects a rollback.
5. For recovery to an older valid archive after confirmed corruption, prepare an isolated checkout of the managed branch, replace its `data/` from the inspected recovery folder, regenerate checksums/manifest with `saveCheckpoint` in a fresh checkpoint directory, and review before publishing the replacement with a lease on the current branch commit. Resume the normal update workflow without bootstrap. The next run regenerates history projections.

`ALLOW_DATA_BOOTSTRAP=true` (or the manual workflow's bootstrap input) is only for a genuinely new tracker with no history to preserve. A network failure or malformed archive is still refused. `Published tracker health` independently checks public game/group freshness; it fails above 20 minutes and warns on incomplete data. Actions notifications follow the repository owner's GitHub settings. No new Discord monitoring messages are sent.

## Discord delivery

Webhook values in `.github/bgsi-webhooks.json` remain public by the owner's explicit decision. The build continues exposing `debug/webhooks.json`. This is **not** an authentication or anti-abuse boundary: anyone who obtains the URL can invoke Discord directly. Do not describe browser cooldowns or URL validation as token protection.

`shared/discord-webhook.mjs` is shared by BGSI image alerts, browser test sends and the hourly digest. Only Discord incoming-webhook URLs are accepted. Requests have a timeout and require a confirmed response. Known rate limits may be retried; a timeout, dropped connection or ambiguous response is never blindly resent.

The hourly digest uses the existing `DISCORD_WEBHOOK_URL` Actions secret and its own persisted jobs in `tracker-data/data/digest-state.json`. It saves `sending` before POST, then records the confirmed message ID. `sending`/`uncertain` jobs need channel inspection before an operator deliberately requeues them. Confirmed old jobs are pruned; uncertain records remain available for diagnosis. Incomplete snapshots do not produce a digest. Daily history backups do not restore delivery jobs: keep delivery state separate when recovering old measurement data to avoid duplicate notifications.

BGSI's separate `bgsi-alert-state` branch, four category routes, baseline and batching behavior remain in place. See `scripts/bgsi-alerts/README.md`. Tests use fake fetch/send implementations and never post to configured channels.

## Frontend and legacy code

The current palette, page layout, artwork and tool navigation are retained. Decorative glow, pulsing and hover growth have been reduced. Visible warnings distinguish failed, partial and old data; last good readings are retained. Charts break across long gaps and offer a paginated, keyboard-accessible data table with full-period CSV. Compare exports percentages in Share mode and counts in Players mode. Group metric tabs support arrows/Home/End; chart range sliders support arrow keys.

The inactive Netlify/Drizzle implementation is preserved under `legacy/netlify/`, with its old dependencies. It is not built, deployed or contract-compatible with Pages. Do not move it back into production without a separate migration and contract tests.
