import {
  CAPTURED_TRAIT_GENUS_DEFINITION,
  CAPTURED_TRAIT_MUTABLE,
  CAPTURED_TRAIT_RACE_TYPE,
} from "./captured-trait-settings-catalog.ts";
import { finite, readProperty } from "../../validation.ts";

const CAPTURED_OCULAR_STRAND_SLOT_COUNT = 2;
const CAPTURED_OCULAR_STRAND_FLOOR = 24 * CAPTURED_OCULAR_STRAND_SLOT_COUNT;
const CAPTURED_OCULAR_MAJOR_STARTING_PAIRS = 5;
const CAPTURED_OCULAR_MINOR_STARTING_PAIRS = 4;
const CAPTURED_OCULAR_MAJOR_EVOLVE_RANKS = [5];
const CAPTURED_OCULAR_MINOR_EVOLVE_RANKS = [3, 8];
const CAPTURED_OCULAR_VERSATILITY_PAIR_RANK = 0.5;
const CAPTURED_OCULAR_PERMANENT_TRAITS = new Set([
  "evil",
  "soul_eater",
  "artifical",
]);
const CAPTURED_OCULAR_NON_MUTABLE_TRAITS = new Set(["xenophobic", "rigid"]);

function capturedOcularCountOrZero(value: unknown): number | undefined {
  // DeadSpace uses `value || 0` for geneRecess, geneSlotBonus, and evolve counts.
  if (!value) return 0;
  const count = finite(value);
  return count !== undefined && Number.isInteger(count) && count >= 0
    ? count
    : undefined;
}

function capturedOcularRankOrZero(value: unknown): number | undefined {
  // `versatility` and `genes.evolve` are read as `value || 0` upstream.
  if (!value) return 0;
  const rank = finite(value);
  return rank !== undefined && rank >= 0 ? rank : undefined;
}

function capturedOcularTraitIsPermanent(trait: string, race: unknown): boolean {
  if (CAPTURED_OCULAR_PERMANENT_TRAITS.has(trait)) return true;
  const species = readProperty(race, "species");
  if (
    trait === "ooze" &&
    (species === "sludge" || species === "ultra_sludge")
  ) {
    return true;
  }
  return Boolean(readProperty(readProperty(race, "fanaticTraits"), trait));
}

function capturedOcularKnownTrait(trait: string): boolean {
  return (
    CAPTURED_OCULAR_PERMANENT_TRAITS.has(trait) ||
    CAPTURED_OCULAR_NON_MUTABLE_TRAITS.has(trait) ||
    Object.values(CAPTURED_TRAIT_GENUS_DEFINITION).some((definition) =>
      definition.traits.includes(trait),
    ) ||
    CAPTURED_TRAIT_MUTABLE.some((candidate) => candidate.id === trait)
  );
}

function capturedOcularGenusList(
  root: unknown,
  race: unknown,
): readonly string[] | undefined {
  const strandGenus = readProperty(race, "strandGenus");
  if (Array.isArray(strandGenus) && strandGenus.length > 0) {
    const genera: string[] = [];
    for (const value of strandGenus as readonly unknown[]) {
      if (
        typeof value !== "string" ||
        (value !== "organism" &&
          !Object.prototype.hasOwnProperty.call(
            CAPTURED_TRAIT_GENUS_DEFINITION,
            value,
          ))
      ) {
        return undefined;
      }
      genera.push(value);
    }
    return genera;
  }

  const species = readProperty(race, "species");
  if (typeof species !== "string" || species.length === 0) return undefined;
  if (species === "custom" || species === "hybrid") {
    const design = readProperty(
      readProperty(root, "custom"),
      species === "custom" ? "race0" : "race1",
    );
    if (!design) return Object.freeze([]);
    const genus = readProperty(design, "genus");
    if (typeof genus !== "string") return undefined;
    if (species === "hybrid" && genus === "hybrid") {
      const hybrid = readProperty(design, "hybrid");
      if (Array.isArray(hybrid)) {
        const genera: string[] = [];
        for (const value of hybrid as readonly unknown[]) {
          if (typeof value !== "string") return undefined;
          genera.push(value);
        }
        return genera;
      }
    }
    return Object.freeze([genus]);
  }

  if (
    species === "junker" ||
    species === "sludge" ||
    species === "ultra_sludge"
  ) {
    if (Object.prototype.hasOwnProperty.call(race, "jtype")) {
      const jtype = readProperty(race, "jtype");
      return typeof jtype === "string" ? Object.freeze([jtype]) : undefined;
    }
  }

  const genus = CAPTURED_TRAIT_RACE_TYPE[species];
  return genus === undefined ? undefined : Object.freeze([genus]);
}

function capturedOcularGenusFeederCount(
  genus: string,
  race: unknown,
): number | undefined {
  if (genus === "organism") return 0;
  const definition = CAPTURED_TRAIT_GENUS_DEFINITION[genus];
  if (definition === undefined) return undefined;
  const emergentTraits = new Set(definition.emergent);
  let feeders = 0;
  for (const trait of definition.traits) {
    if (
      emergentTraits.has(trait) ||
      CAPTURED_OCULAR_PERMANENT_TRAITS.has(trait) ||
      capturedOcularTraitIsPermanent(trait, race)
    ) {
      continue;
    }
    feeders++;
  }
  return feeders;
}

function capturedOcularMimicTraitCount(race: unknown): number | undefined {
  if (!readProperty(race, "shapeshifter")) return 0;
  const traits = readProperty(race, "ss_traits");
  if (!Array.isArray(traits)) return 0;
  const mimic = readProperty(race, "ss_genus");
  if (!mimic || mimic === "none" || typeof mimic !== "string") {
    return 0;
  }

  const mimicDefinition = CAPTURED_TRAIT_GENUS_DEFINITION[mimic];
  if (mimicDefinition === undefined) return 0;
  const emergentTraits = new Set(mimicDefinition.emergent);
  let count = 0;
  for (const value of traits as readonly unknown[]) {
    if (typeof value !== "string") return undefined;
    if (!capturedOcularKnownTrait(value)) return undefined;
    if (
      emergentTraits.has(value) ||
      capturedOcularTraitIsPermanent(value, race)
    ) {
      continue;
    }
    count++;
  }
  return count;
}

function capturedOcularGenusPairCount(
  root: unknown,
  race: unknown,
): number | undefined {
  const genera = capturedOcularGenusList(root, race);
  if (genera === undefined) return undefined;
  let pairs = 0;
  for (const genus of genera) {
    const feederCount = capturedOcularGenusFeederCount(genus, race);
    if (feederCount === undefined) return undefined;
    pairs += Math.ceil(feederCount / CAPTURED_OCULAR_STRAND_SLOT_COUNT);
  }
  const mimicTraits = capturedOcularMimicTraitCount(race);
  if (mimicTraits === undefined) return undefined;
  return pairs + Math.ceil(mimicTraits / CAPTURED_OCULAR_STRAND_SLOT_COUNT);
}

function capturedOcularRecessivePairCount(
  root: unknown,
  race: unknown,
): number | undefined {
  const raceCount = capturedOcularCountOrZero(readProperty(race, "geneRecess"));
  if (raceCount === undefined) return undefined;
  const species = readProperty(race, "species");
  const designKey =
    species === "custom" ? "race0" : species === "hybrid" ? "race1" : undefined;
  if (designKey === undefined) return raceCount;
  const design = readProperty(readProperty(root, "custom"), designKey);
  const designCount = design
    ? capturedOcularCountOrZero(readProperty(design, "recessive"))
    : 0;
  return designCount === undefined ? undefined : raceCount + designCount;
}

/**
 * Read-only mirror of DeadSpace `traitRecessive()` and its `strandPairCount()` dependencies.
 * Upstream `geneSlots()` initializes, widens, and pads the saved array; this reader computes its
 * current bounds without making those mutations and stands down on an unnormalized layout.
 */
export function readCapturedTraitRecessive(
  root: unknown,
  traitId: string,
): boolean | undefined {
  const race = readProperty(root, "race");
  const recessivePairs = capturedOcularRecessivePairCount(root, race);
  if (recessivePairs === undefined) return undefined;
  if (recessivePairs <= 0) return false;

  const evolveState = readProperty(root, "genes");
  if (evolveState === undefined || evolveState === null) return undefined;
  const evolve = capturedOcularRankOrZero(readProperty(evolveState, "evolve"));
  const slotBonus = capturedOcularCountOrZero(
    readProperty(race, "geneSlotBonus"),
  );
  const genusPairs = capturedOcularGenusPairCount(root, race);
  const versatility = capturedOcularRankOrZero(
    readProperty(race, "versatility"),
  );
  if (
    evolve === undefined ||
    slotBonus === undefined ||
    genusPairs === undefined ||
    versatility === undefined
  ) {
    return undefined;
  }

  const majorPairs =
    CAPTURED_OCULAR_MAJOR_STARTING_PAIRS +
    CAPTURED_OCULAR_MAJOR_EVOLVE_RANKS.filter((rank) => evolve >= rank).length +
    slotBonus +
    genusPairs +
    recessivePairs;
  const minorPairs =
    CAPTURED_OCULAR_MINOR_STARTING_PAIRS +
    CAPTURED_OCULAR_MINOR_EVOLVE_RANKS.filter((rank) => evolve >= rank).length +
    (versatility >= CAPTURED_OCULAR_VERSATILITY_PAIR_RANK ? 1 : 0) +
    slotBonus;

  const rawSpan = readProperty(race, "strandSpan");
  // `strandSpan()` falls back to the initial 24 pairs until a larger span is saved.
  const span =
    typeof rawSpan === "number" && rawSpan > CAPTURED_OCULAR_STRAND_FLOOR
      ? rawSpan
      : CAPTURED_OCULAR_STRAND_FLOOR;
  if (!Number.isSafeInteger(span) || span % CAPTURED_OCULAR_STRAND_SLOT_COUNT) {
    return undefined;
  }
  // `geneSlots()` would widen and renumber both strands if either requested pair range exceeds
  // this saved span. The captured array cannot be read safely through that pending remap.
  if (
    Math.max(majorPairs, minorPairs) * CAPTURED_OCULAR_STRAND_SLOT_COUNT >
    span
  ) {
    return undefined;
  }

  const totalMajorPairs = Math.min(
    span / CAPTURED_OCULAR_STRAND_SLOT_COUNT,
    majorPairs,
  );
  if (!Number.isInteger(totalMajorPairs) || recessivePairs > totalMajorPairs) {
    return undefined;
  }
  const rawSlots = readProperty(race, "geneSlots");
  // Upstream replaces an absent/non-array geneSlots with [], then pads it with false; keep that
  // lazy initialization's read result without writing to the captured race object.
  const slots: readonly unknown[] = Array.isArray(rawSlots) ? rawSlots : [];
  const start =
    (totalMajorPairs - recessivePairs) * CAPTURED_OCULAR_STRAND_SLOT_COUNT;
  const end = totalMajorPairs * CAPTURED_OCULAR_STRAND_SLOT_COUNT;
  for (let index = start; index < end; index++) {
    const slot = slots[index];
    if (!slot) continue;
    if (typeof slot !== "object") return undefined;
    const slottedTrait = readProperty(slot, "g");
    if (typeof slottedTrait !== "string") return undefined;
    if (slottedTrait === traitId) return true;
  }
  return false;
}
