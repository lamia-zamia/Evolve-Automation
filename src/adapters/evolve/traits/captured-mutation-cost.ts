import type { MutationKind } from "../../../domain/traits/mutation.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";

// Genetics 2.0 keeps the trait catalog in the game's module scope. The captured Vue data and
// public addCost/removeCost methods do not expose it: those methods return localized strings.
// These are the current upstream trait values, normalized from races.js's scaled `val` field.
// Keep unknown ids conservative so an upstream trait addition cannot bypass a configured reserve.
const CURRENT_CAPTURED_MUTATION_TRAIT_VALUES: Readonly<Record<string, number>> =
  Object.freeze({
    adaptable: 3,
    humanoid: 3,
    wasteful: -3,
    xenophobic: -5,
    carnivore: 3,
    beast: 2,
    cautious: -2,
    herbivore: -7,
    instinct: 5,
    forager: 4,
    small: 6,
    weak: -3,
    large: -5,
    strong: 5,
    cold_blooded: -2,
    scales: 5,
    flier: 3,
    hollow_bones: 2,
    sky_lover: -2,
    rigid: -2,
    high_pop: 3,
    fast_growth: 2,
    high_metabolism: -1,
    photosynth: 3,
    sappy: 4,
    asymmetrical: -3,
    detritivore: 2,
    spores: 2,
    spongy: -2,
    submerged: 3,
    low_light: -2,
    elusive: 7,
    iron_allergy: -4,
    smoldering: 7,
    cold_intolerance: -4,
    chilled: 7,
    heat_intolerance: -4,
    scavenger: 3,
    nomadic: -5,
    immoral: 4,
    evil: 0,
    blissful: 3,
    pompous: -6,
    holy: 4,
    artifical: 5,
    powered: -6,
    psychic: 10,
    tormented: -25,
    darkness: 1,
    unfathomable: 15,
    creative: 8,
    diverse: -4,
    studious: 2,
    arrogant: -2,
    brute: 7,
    angry: -1,
    lazy: -4,
    curious: 4,
    pack_mentality: 4,
    tracker: 2,
    playful: 5,
    freespirit: -3,
    beast_of_burden: 6,
    sniper: 6,
    hooved: -4,
    rage: 4,
    heavy: -4,
    gnawer: -1,
    calm: 6,
    pack_rat: 3,
    paranoid: -3,
    greedy: -5,
    merchant: 3,
    smart: 6,
    puny: -4,
    dumb: -5,
    tough: 4,
    nearsighted: -4,
    intelligent: 7,
    regenerative: 8,
    gluttony: -2,
    slow: -6,
    armored: 4,
    optimistic: 3,
    chameleon: 6,
    slow_digestion: 1,
    astrologer: 3,
    hard_of_hearing: -3,
    resourceful: 4,
    selenophobia: -6,
    leathery: 2,
    pessimistic: -1,
    hoarder: 4,
    solitary: -1,
    kindling_kindred: 8,
    iron_wood: 4,
    pyrophobia: -4,
    catnip: 1,
    hyper: 4,
    skittish: -4,
    fragrant: -3,
    sticky: 3,
    anise: 1,
    infectious: 4,
    parasite: -4,
    toxic: 5,
    nyctophilia: -3,
    infiltrator: 4,
    hibernator: -3,
    cannibalize: 5,
    frail: -2,
    malnutrition: 1,
    claws: 5,
    atrophy: -1,
    hivemind: 9,
    tunneler: 2,
    blood_thirst: 5,
    apex_predator: 6,
    invertebrate: -2,
    suction_grip: 4,
    befuddle: 4,
    environmentalist: -5,
    unorganized: -2,
    musical: 5,
    revive: 4,
    slow_regen: -4,
    forge: 4,
    autoignition: -4,
    blurry: 5,
    snowy: -3,
    ravenous: -5,
    ghostly: 5,
    lawless: 3,
    mistrustful: -1,
    humpback: 4,
    thalassophobia: -4,
    unfavored: -4,
    fiery: 10,
    terrifying: 6,
    slaver: 12,
    compact: 10,
    conniving: 4,
    pathetic: -5,
    spiritual: 4,
    truthful: -7,
    unified: 4,
    rainbow: 3,
    gloomy: 3,
    magnificent: 6,
    noble: -3,
    imitation: 9,
    emotionless: -4,
    logical: 8,
    shapeshifter: 10,
    deconstructor: -4,
    linked: 4,
    dark_dweller: -3,
    swift: 10,
    anthropophagite: -2,
    living_tool: 12,
    bloated: -10,
    artisan: 9,
    stubborn: -5,
    rogue: 6,
    untrustworthy: -4,
    living_materials: 6,
    unstable: -5,
    elemental: 5,
    chicken: -8,
    tusk: 6,
    blubber: -3,
    ocular_power: 9,
    floating: -3,
    wish: 13,
    devious: -4,
    grenadier: 6,
    aggressive: -2,
    empowered: 8,
    blasphemous: -5,
    deep_power: 9,
    ancient: -8,
    scrounger: 5,
    nostalgic: -6,
    humongous: 12,
    limited: -6,
    wooly: 5,
    mourning: -5,
    ooze: -50,
    soul_eater: 0,
    untapped: 0,
    emfield: -1,
  });

function readCapturedMutationRace(
  root: unknown,
): Record<PropertyKey, unknown> | undefined {
  const race = readProperty(root, "race");
  return isRecord(race) ? race : undefined;
}

function readCapturedMutationRank(
  race: Record<PropertyKey, unknown>,
  traitId: string,
): number | undefined {
  const rawRank = readProperty(race, traitId);
  if (rawRank === undefined || rawRank === null || rawRank === false) return 0;
  const rank = finite(rawRank);
  return rank === undefined || rank < 0 ? undefined : rank;
}

function readCapturedMutationAdjustment(
  race: Record<PropertyKey, unknown>,
  traitValue: number,
  operation: MutationKind,
): number | undefined {
  const rawModified = readProperty(race, "modified");
  if (
    rawModified === undefined ||
    rawModified === null ||
    rawModified === false
  ) {
    return 0;
  }
  const modified = isRecord(rawModified) ? rawModified : undefined;
  if (modified === undefined) return undefined;
  const time = finite(readProperty(modified, "t"));
  const operationCountKey =
    operation === "purge"
      ? traitValue < 0
        ? "nr"
        : undefined
      : traitValue >= 0
        ? "pa"
        : undefined;
  const operationCount =
    operationCountKey === undefined
      ? 0
      : finite(readProperty(modified, operationCountKey));
  return time !== undefined &&
    time >= 0 &&
    operationCount !== undefined &&
    operationCount >= 0
    ? (time + operationCount) * 10
    : undefined;
}

/**
 * The normalized upstream value for one trait, or undefined when the catalog has no entry.
 * Single owner for the Genetics 2.0 trait values; the settings panel derives display costs
 * from the same table the automation reserves against.
 */
export function readCapturedMutationTraitValue(
  traitId: string,
): number | undefined {
  const value = CURRENT_CAPTURED_MUTATION_TRAIT_VALUES[traitId];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * The species whose Genetics 2.0 mutation costs upstream multiplies by ten, with the display
 * names the settings hint uses. One owner for both halves: a species added upstream must appear
 * in the reserve arithmetic and in the hint together.
 */
export const CAPTURED_MUTATION_MULTIPLIED_SPECIES: Readonly<
  Record<string, string>
> = Object.freeze({
  custom: "Custom",
  hybrid: "Hybrid",
  sludge: "Sludge",
  ultra_sludge: "Ultra Sludge",
});

const CAPTURED_MUTATION_SPECIES_MULTIPLIER = 10;

/**
 * The base Genetics 2.0 mutation cost for one trait, before the purge rank scaling and the
 * live adjustment terms. Single owner of `Math.abs(value * 5)` and the species multiplier:
 * reserve-aware planning and the settings panel's displayed cost read the same rule.
 *
 * Pass `species` to apply the multiplier; omit it for the unmultiplied base cost.
 */
export function readCapturedMutationBaseCost(
  traitId: string,
  species?: string,
): number | undefined {
  const traitValue = readCapturedMutationTraitValue(traitId);
  if (traitValue === undefined) return undefined;
  const cost = Math.abs(traitValue * 5);
  return species !== undefined &&
    Object.hasOwn(CAPTURED_MUTATION_MULTIPLIED_SPECIES, species)
    ? cost * CAPTURED_MUTATION_SPECIES_MULTIPLIER
    : cost;
}

/**
 * The base cost as the multiplied species pay it. Every multiplied species pays the same figure,
 * so the settings panel quotes this one number for all of them.
 */
export function readCapturedMutationMultipliedBaseCost(
  traitId: string,
): number | undefined {
  const cost = readCapturedMutationBaseCost(traitId);
  return cost === undefined
    ? undefined
    : cost * CAPTURED_MUTATION_SPECIES_MULTIPLIER;
}

/**
 * Read the numeric Genetics 2.0 mutation cost needed for reserve-aware planning.
 *
 * This mirrors the upstream private `addCost(t, false)` / `rmCost(t, false)` mechanics from
 * arpa.js. The public Vue methods are presentation methods, and the captured root does not carry
 * the module-scoped trait catalog, so there is no structured live value to read. Unknown catalog
 * entries or malformed live mutation state intentionally return undefined and stand down.
 */
export function readCapturedMutationCost(
  root: unknown,
  traitId: string,
  operation: MutationKind,
): number | undefined {
  if (
    typeof traitId !== "string" ||
    (operation !== "gain" && operation !== "purge")
  ) {
    return undefined;
  }
  const race = readCapturedMutationRace(root);
  const traitValue = readCapturedMutationTraitValue(traitId);
  const species = readProperty(race, "species");
  if (
    race === undefined ||
    traitValue === undefined ||
    typeof species !== "string"
  ) {
    return undefined;
  }
  const baseCost = readCapturedMutationBaseCost(traitId, species);
  if (baseCost === undefined) return undefined;

  let cost = baseCost;
  if (operation === "purge" && traitValue < 0) {
    const rank = readCapturedMutationRank(race, traitId);
    if (rank === undefined) return undefined;
    if (rank === 0.1) cost *= 4;
    else if (rank === 0.25) cost *= 3;
    else if (rank === 0.5) cost *= 2;
  }
  const adjustment = readCapturedMutationAdjustment(
    race,
    traitValue,
    operation,
  );
  if (adjustment === undefined) return undefined;
  cost += adjustment;
  return Number.isFinite(cost) && cost >= 0 ? cost : undefined;
}
