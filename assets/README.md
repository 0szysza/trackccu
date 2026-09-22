# assets

Eight files, all placeholders right now — overwrite them with real artwork,
keeping the exact file names. Two files per game: a thumbnail (card
background) and an icon (fallback before the live Roblox icon loads).

| File | Used for | Suggested size |
| --- | --- | --- |
| `bgs-thumbnail.png` | Bubble Gum Simulator card background | 1280×720 |
| `bgs-icon.png` | Bubble Gum Simulator icon fallback | 256×256 |
| `bgsi-thumbnail.png` | Bubble Gum Simulator INFINITY card background | 1280×720 |
| `bgsi-icon.png` | Bubble Gum Simulator INFINITY icon fallback | 256×256 |
| `jailbreak-thumbnail.png` | Jailbreak card background | 1280×720 |
| `jailbreak-icon.png` | Jailbreak icon fallback | 256×256 |
| `petsim99-thumbnail.png` | Pet Simulator 99 card background | 1280×720 |
| `petsim99-icon.png` | Pet Simulator 99 icon fallback | 256×256 |

The icon files only show for the split second before `/api/live` responds:
the page then swaps in whatever icon each game currently uses on Roblox, so
those stay correct on their own whenever a developer changes them.

The thumbnails are never fetched from Roblox — they are exactly the files
here. On **All Games** every game gets its own tile; on **Compare** the two
picked games show in the left (cyan) and right (pink) card. The thumbnail sits
behind the card at ~30% opacity under a dark gradient, so a busy image still
leaves the numbers readable. Adjust `.game-card .art { opacity: ... }` in
`site.css` to make it stronger or weaker.

## Adding a fifth game later

See the main `README.md` ("Dodawanie gry"): the game goes into `scripts/games.json` / `lib/games.ts`
and `CATALOG` in `site.js`, plus `<slug>-thumbnail.png` and `<slug>-icon.png` here.
