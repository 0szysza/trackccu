# BGSI image notifications

Monitors Bubble Gum Simulator INFINITY, universe `6504986360`, using its public Roblox APIs.

The workflow uses the existing `ping` repository dispatch and a five-minute schedule fallback. Runs are serialized. Triggers arriving within 150 seconds reuse the pending queue instead of polling twice. Standard GitHub-hosted runners are free for this public repository.

## Notifications

| Channel route | Trigger |
| --- | --- |
| `updates` | Roblox's game `updated` timestamp advances. The image shows the current game title, artwork, description and update time. |
| `events` | A previously unseen public event appears and has not ended. |
| `passes` | A previously unseen game pass ID appears, including off-sale passes. |
| `products` | A previously unseen developer product ID appears, including off-sale products. |

The game `updated` timestamp is a publication/change signal, not a guarantee of a major content update. Price changes to existing items do not cause alerts. New event announcements are sent when discovered; starting an already announced event does not cause another ping.

Each notification is a real PNG attachment, rendered with Chromium from HTML and the repository's `site.css`. Colors, typography, cards and controls follow TrackCCU. There are no authored Discord embeds. `@everyone` appears in message content, with `allowed_mentions.parse` set to `everyone`; links are enclosed in angle brackets to avoid link previews. The response is checked for PNG attachments and an active everyone mention.

The four destinations are configured in `.github/bgsi-webhooks.json`. Corresponding environment variables / Actions secrets (`BGSI_UPDATES_WEBHOOK`, `BGSI_EVENTS_WEBHOOK`, `BGSI_PASSES_WEBHOOK`, `BGSI_PRODUCTS_WEBHOOK`) override those values. Destination URLs are never included in generated images or logs.

## State and delivery

The `bgsi-alert-state` branch stores `bgsi-alert-state.json`. The first successful read of each source creates a quiet baseline: existing content is recorded without sending historical announcements. A failed API does not erase the previous source's baseline or known IDs. Pagination must complete successfully before any IDs are compared.

Detected changes enter a persisted queue. Before each Discord send, the affected jobs are saved as `sending`. A successful send records the delivered keys immediately. Up to ten PNGs from one category share a single message and everyone ping; up to eight messages are sent per run, with remaining work retained for subsequent runs.

Known Discord rate limits are retried. If a connection fails after transmission or a run stops during a send, its status is `uncertain` or `sending`. These jobs are not automatically pinged again. Inspect the relevant channel and Actions logs before deliberately changing them back to `pending`. This avoids blindly duplicating a message when Discord may already have received it.

State lives independently of the Pages deployment. Notifications continue even if a Pages deployment fails. The standalone workflow does not change the site's game history retention or hourly All chart.

## Verification

`node --test scripts/bgsi-alerts/test/*.test.mjs` verifies baselines, change detection, category routing, complete pagination, API failures, duplicate prevention, state persistence, image attachments and everyone mentions. Tests never contact the live Discord destinations.

A source push or manual workflow run also renders four preview PNGs to the `bgsi-notification-images` Actions artifact. These use current existing Roblox items and are labelled PREVIEW. They are not posted to Discord.

To run locally, provide `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, the four routes, and an installed Playwright Chromium runtime. `ALERT_TIME_ZONE` defaults to `Europe/Berlin`.
