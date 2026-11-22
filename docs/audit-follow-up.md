# Follow-up to the 2026-11-22 audit

Scope: 0szysza.github.io, stat and trackccu. The owner requested preserving the visual design and removing only excessive ornament. No framework migration was introduced.

| Finding | Implementation / decision |
| --- | --- |
| S01 | Explicit owner exception: public webhook values remain unchanged. Shared validated transport and durable delivery state improve reliability, not secrecy. |
| D01 | Extras fallback archive is in the correct scope; failing-source regression test retains prior data. |
| D02 | Independent checksum-validated checkpoint, rollback guard, daily bounded-retention recovery artifacts, tested backup restore and single-snapshot publishing with a lease. |
| D03 | Full catalog remains present; missing readings are stale/unknown, totals and shares unavailable when incomplete; group totals require complete details. |
| D04 | Independent lifetime metadata ledger before raw retention is applied. Already lost historical records cannot be recreated. |
| D05 | Raw measurement timestamps in new peak summaries/aggregates; approximate labels for older hourly data. |
| D06 | Shared segmented SVG lines/fills, navigator gaps and hover tolerance. |
| D07 | Disappeared products remain archived; returning IDs keep their price history. |
| D08 | Price line extends to last successful item observation; timestamp and unavailable state are visible. |
| J01 | Data is persisted before frontend checks/build/Pages deployment; cron fallback, duplicate-trigger guard and independent freshness check. Full static Pages publication still projects each fresh snapshot. |
| J02 | Persisted hourly delivery jobs with sending/sent/uncertain states and confirmed message IDs. |
| H01 | Three-way field merge, explicit overlapping edit conflict choices and last-stored-value check. |
| H02 | Import is explicitly labelled as adding missing pets while keeping existing records. |
| H03 | Tag counts computed once per collection/view change; pet DOM reused for unchanged records. |
| C01 | Shared date-picker and number-controls modules, domain models preserved. |
| U01 | Group metric roving tab focus with arrows/Home/End. |
| U02 | Selected-period data tables, pagination and CSV on game/group/comparison charts. |
| U03 | Visible failed/partial/stale notices, retained last-good data, Retry, source-specific freshness and request coalescing. |
| U04 | Discord username copy controls instead of invalid username-as-ID profile URLs, across all three sites. |
| P01 | Compiled Tailwind CSS and content-versioned local assets. |
| A01 | Inactive backend preserved and clearly archived outside active build/deployment. |
| A02 | Current build, catalog, API, delivery, backup and recovery documentation. |
| T01 | Lint and domain/collector/failure tests gate publication in all three repositories. |

Automated tests cover confirmed audit regressions with mocked HTTP/Discord. They do not prove the absence of every possible defect, guarantee third-party API availability, or replace long-running operational monitoring. Browser verification is recorded in the change description.
