# Artwork

The active catalog is `scripts/games.json` (currently 10 games); group definitions are in `scripts/groups.json`. Pages use current Roblox icon/thumbnail URLs from `data/live.json` and group icon URLs from `data/group-live.json`.

Existing `<slug>-icon.png` files are local fallbacks for BGS, BGSI, Jailbreak and Pet Simulator 99. Other games can use the generic fallback if Roblox images are unavailable. Optional `<slug>-thumbnail.png` artwork remains available; the main game details use live Roblox thumbnails when present. Keep these filenames stable when replacing files.

To add a game, edit `scripts/games.json` and run `npm run build`. The generator synchronizes catalog entries and detail pages; do not maintain a second catalog in the archived Netlify backend. An optional local icon should be square (256×256 or larger). This Pages build has no `/api/live` server endpoint.

`social/` contains interface social icons, `roblox-verified.svg` is the verification badge, and `debug/` contains generated BGSI preview images. Do not put webhook URLs or delivery state in artwork.
