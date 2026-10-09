# CCU Tracker

Roblox player counts, group members and their history in one place.

**[Open the tracker](https://0szysza.github.io/trackccu/)** · [Games](https://0szysza.github.io/trackccu/games) · [Groups](https://0szysza.github.io/trackccu/groups) · [Compare](https://0szysza.github.io/trackccu/compare)

## Features

### Games

| Feature | What it does |
| --- | --- |
| Game discovery | Search the tracked catalog by name and reverse the player-count ranking. A Roblox game link or place ID can open a lookup for an untracked game. |
| Live overview | Current CCU, one-hour and 24-hour changes, ratings, visits, favorites and recent peaks. |
| Dedicated game pages | Game icon and thumbnail, creator links, description, game metadata, tracking start and links back to Roblox. |
| Historical charts | Switch between players, favorites and visits across **1D**, **7D** and **All** available history. |
| Interactive history | Inspect points for exact timestamps and values; move or resize the history navigator; use fullscreen for a larger chart. |
| Peak records | Recorded player peaks for the last 24 hours, 7 days and 30 days, including when they occurred. |
| Passes and products | Search game extras; inspect price, description, artwork, creation/update dates and recorded price history where available. |
| Badges | Search badges and open their details, award totals, rarity, availability and dates where Roblox supplies them. |
| Roblox events | Browse current/upcoming and past events, open their details, inspect status, dates and interested counts, and follow the Roblox link. |

### Groups

| Feature | What it does |
| --- | --- |
| Group discovery | Search tracked groups, reverse the member-count ranking, or look up a Roblox community link/group ID. |
| Member overview | Current membership, one-hour and 24-hour changes, owner information and verification badges where available. |
| Group history | Chart members or the group’s total players across **1D**, **7D** and **All**. |
| Interactive charts | Point inspection, high/low/average summaries, a draggable time navigator and fullscreen. |
| Group totals | Visits, favorites and players across the relevant group games; unavailable data remains marked as unavailable. |
| Created games | Open the group’s games already included in the tracker. |
| Group details | Description, tracking information and direct links to the Roblox community and owner. |

### Compare

- Pick two tracked games with searchable selectors, and replace or remove either selection.
- Compare current players, 24-hour/7-day peaks, visits and favorites side by side.
- Plot both games’ player histories on one chart.
- Switch between **Players** and **Share**. Share means each game’s percentage of the two selected games’ combined players.
- Use **1D**, **7D** or **All**, inspect points, adjust the time navigator, review period summaries and open fullscreen.

### Across the site

- Home-page totals and ranked strips of tracked games and groups.
- An update indicator showing the age of the latest published data.
- Responsive layouts, including two-column passes/products/badges on phones.
- Shared Games / Groups / Compare navigation, a Tools dropdown and a back arrow to the [tool hub](https://0szysza.github.io/).
- Discord/social link previews with page-specific titles, descriptions and PNG cover images.

## Data and refreshes

CCU means **concurrent users**: the number of players currently in a game.

The collection/deployment workflow is triggered approximately every five minutes by an external repository dispatch, and also runs after pushes or a manual dispatch. Roblox data, runner queues and publication time can delay a visible update; the header shows the latest published reading.

Game and group history is retained for up to **90 days**. **All** means the available recorded history, not a game’s entire lifetime. New entries start accumulating history when tracking begins. Readings are aggregated into five-minute intervals for **1D**, 30-minute intervals for **7D**, and fixed one-hour intervals for **All**, regardless of how much history is available.

Passes, developer products and badges are refreshed approximately hourly. Price history begins with observed prices. Events combine Roblox data with the maintained archive. Missing fields are shown as unavailable rather than fabricated.

Untracked lookups use public Roblox-compatible proxy endpoints. They show current details and do not automatically add an item to the recorded catalog.
