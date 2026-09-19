/**
 * Display names for planet biomes and traits.
 *
 * The game's own `biome_<id>_name` and `planet_<id>` strings are the capitalized id in English at
 * the port reference commit (`strings/strings.json`) — "grassland" is "Grassland", "toxic" is
 * "Toxic". Localization is unreachable from a capture, so that identity is the rule, stated once.
 *
 * Both directions matter and both read this: the Planet Weighting table labels its rows with it,
 * and `captured-planet-metadata.ts` inverts it to recover trait ids from a drawn planet title. A
 * page in another language therefore fails the title parse and falls back to the sole-row safe
 * path rather than mis-reading a trait.
 */

export function capturedPlanetLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
