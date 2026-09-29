import type {
  OcularPowerDecision,
  OcularPowerInput,
  OcularPowerSetting,
} from "../../../domain/traits/ocular-power.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type {
  OcularPowerControls,
  OcularPowerReader,
} from "../../../ports/ocular-power.ts";
import {
  CAPTURED_TRAIT_GENUS_EMERGENT,
  CAPTURED_TRAIT_MUTABLE,
  CAPTURED_TRAIT_OCULAR,
  CAPTURED_TRAIT_RACE_TYPE,
} from "./captured-trait-settings-catalog.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, readProperty } from "../../validation.ts";

export const CAPTURED_OCULAR_POWER_CONTROL = "ocularPower";
const CAPTURED_OCULAR_POWER_ID_PREFIX = "#ocular";

export interface CapturedOcularPowerDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
  readonly ensureControls: () => boolean;
}

function capturedOcularRace(rootState: GameRootStateSource): unknown {
  return readProperty(rootState.readRoot(), "race");
}

function capturedOcularAvailable(rootState: GameRootStateSource): boolean {
  const race = capturedOcularRace(rootState);
  return Boolean(
    readProperty(race, "ocular_power") &&
    readProperty(race, "ocularPowerConfig"),
  );
}

function capturedOcularCheckbox(document: unknown, powerId: string): unknown {
  const querySelector = readProperty(document, "querySelector");
  if (typeof querySelector !== "function") return undefined;
  try {
    return Reflect.apply(querySelector, document, [
      `${CAPTURED_OCULAR_POWER_ID_PREFIX}${powerId} input[type='checkbox']`,
    ]);
  } catch {
    return undefined;
  }
}

function capturedOcularRankIsSupported(rank: number): boolean {
  return rank >= 0.1 && rank <= 2;
}

function capturedOcularMajorEmpoweredBonus(rank: number): number | undefined {
  if (!capturedOcularRankIsSupported(rank)) return undefined;
  // DeadSpace src/races.js traits.empowered.vars() uses traitScale() with the major-trait
  // endpoints [0.01], [0.2], [0.4], capped at Empowered rank 2.
  const cappedRank = Math.min(2, rank);
  const fraction = cappedRank < 1 ? (cappedRank - 0.1) / 0.9 : cappedRank - 1;
  const start = cappedRank < 1 ? 0.01 : 0.2;
  const end = cappedRank < 1 ? 0.2 : 0.4;
  return finite(Number((start + (end - start) * fraction).toFixed(6)));
}

function capturedOcularCapacityAtRank(rank: number): number {
  // Mirrors traits.ocular_power.vars()'s rankStep(rank, [[0, 1], [1, 2], [1.67, 3]]).
  return rank >= 1.67 ? 3 : rank >= 1 ? 2 : 1;
}

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
            CAPTURED_TRAIT_GENUS_EMERGENT,
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
  const emergent = CAPTURED_TRAIT_GENUS_EMERGENT[genus];
  if (emergent === undefined) return undefined;
  const emergentTraits = new Set(emergent);
  let feeders = 0;
  for (const trait of CAPTURED_TRAIT_MUTABLE) {
    if (
      trait.type !== "genus" ||
      trait.source !== genus ||
      emergentTraits.has(trait.id) ||
      capturedOcularTraitIsPermanent(trait.id, race)
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
  if (
    !mimic ||
    mimic === "none" ||
    typeof mimic !== "string" ||
    !Object.prototype.hasOwnProperty.call(CAPTURED_TRAIT_GENUS_EMERGENT, mimic)
  ) {
    return 0;
  }

  const emergentTraits = new Set(CAPTURED_TRAIT_GENUS_EMERGENT[mimic]);
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
function capturedOcularTraitIsRecessive(root: unknown): boolean | undefined {
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
    if (readProperty(slot, "g") === "ocular_power") return true;
  }
  return false;
}

export function readCapturedOcularEffectiveRank(
  root: unknown,
): number | undefined {
  const race = readProperty(root, "race");
  const rawRank = finite(readProperty(race, "ocular_power"));
  if (rawRank === undefined || !capturedOcularRankIsSupported(rawRank))
    return undefined;
  const rawEmpoweredRank = readProperty(race, "empowered");
  if (!rawEmpoweredRank) return rawRank;

  const empoweredRank = finite(rawEmpoweredRank);
  if (empoweredRank === undefined) return undefined;
  const bonus = capturedOcularMajorEmpoweredBonus(empoweredRank);
  if (bonus === undefined) return undefined;
  const recessive = capturedOcularTraitIsRecessive(root);
  if (recessive === undefined) return undefined;
  if (recessive) return rawRank;
  const effectiveRank = Number((rawRank + bonus).toFixed(6));
  return finite(effectiveRank);
}

function capturedOcularCapacityFromRoot(root: unknown): number {
  const effectiveRank = readCapturedOcularEffectiveRank(root);
  return effectiveRank === undefined
    ? 0
    : capturedOcularCapacityAtRank(effectiveRank);
}

export function createCapturedOcularPowerAutomation(
  dependencies: CapturedOcularPowerDependencies,
): {
  readonly reader: OcularPowerReader;
  readonly controls: OcularPowerControls;
  readonly executor: DecisionExecutor<OcularPowerDecision>;
} {
  const controls: OcularPowerControls = Object.freeze({
    capture(): boolean {
      if (!capturedOcularAvailable(dependencies.rootState)) return false;
      if (!dependencies.ensureControls()) return false;
      const handle = dependencies.controls.resolve(
        CAPTURED_OCULAR_POWER_CONTROL,
      );
      return handle !== undefined && handle.methods.includes("pow");
    },
    current(key: string): boolean | null {
      const power = CAPTURED_TRAIT_OCULAR.find(
        (candidate) => candidate.stateKey === key,
      );
      if (power === undefined) return null;
      const config = readProperty(
        capturedOcularRace(dependencies.rootState),
        "ocularPowerConfig",
      );
      const value = readProperty(config, power.stateKey);
      return typeof value === "boolean" ? value : null;
    },
    toggle(powerId: string): boolean {
      const power = CAPTURED_TRAIT_OCULAR.find(
        (candidate) => candidate.id === powerId,
      );
      if (
        power === undefined ||
        !capturedOcularAvailable(dependencies.rootState) ||
        !dependencies.ensureControls()
      ) {
        return false;
      }
      const handle = dependencies.controls.resolve(
        CAPTURED_OCULAR_POWER_CONTROL,
      );
      if (handle === undefined || !handle.methods.includes("pow")) return false;
      const checkbox = capturedOcularCheckbox(
        dependencies.getDocument(),
        power.id,
      );
      const click = readProperty(checkbox, "click");
      if (typeof click !== "function") return false;
      try {
        Reflect.apply(click, checkbox, []);
      } catch {
        return false;
      }
      // pow() may redraw the panel when it enforces the game's cap. The executor checks the
      // authoritative config after this click, and each later decision resolves the handle again.
      return true;
    },
  });

  const reader: OcularPowerReader = Object.freeze({
    readGate() {
      if (!capturedOcularAvailable(dependencies.rootState)) {
        return Object.freeze({ unlocked: false });
      }
      const ocularSettings = dependencies.readSettings();
      const config = readProperty(
        capturedOcularRace(dependencies.rootState),
        "ocularPowerConfig",
      );
      const hasEnabledPower = CAPTURED_TRAIT_OCULAR.some(
        (power) =>
          readProperty(ocularSettings, `ocularPower_${power.id}`) === true,
      );
      const hasActivePower = CAPTURED_TRAIT_OCULAR.some(
        (power) => readProperty(config, power.stateKey) === true,
      );
      return Object.freeze({
        // With every setting off and no active power, the current state is already reconciled.
        unlocked: hasEnabledPower || hasActivePower,
      });
    },
    readPlan(): OcularPowerInput {
      const root = dependencies.rootState.readRoot();
      const race = readProperty(root, "race");
      if (
        !readProperty(race, "ocular_power") ||
        !readProperty(race, "ocularPowerConfig")
      ) {
        return Object.freeze({ capacity: 0, powers: Object.freeze([]) });
      }
      const rawSettings = dependencies.readSettings();
      const powers: OcularPowerSetting[] = CAPTURED_TRAIT_OCULAR.map(
        (power) => {
          const rawPriority = readProperty(
            rawSettings,
            `ocularPower_p_${power.id}`,
          );
          const priority = finite(Number(rawPriority)) ?? 0;
          return Object.freeze({
            key: power.stateKey,
            id: power.id,
            enabled:
              readProperty(rawSettings, `ocularPower_${power.id}`) === true,
            priority,
          });
        },
      );
      return Object.freeze({
        capacity: capturedOcularCapacityFromRoot(root),
        powers: Object.freeze(powers),
      });
    },
  });

  const executor: DecisionExecutor<OcularPowerDecision> = Object.freeze({
    execute(ocularPowerDecision: Readonly<OcularPowerDecision>) {
      const power = CAPTURED_TRAIT_OCULAR.find(
        (candidate) =>
          candidate.stateKey === ocularPowerDecision.key &&
          candidate.id === ocularPowerDecision.id,
      );
      if (
        power === undefined ||
        typeof ocularPowerDecision.enabled !== "boolean"
      ) {
        return stale(
          "ocular-decision-invalid",
          "ocular power decision is invalid",
        );
      }
      if (!capturedOcularAvailable(dependencies.rootState)) {
        return stale("ocular-power-locked", "ocular powers became unavailable");
      }
      const current = controls.current(power.stateKey);
      if (current === ocularPowerDecision.enabled) return SUCCEEDED;
      if (current === null || !controls.toggle(power.id)) {
        return stale(
          "ocular-controls-unavailable",
          `ocular power ${power.id} control is unavailable`,
        );
      }
      return controls.current(power.stateKey) === ocularPowerDecision.enabled
        ? SUCCEEDED
        : stale(
            "ocular-postcondition-failed",
            `the game did not set ocular power ${power.id}`,
          );
    },
  });

  return Object.freeze({ reader, controls, executor });
}
