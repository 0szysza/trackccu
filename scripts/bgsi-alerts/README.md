# BGSI Discord notifications

Monitors Bubble Gum Simulator INFINITY, universe `6504986360`, using its public Roblox APIs.

The workflow uses the existing `ping` repository dispatch and a five-minute schedule fallback. Runs are serialized. Triggers arriving within 150 seconds reuse the pending queue instead of polling twice.

## Notifications

| Channel route | Trigger |
| --- | --- |
| `updates` | Roblox's game `updated` timestamp advances. The PNG includes the current game title, description, update time, player count, favorites and the published starting-place version when Roblox provides it. |
| `events` | A previously unseen public event appears and has not ended. |
| `passes` | A previously unseen game pass ID appears, including off-sale passes. |
| `products` | A previously unseen developer product ID appears, including off-sale products. |

The game `updated` timestamp is a publication/change signal, not a guarantee of a major content update. Price changes to existing items do not cause alerts. New event announcements are sent when discovered; starting an already announced event does not cause another ping.

Events, passes and developer products use native Discord embeds. Game updates attach a rendered PNG. Live alerts send `@everyone`; the debug page starts with mentions off and labels each sample as a test.

The four destinations are configured in `.github/bgsi-webhooks.json`. Corresponding environment variables / Actions secrets (`BGSI_UPDATES_WEBHOOK`, `BGSI_EVENTS_WEBHOOK`, `BGSI_PASSES_WEBHOOK`, `BGSI_PRODUCTS_WEBHOOK`) override those values. An optional `BGSI_PLACE_HISTORY_API_KEY` Actions secret enables published version lookup. It requires Roblox's `universe.place:read` scope for the BGSI experience. The version field is omitted if no authorized reading is available.

## State and delivery

The `bgsi-alert-state` branch stores `bgsi-alert-state.json`. The first successful read of each source creates a quiet baseline: existing content is recorded without sending historical announcements. A failed API does not erase the previous source's baseline or known IDs. Pagination must complete successfully before any IDs are compared.

Detected changes enter a persisted queue. Before each Discord send, the affected jobs are saved as `sending`. A successful send records the delivered keys immediately. Up to ten embeds from one category share one message and everyone ping within Discord's 6,000-character limit. Update images are sent individually; up to eight messages are sent per run, with remaining work retained for subsequent runs.

Known Discord rate limits are retried. If a connection fails after transmission or a run stops during a send, its status is `uncertain` or `sending`. These jobs are not automatically pinged again. Inspect the relevant channel and Actions logs before deliberately changing them back to `pending`. This avoids blindly duplicating a message when Discord may already have received it.

State lives independently of the Pages deployment. Notifications continue even if a Pages deployment fails. The standalone workflow does not change the site's game history retention or hourly All chart.

## Verification

`node --test scripts/bgsi-alerts/test/*.test.mjs` verifies baselines, change detection, category routing, complete pagination, API failures, duplicate prevention, state persistence, embeds and everyone mentions. Tests never contact the live Discord destinations.

Use the TrackCCU debug page to send one sample per category. Updates use a bundled sample PNG and embed tests use published BGSI data.

To run locally, provide `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and the four configured Discord destinations.

## Shared transport

Delivery now uses `shared/discord-webhook.mjs`, also used by browser debug sends and the hourly digest. It validates exact Discord webhook destinations, adds `wait=true`, enforces a request timeout, handles known 429 delays and checks confirmation. Ambiguous network/server outcomes retain the existing no-blind-resend behavior.

The owner explicitly chose to retain the public route configuration. The debug page remains a real send tool, not a dry-run sandbox. Unit tests use fake routes/HTTP and do not send messages. See `docs/operations.md` for measurement backups and the independent hourly digest queue.
