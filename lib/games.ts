export interface TrackedGame {
  /** Short key used by the front-end and in API payloads. */
  slug: string;
  universeId: string;
  placeId: string;
  /** Stable display name (the live Roblox name carries event prefixes). */
  name: string;
  /** Short label shown on the site and in Discord (BGS, BGSI, JB, PS99). */
  short: string;
  /** Accent colour used for this game's Discord embed. */
  color: number;
}

interface GameSeed {
  slug: string;
  placeId: string;
  name: string;
  short: string;
  /** 0xRRGGBB — keep in sync with `accent` in site.js. */
  color: number;
  /**
   * Set this when the universe ID is already known (found once via
   * https://apis.roblox.com/universes/v1/places/<placeId>/universe and
   * pasted in here) — it saves a lookup on every cold start. Leave it out
   * and the ID is resolved from placeId automatically the first time this
   * function instance runs.
   */
  universeId?: string;
}

const SEEDS: GameSeed[] = [
  {
    slug: "bgs",
    placeId: "2512643572",
    name: "Bubble Gum Simulator",
    short: "BGS",
    color: 0x00f0ff,
    universeId: "892043755",
  },
  {
    slug: "bgsi",
    placeId: "85896571713843",
    name: "Bubble Gum Simulator INFINITY",
    short: "BGSI",
    color: 0xff007f,
    universeId: "6504986360",
  },
  {
    slug: "jailbreak",
    placeId: "606849621",
    name: "Jailbreak",
    short: "JB",
    color: 0xffb020,
  },
  {
    slug: "petsim99",
    placeId: "8737899170",
    name: "Pet Simulator 99",
    short: "PS99",
    color: 0xa78bfa,
  },
];

async function resolveUniverseId(placeId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://apis.roblox.com/universes/v1/places/${placeId}/universe`,
      { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { universeId?: number };
    return data.universeId ? String(data.universeId) : null;
  } catch (error) {
    console.warn(`Failed to resolve universe id for place ${placeId}:`, error);
    return null;
  }
}

let cached: TrackedGame[] | null = null;
let inFlight: Promise<TrackedGame[]> | null = null;

/**
 * Every seed's universe ID, resolved once per warm function instance. A game
 * whose ID can't be resolved (network hiccup, bad place ID) is dropped
 * rather than breaking the others — it reappears once the lookup succeeds.
 */
export async function getTrackedGames(): Promise<TrackedGame[]> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const resolved = await Promise.all(
      SEEDS.map(async (seed): Promise<TrackedGame | null> => {
        const universeId = seed.universeId ?? (await resolveUniverseId(seed.placeId));
        if (!universeId) return null;
        return {
          slug: seed.slug,
          universeId,
          placeId: seed.placeId,
          name: seed.name,
          short: seed.short,
          color: seed.color,
        };
      }),
    );

    const games = resolved.filter((game): game is TrackedGame => game !== null);
    cached = games; // only cache a full, successful resolution
    inFlight = null;
    return games;
  })();

  return inFlight;
}
