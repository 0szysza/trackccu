// Keeps two generated things in sync with scripts/games.json, the single
// file you edit to add a game:
//   1. the CATALOG array inside site.js (between the GENERATED:CATALOG
//      markers) — so every page's game list, search and tiles pick it up
//      with no other file to touch.
//   2. a games/<placeId>/index.html page for each game (a copy of
//      scripts/game-template.html — identical for every game, since that
//      page is fully driven by the URL and the live data at runtime).
//
// Run it locally with `node scripts/sync-games.mjs`, or just push — the
// GitHub Actions workflow (.github/workflows/update.yml) runs it on every
// scheduled build too, so a new games.json entry appears on the live site
// within about 5 minutes even if nobody runs this by hand.
//
// To add a game: add an entry to scripts/games.json with at least
// `slug`, `placeId`, `name` and `short` (see the existing entries).
// `universeId` and `color` are optional — universeId is resolved and
// cached automatically, color only affects the Discord embed colour.
// Icon (assets/<slug>-icon.png) and thumbnail (assets/<slug>-thumbnail.png)
// are optional too; without them the site falls back to Roblox's own icon,
// then to the site's generic icon.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(here, "..");
// OUT_DIR lets CI point this at the assembled _site folder instead of the
// checked-out repo; defaults to the repo root for local runs.
const OUT_DIR = process.env.OUT_DIR || REPO_ROOT;

const games = JSON.parse(await readFile(path.join(here, "games.json"), "utf8"));
for (const game of games) game.color ??= 65535; // default Discord embed colour (BGS blue)

/* ---------- 1. site.js CATALOG block ---------- */

const START = "/* GENERATED:CATALOG:START */";
const END = "/* GENERATED:CATALOG:END */";

function buildCatalogBlock() {
  const lines = games.map((g) =>
    `    { slug: ${JSON.stringify(g.slug)}, placeId: ${JSON.stringify(String(g.placeId))}, label: ${JSON.stringify(g.name)}, short: ${JSON.stringify(g.short)} },`);
  return [START, "  const CATALOG = [", ...lines, "  ];", END].join("\n");
}

async function updateSiteJs() {
  const siteJsPath = path.join(REPO_ROOT, "site.js");
  const source = await readFile(siteJsPath, "utf8");
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error("Could not find GENERATED:CATALOG markers in site.js — has the file been restructured?");
  }
  const next = source.slice(0, start) + buildCatalogBlock() + source.slice(end + END.length);

  // Only site.js itself is source-controlled here; when OUT_DIR differs
  // (CI writing to _site) the block is applied to that copy instead, right
  // before it gets deployed, without touching the repo's own site.js.
  const target = OUT_DIR === REPO_ROOT
    ? siteJsPath
    : path.join(OUT_DIR, "site.js");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, next);
  return target;
}

/* ---------- 2. per-game pages ---------- */

async function writeGamePages() {
  const template = await readFile(path.join(here, "game-template.html"), "utf8");
  const gamesDir = path.join(OUT_DIR, "games");
  for (const game of games) {
    const dir = path.join(gamesDir, String(game.placeId));
    await mkdir(dir, { recursive: true });
    const page = template.replaceAll("__GAME_NAME__", game.name);
    await writeFile(path.join(dir, "index.html"), page);
  }
  return gamesDir;
}

const siteJsTarget = await updateSiteJs();
const gamesDir = await writeGamePages();
console.log(`Synced ${games.length} game(s) -> ${siteJsTarget} and ${gamesDir}/<placeId>/index.html`);
