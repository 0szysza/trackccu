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
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(here, "..");
// OUT_DIR lets CI point this at the assembled _site folder instead of the
// checked-out repo; defaults to the repo root for local runs.
const OUT_DIR = process.env.OUT_DIR || REPO_ROOT;

const games = JSON.parse(await readFile(path.join(here, "games.json"), "utf8"));
const groups = JSON.parse(await readFile(path.join(here, "groups.json"), "utf8"));
const cssHash = createHash("sha256").update(await readFile(path.join(REPO_ROOT, "site.css"))).digest("hex").slice(0, 12);
for (const game of games) game.color ??= 65535; // default Discord embed colour (BGS blue)

/* ---------- 1. site.js CATALOG block ---------- */

const START = "/* GENERATED:CATALOG:START */";
const END = "/* GENERATED:CATALOG:END */";
const GROUP_START = "/* GENERATED:GROUP_CATALOG:START */";
const GROUP_END = "/* GENERATED:GROUP_CATALOG:END */";

function buildCatalogBlock() {
  const lines = games.map((g) =>
    `    { slug: ${JSON.stringify(g.slug)}, placeId: ${JSON.stringify(String(g.placeId))}, label: ${JSON.stringify(g.name)}, short: ${JSON.stringify(g.short)}, ownerName: ${JSON.stringify(g.ownerName || null)}, ownerUrl: ${JSON.stringify(g.ownerUrl || null)} },`);
  return [START, "  const CATALOG = [", ...lines, "  ];", END].join("\n");
}

function buildGroupCatalogBlock() {
  const lines = groups.map((g) =>
    `    { id: ${JSON.stringify(String(g.id))}, label: ${JSON.stringify(g.name)} },`);
  return [GROUP_START, "  const GROUP_CATALOG = [", ...lines, "  ];", GROUP_END].join("\n");
}

function replaceBlock(source, startMark, endMark, content) {
  const start = source.indexOf(startMark);
  const end = source.indexOf(endMark);
  if (start === -1 || end === -1) throw new Error(`Could not find ${startMark} in site.js`);
  return source.slice(0, start) + content + source.slice(end + endMark.length);
}

async function updateSiteJs() {
  const siteJsPath = path.join(REPO_ROOT, "site.js");
  const source = await readFile(siteJsPath, "utf8");
  const next = replaceBlock(
    replaceBlock(source, START, END, buildCatalogBlock()),
    GROUP_START, GROUP_END, buildGroupCatalogBlock()
  );

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
    const page = template.replaceAll("__GAME_NAME__", game.name).replaceAll("__CSS_HASH__", cssHash);
    await writeFile(path.join(dir, "index.html"), page);
  }
  return gamesDir;
}

const siteJsTarget = await updateSiteJs();
const gamesDir = await writeGamePages();
if (OUT_DIR !== REPO_ROOT) {
  for (const name of ["index.html", "games.html", "groups.html", "compare.html"]) {
    const file = path.join(OUT_DIR, name);
    const source = await readFile(file, "utf8");
    const next = source.replaceAll(/href="site\.css(?:\?v=[^"]*)?"/g, `href="site.css?v=${cssHash}"`);
    if (next === source && !source.includes(`site.css?v=${cssHash}`)) throw new Error(`Missing stylesheet link in ${name}`);
    await writeFile(file, next);
  }
}
const groupTemplate = await readFile(path.join(here, "group-template.html"), "utf8");
for (const group of groups) {
  const dir = path.join(OUT_DIR, "groups", String(group.id));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), groupTemplate.replaceAll("__GROUP_NAME__", group.name).replaceAll("__CSS_HASH__", cssHash));
}
console.log(`Synced ${games.length} game(s) and ${groups.length} group(s) -> ${siteJsTarget}, ${gamesDir}, and ${path.join(OUT_DIR, "groups")}`);
