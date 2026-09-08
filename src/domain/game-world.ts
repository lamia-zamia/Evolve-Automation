/**
 * Validated views of the live game world: which run this is, the race's traits, researched tech,
 * held resources, and which features the game is currently offering.
 *
 * These are the values Phase 3 readers hand to policies in place of the cloned `game.global`
 * shape. Three properties make them safe to build a subsystem on:
 *
 * - **They are samples, not clones.** A caller names the tech, traits, or resources it needs and
 *   gets exactly those. There is no whole-world snapshot per tick to pay for, and an id nobody
 *   asked for is an error rather than a silent zero — see `techLevel` and friends.
 * - **Absence is a value, not a gap.** The game builds `global.resource`, `global.tech`, and most
 *   of `global.settings` lazily, so a sampled id the game has not created yet reports level 0 or a
 *   locked resource. That is the same answer the game's own `if (global.tech['x'])` tests give.
 * - **Nothing here reaches the page.** Adapters validate; these types and helpers are pure.
 */

/** The one resource view every reader produces, whether or not the game has the resource yet. */
export interface ResourceView {
  /** `resource.display` — the game is offering this resource to the player. */
  readonly unlocked: boolean;
  readonly amount: number;
  /** The game stores an uncapped resource as -1. */
  readonly max: number;
  /** `resource.diff` — net change per game tick. */
  readonly rateOfChange: number;
  /** `amount / max`, or 0 when the resource is uncapped or has no ceiling yet. */
  readonly storageRatio: number;
}

/** A resource the game has not created, or a cost key that names no resource at all. */
export const ABSENT_RESOURCE: ResourceView = Object.freeze({
  unlocked: false,
  amount: 0,
  max: 0,
  rateOfChange: 0,
  storageRatio: 0,
});

/** Which run this is. Every field is `''`/0 until the game has chosen or counted it. */
export interface GameIdentitySample {
  /** `race.species`; `'protoplasm'` through evolution, `''` before a race exists. */
  readonly species: string;
  /** `race.universe`; `''` until a universe is chosen. */
  readonly universe: string;
  /** `city.biome`; `''` until a planet is chosen. */
  readonly biome: string;
  /** `city.ptrait`; the chosen planet's modifiers. */
  readonly planetTraits: readonly string[];
  /** `race.gods` / `race.old_gods`; the species of the previous two runs, `''` when none. */
  readonly gods: string;
  readonly oldGods: string;
  /** `stats.reset` — completed prestige resets. */
  readonly resets: number;
  /** `stats.days` this run, and `stats.tdays` across every run. */
  readonly days: number;
  readonly totalDays: number;
}

/** `global.settings`, reduced to what automation decides on. */
export interface GameSettingsSample {
  /** `settings.pause` — the player has stopped the game loop. */
  readonly paused: boolean;
  /**
   * Every `show*` setting the game currently has switched on, under its own key (`showCity`,
   * `showMarket`). This is the game's own persisted record of which features it is offering, so
   * it answers "is this feature available" without a rendered element to look at.
   */
  readonly visibleFeatures: ReadonlySet<string>;
}

/** Researched tech levels, for the ids the caller asked about. */
export interface TechSample {
  readonly levels: ReadonlyMap<string, number>;
}

/** Race trait ranks, for the traits the caller asked about. */
export interface RaceTraitSample {
  readonly ranks: ReadonlyMap<string, number>;
}

/** Resource views, for the ids the caller asked about. */
export interface ResourceSample {
  readonly resources: ReadonlyMap<string, ResourceView>;
}

function sampled<T>(
  values: ReadonlyMap<string, T>,
  id: string,
  kind: string,
): T {
  const value = values.get(id);
  if (value === undefined) {
    // A sample only answers for what it was asked to read. Returning a default here would let a
    // caller act on "not researched" for something nobody ever looked up.
    throw new TypeError(`${kind} ${id} was not sampled`);
  }
  return value;
}

/** The researched level of `id`, or 0 when the game has no entry for it. */
export function techLevel(sample: Readonly<TechSample>, id: string): number {
  return sampled(sample.levels, id, "tech");
}

/** As the game's own `global.tech[id] >= level` test. */
export function hasTech(
  sample: Readonly<TechSample>,
  id: string,
  level = 1,
): boolean {
  return techLevel(sample, id) >= level;
}

/** The rank of `trait`, or 0 when the race does not have it. */
export function traitRank(
  sample: Readonly<RaceTraitSample>,
  trait: string,
): number {
  return sampled(sample.ranks, trait, "trait");
}

/** As the game's own `global.race[trait]` truth test. */
export function hasTrait(
  sample: Readonly<RaceTraitSample>,
  trait: string,
): boolean {
  return traitRank(sample, trait) > 0;
}

export function resourceView(
  sample: Readonly<ResourceSample>,
  id: string,
): ResourceView {
  return sampled(sample.resources, id, "resource");
}

/**
 * Whether the sampled holdings cover `cost`. A cost key naming no stored resource — `Morale`,
 * `Army`, and the other synthetic requirements — reports 0 held and makes the cost unaffordable,
 * rather than being waved through on an assumption.
 */
export function canAfford(
  sample: Readonly<ResourceSample>,
  cost: Readonly<Record<string, number>>,
): boolean {
  for (const [id, amount] of Object.entries(cost)) {
    if (amount <= 0) continue;
    if (!(resourceView(sample, id).amount >= amount)) return false;
  }
  return true;
}

/**
 * Whether storage could ever hold `cost`, which is the question behind saving for something rather
 * than affording it now. An uncapped resource (`max` below zero) and one the game has not created
 * yet both pass: neither is a known ceiling, and refusing to save on an unknown would stall a
 * target the player can in fact reach.
 */
export function canEverAfford(
  sample: Readonly<ResourceSample>,
  cost: Readonly<Record<string, number>>,
): boolean {
  for (const [id, amount] of Object.entries(cost)) {
    if (amount <= 0) continue;
    const max = resourceView(sample, id).max;
    if (max > 0 && max < amount) return false;
  }
  return true;
}

export function isFeatureVisible(
  sample: Readonly<GameSettingsSample>,
  feature: string,
): boolean {
  return sample.visibleFeatures.has(feature);
}

export function hasPlanetTrait(
  sample: Readonly<GameIdentitySample>,
  trait: string,
): boolean {
  return sample.planetTraits.includes(trait);
}
