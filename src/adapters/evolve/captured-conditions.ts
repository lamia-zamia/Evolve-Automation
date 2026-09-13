/**
 * Stored condition operands answered entirely from the captured game root.
 *
 * A stored trigger condition names an operand type, an argument and a count. This module answers
 * the operand types whose whole input is the game's own root state: building and project counts,
 * civic job assignments, resource holdings, the appointed governor, the race and planet bags, the
 * calendar, the two build queues and build-queue membership, the ascension level and pillar ranks, the True Path fleet,
 * Mass Relay, and carport fields, the garrison and Hell fortress counts, and the smelter slot
 * count.
 *
 * The cycle's own stored settings answer the rest of what needs no game read: the prestige type,
 * numeric or boolean setting values, and the evolution-queue length. The settings ride the same
 * condition context as the priced costs, because the trigger sample already holds the stored blob.
 * `SettingDefault` reads the same blob: the captured runtime parses stored settings fresh on every
 * read and no automation tick writes them back, so there is no live-mutated layer for a default to
 * differ from — both operands answer the configured value.
 *
 * The demand-reading operands (`ResourceDemanded`, `ResourceSatisfied`, `ResourceSatisfyRatio`,
 * `ResourceMaxCost`) answer from a demand sample that deliberately excludes the trigger targets:
 * the cycle's own sample includes them, and the conditions are evaluated inside the sampling it
 * pulls in, so reading it would recurse. With no commitments the sample degenerates to the values
 * the compatibility reader sees after its own accumulator reset (nothing demanded, a storage
 * requirement of 1, a max cost of 0); with commitments it answers what the compatibility ordering
 * could never give its triggers.
 *
 * It also answers the operands the root cannot supply but a drawn panel can. The game's grant
 * keys live in its private action catalog, so `ResearchUnlocked` and `ResearchComplete` are read
 * from the research panel the cycle already drew; `ProjectUnlocked` is read the same way from the
 * A.R.P.A. panel, and `BuildingUnlocked` from the region panels the buildings are drawn into.
 * `BuildingAffordable` is the game's own `checkMaxCosts` over an already-adjusted cost the cycle
 * priced, and `BuildingCost` reads one entry of that same price. Those come in through
 * `CapturedConditionContext`, and a condition naming one goes
 * unanswered whenever the pass it needs was not taken.
 *
 * Everything else a condition can name — resource income, custom expressions, building
 * clickability, manager-computed values, and anything needing the
 * module-level race catalog or a private action definition — is deliberately absent.
 *
 * `undefined` has exactly one meaning here: the operand cannot be answered from what has been
 * captured. It is never "false" and never "zero", so a caller has to drop the condition rather
 * than decide on it.
 */

import {
  finite,
  isRecord,
  readProperty,
  splitActionId,
} from "../validation.ts";
import { costFitsStorage } from "./captured-affordability.ts";
import type { GameActionPrice } from "../../ports/game-action-costs.ts";
import { readCapturedFactoryCapacity } from "./economy/production/captured-factory-capacity.ts";

/** A condition compares an operand's value against its stored count. */
export type CapturedOperandValue = boolean | number;

/**
 * What a cycle captured beyond the root, for the operands the root cannot answer. Every field is
 * optional and an absent one leaves its operands unanswered, so a caller supplies only the passes
 * it actually took.
 */
export interface CapturedConditionContext {
  /** Element ids the research panel was offering, e.g. `tech-mining`. */
  readonly offeredTechs?: ReadonlySet<string>;
  /** Element ids the game has already granted. */
  readonly grantedTechs?: ReadonlySet<string>;
  /** Element ids the A.R.P.A. panel drew, e.g. `arpalhc`. */
  readonly unlockedProjects?: ReadonlySet<string>;
  /**
   * The drawn building rows, with the regions the sample speaks for. Both halves travel together:
   * the ids alone cannot say whether a missing one was absent from a panel or in a panel nobody
   * drew.
   */
  readonly buildingUnlocks?: {
    readonly unlocked: ReadonlySet<string>;
    readonly regions: ReadonlySet<string>;
    /**
     * The on/off counts of the sampled rows that drew a power switch. A drawn row missing from
     * here has no switch, which is the game's own answer and reads as zero of each; a row in a
     * region nobody drew has no answer at all.
     */
    readonly states: ReadonlyMap<string, Readonly<{ on: number; off: number }>>;
  };
  /**
   * The game's current adjusted price for each building a condition asked about, with the supply
   * pool that would pay it. A building absent from the map was not priced, which leaves its cost
   * operands unanswered. The satellite entry answers `Other/satcost` under its game action id.
   */
  readonly buildingCosts?: ReadonlyMap<string, GameActionPrice>;
  /**
   * The cycle's stored script settings, for the operands that read the player's own configuration
   * rather than game state. Absent leaves those operands unanswered.
   */
  readonly settings?: Readonly<Record<string, unknown>>;
  /**
   * The Knowledge the most expensive offered technology costs, for the operand that waits on the
   * research path. Absent leaves it unanswered; 0 means no catalog has been read.
   */
  readonly knowledgeRequiredByTechs?: number;
  /**
   * The cycle's resource-demand commitments without the trigger targets, for the operands that
   * read what something else is accumulating. Absent leaves those operands unanswered.
   */
  readonly demand?: CapturedConditionDemand;
}

/**
 * What a trigger condition needs of a demand sample: whether something wants more of a resource
 * than is held, how much storage the commitments need for it, and the largest single cost they
 * name. The cycle's own demand sample satisfies this structurally; only the trigger-excluding
 * pass may be shared, never the trigger-including one.
 */
export interface CapturedConditionDemand {
  readonly isDemanded: (resourceId: string) => boolean;
  readonly storageRequired: (resourceId: string) => number;
  readonly maxCost?: (resourceId: string) => number;
}

/**
 * The game action id behind `Other/satcost`, the Sun Swarm Satellite's next-copy Money price.
 * Declared by the game itself (`space.js`, `spc_sun.swarm_satellite`), so the cost probe prices
 * the same binding the game draws.
 */
export const SWARM_SATELLITE_ACTION_ID = "space-swarm_satellite";

/**
 * Operand types whose value is compared for equality instead of `>=`, mirroring the script's own
 * `retBools` list. Only the entries this module answers are listed.
 */
const BOOLEAN_OPERANDS: ReadonlySet<string> = new Set([
  "Boolean",
  "ResourceUnlocked",
  "ResourceSatisfied",
  "ResourceDemanded",
  "JobUnlocked",
  "ResearchUnlocked",
  "ResearchComplete",
  "ProjectUnlocked",
  "BuildingUnlocked",
  "BuildingAffordable",
  "BuildingQueued",
  "Challenge",
  "Universe",
  "Government",
  "Governor",
  "ResetType",
  "RacePillared",
  "MimicGenus",
  "PlanetBiome",
  "PlanetTrait",
]);

/**
 * The mutable structure record behind an action id: `city-farm` is `city.farm`. Region and id are
 * the two halves of the id the game renders the action under, which is how the game itself stores
 * every tabbed structure.
 */
function structureState(root: unknown, argument: unknown): unknown {
  if (typeof argument !== "string") return undefined;
  const parts = splitActionId(argument);
  if (parts === undefined) return undefined;
  const region = readProperty(root, parts.region);
  return readProperty(region, parts.id);
}

/** A.R.P.A. ids are stored as the panel binding, `arpa` followed by the project id. */
function projectRecord(root: unknown, argument: unknown): unknown {
  if (typeof argument !== "string" || !argument.startsWith("arpa")) {
    return undefined;
  }
  return readProperty(
    readProperty(root, "arpa"),
    argument.slice("arpa".length),
  );
}

function resourceRecord(root: unknown, argument: unknown): unknown {
  if (typeof argument !== "string") return undefined;
  return readProperty(readProperty(root, "resource"), argument);
}

/**
 * The captured resource entry a demand operand names, or nothing when the game has no such
 * resource. A resource the root does not hold is unanswerable rather than undemanded, matching
 * every other resource operand.
 */
function demandResourceRecord(root: unknown, argument: unknown): unknown {
  const record = resourceRecord(root, argument);
  return isRecord(record) ? record : undefined;
}

/**
 * The script's own usefulness ratio: holdings over the smaller of capacity and committed storage
 * need, or 1 for an uncapped resource or one nothing is saving storage for. Needs both the
 * captured entry and the demand pass; either missing leaves the operand unanswered.
 */
function demandUsefulRatio(
  root: unknown,
  demand: CapturedConditionDemand | undefined,
  argument: unknown,
): number | undefined {
  if (demand === undefined) return undefined;
  const record = demandResourceRecord(root, argument);
  if (!isRecord(record)) return undefined;
  const amount = finite(readProperty(record, "amount"));
  const maximum = finite(readProperty(record, "max"));
  if (amount === undefined || maximum === undefined) return undefined;
  const required = finite(demand.storageRequired(String(argument)));
  if (required === undefined) return undefined;
  if (!(maximum > 0) || !(required > 0)) return 1;
  return amount / Math.min(maximum, required);
}

/** One civic job entry by its stored id, e.g. `farmer` — not a crafting resource id. */
function civicJob(root: unknown, argument: unknown): unknown {
  if (typeof argument !== "string") return undefined;
  return readProperty(readProperty(root, "civic"), argument);
}

/** The foundry assignment table, keyed by crafting resource id. */
function foundryRecord(root: unknown): unknown {
  return readProperty(readProperty(root, "city"), "foundry");
}

/** Jobs with unbounded worker slots (`BasicJob` in the script's own job catalog). */
const BASIC_JOB_IDS: ReadonlySet<string> = new Set([
  "unemployed",
  "teamster",
  "meditator",
  "hunter",
  "farmer",
  "forager",
  "lumberjack",
  "quarry_worker",
  "crystal_miner",
  "scavenger",
]);

/** Assigned workers: the civic entry, or the foundry table for a crafting job. */
function jobWorkers(root: unknown, argument: unknown): number | undefined {
  if (typeof argument !== "string") return undefined;
  const assigned = finite(readProperty(civicJob(root, argument), "workers"));
  if (assigned !== undefined) return assigned;
  return finite(readProperty(foundryRecord(root), argument));
}

/** Whether the argument names a job at all: a civic entry or a foundry assignment. */
function jobExists(root: unknown, argument: unknown): boolean {
  if (typeof argument !== "string") return false;
  if (isRecord(civicJob(root, argument))) return true;
  return finite(readProperty(foundryRecord(root), argument)) !== undefined;
}

/**
 * Assigned servants: the servant table for an ordinary job, the skilled-servant table for a
 * crafting job, and zero for a job that takes none — but only when the argument names a job.
 * An unknown id is unanswerable rather than zero, matching the compatibility lookup's throw.
 */
function jobServantCount(root: unknown, argument: unknown): number | undefined {
  if (typeof argument !== "string") return undefined;
  const servants = readProperty(readProperty(root, "race"), "servants");
  const assigned = finite(
    readProperty(readProperty(servants, "jobs"), argument),
  );
  if (assigned !== undefined) return assigned;
  const skilled = finite(
    readProperty(readProperty(servants, "sjobs"), argument),
  );
  if (skilled !== undefined) return skilled;
  return jobExists(root, argument) ? 0 : undefined;
}

/** Assigned worker slots: unbounded for the basic jobs, the entry cap otherwise. */
function jobMax(root: unknown, argument: unknown): number | undefined {
  if (typeof argument !== "string") return undefined;
  if (BASIC_JOB_IDS.has(argument)) return Number.MAX_SAFE_INTEGER;
  const entry = civicJob(root, argument);
  if (isRecord(entry)) return finite(readProperty(entry, "max"));
  // Crafting jobs share the one cap on the craftsman entry.
  if (!jobExists(root, argument)) return undefined;
  return finite(
    readProperty(readProperty(readProperty(root, "civic"), "craftsman"), "max"),
  );
}

/**
 * The compatibility job count: workers plus servants, with servants scaled by `high_pop`.
 * That multiplier is rank data from the game's trait catalog, so a high_pop run with servants
 * assigned is unanswerable; without servants — the common case — the multiplier is provably 1.
 */
function jobCount(root: unknown, argument: unknown): number | undefined {
  const workers = jobWorkers(root, argument);
  if (workers === undefined) return undefined;
  const servants = jobServantCount(root, argument);
  if (servants === undefined) return undefined;
  if (servants > 0 && readProperty(readProperty(root, "race"), "high_pop")) {
    return undefined;
  }
  return workers + servants;
}

/**
 * The flags `alevel()` counts, in the game's own order. Each is a challenge the player took on, and
 * each raises the ascension level by one.
 */
const ASCENSION_CHALLENGE_FLAGS: readonly string[] = Object.freeze([
  "no_plasmid",
  "no_trade",
  "no_craft",
  "no_crispr",
  "weak_mastery",
  "nerfed",
  "badgenes",
]);

/**
 * The game's `alevel()`: one plus the challenges taken, capped at five. It lives in the game's
 * achievement module rather than on any state it exposes, but every input is a flag on the race
 * bag, so the captured root answers it exactly.
 */
function ascensionLevel(root: unknown): number | undefined {
  const race = readProperty(root, "race");
  if (!isRecord(race)) return undefined;
  let level = 1;
  for (const flag of ASCENSION_CHALLENGE_FLAGS) {
    if (readProperty(race, flag)) level++;
  }
  return level > 5 ? 5 : level;
}

/**
 * The race an argument names: one of the three ids the race bag itself carries, the Sludge host
 * species, or a literal race id the editor stored.
 */
function resolveRaceId(root: unknown, argument: unknown): unknown {
  const race = readProperty(root, "race");
  if (
    argument === "species" ||
    argument === "gods" ||
    argument === "old_gods"
  ) {
    return readProperty(race, argument);
  }
  // `race.srace` exists only in the Sludge scenarios; before one starts the game has no host.
  if (argument === "srace") {
    return readProperty(race, "srace") ?? "protoplasm";
  }
  return argument;
}

/**
 * Whether the named race has been pillared at least as high as the current ascension level.
 * `global.pillars` maps a race id to the `alevel()` it was pillared at, and a race missing from it
 * has never been pillared — which is a real answer, not an absent one.
 */
function racePillared(root: unknown, argument: unknown): boolean | undefined {
  const pillars = readProperty(root, "pillars");
  if (!isRecord(pillars)) return undefined;
  const level = ascensionLevel(root);
  if (level === undefined) return undefined;
  const raceId = resolveRaceId(root, argument);
  if (typeof raceId !== "string") return false;
  const rank = finite(readProperty(pillars, raceId));
  return rank !== undefined && rank >= level;
}

function queueLength(root: unknown, key: string): number | undefined {
  const entries = readProperty(readProperty(root, key), "queue");
  return Array.isArray(entries) ? entries.length : undefined;
}

/**
 * One half of a building's rendered power switch. The switch exists only for a building whose own
 * gate passed — `switchable()`, or `powered` with `high_tech >= 2` and `checkPowerRequirements` —
 * and every input to that gate is the module-lexical action definition, so the drawn row is the
 * captured answer: a row the region pass sampled without a switch has no state, and the script's
 * own reader reports zero for exactly that case. A building in a region nobody drew, and one the
 * panel never offered, stay unanswered rather than reading as switched off.
 *
 * The off count is the game's own `on_cap() - on` rather than `count - on`, so a segmented
 * megastructure — a single machine the switch caps at one — reports the game's figure instead of
 * its segment count.
 */
function switchedCount(
  context: Readonly<CapturedConditionContext> | undefined,
  argument: unknown,
  half: "on" | "off",
): number | undefined {
  if (typeof argument !== "string") return undefined;
  const parts = splitActionId(argument);
  if (parts === undefined) return undefined;
  const sample = context?.buildingUnlocks;
  if (sample === undefined || !sample.regions.has(parts.region)) {
    return undefined;
  }
  if (!sample.unlocked.has(argument)) return undefined;
  return sample.states.get(argument)?.[half] ?? 0;
}

/**
 * The script's own smelter slot count: total capacity minus the Star slots, which the script
 * manages separately as extra operating capacity. Both fields are created with the smelter
 * structure itself, so a missing smelter bag leaves the operand unanswered rather than zero.
 */
/**
 * The factory line pool, which is `factoryData.factoryCapacity()` upstream: the lines held by every
 * switched-on factory across all eight structures that carry them. `readCapturedFactoryCapacity`
 * already owns that rule for the captured runtime — the factory planner and the demand sample both
 * read it — so this operand calls it rather than restating the sum a third time. A game whose
 * factory bag does not exist yet is unanswered rather than zero, like the smelter above.
 *
 * Two deliberate divergences from the compatibility reader, which answers
 * `FactoryManager.maxOperating()`:
 *
 * - That manager knows five factory buildings where 1.5.0 has eight, so it undercounts on any run
 *   reaching Tau Ceti, the underground, the surface, or Venus. The captured pool counts all eight.
 * - It then subtracts the lines assigned to productions the *script* has disabled. That mixes
 *   automation configuration into an operand that reads as game state, and the captured
 *   composition has no equivalent of the manager's per-production `enabled` flag. The pool the
 *   game offers is reported instead.
 *
 * Upstream's other figure, `actualCapacity()`, is what the industry panel draws as its maximum and
 * counts only lines that are actually powered or supported. It is not this operand: upstream's own
 * comment on `factoryCapacity()` calls that one "the size of the pool lines are assigned out of",
 * which is what a slot count means.
 */
function factorySlots(root: unknown): number | undefined {
  return readCapturedFactoryCapacity(root);
}

function smelterSlots(root: unknown): number | undefined {
  const smelter = readProperty(readProperty(root, "city"), "smelter");
  if (!isRecord(smelter)) return undefined;
  const cap = finite(readProperty(smelter, "cap"));
  const star = finite(readProperty(smelter, "Star"));
  if (cap === undefined || star === undefined) return undefined;
  return cap - star;
}

/**
 * The script's own war-manager counts, recomputed from the captured root. Fields the game
 * backfills or the manager zeroes read the same way: a missing garrison, fortress, or
 * forward-base bag reads as zero, matching the manager before its first update. Two operands
 * stay unanswered: `hellGarrison` subtracts the assault-forge reserve, which needs settings,
 * buildings, and the army rating, and `mercenaryCost` needs the trait catalog on top.
 *
 * `currentCityGarrison` reproduces the manager's own subtraction, which does not know the Eden
 * pillbox or the Warlord soul-forge deductions the game's `garrisonSize()` applies: exact for
 * the script's operand, optimistic next to the game in those two scenarios.
 */
function soldierCount(root: unknown, argument: unknown): number | undefined {
  if (typeof argument !== "string") return undefined;
  const garrison = readProperty(readProperty(root, "civic"), "garrison");
  const workers = isRecord(garrison)
    ? (finite(readProperty(garrison, "workers")) ?? 0)
    : 0;
  const max = isRecord(garrison)
    ? (finite(readProperty(garrison, "max")) ?? 0)
    : 0;
  const crew = isRecord(garrison)
    ? (finite(readProperty(garrison, "crew")) ?? 0)
    : 0;
  const wounded = isRecord(garrison)
    ? (finite(readProperty(garrison, "wounded")) ?? 0)
    : 0;
  const fortress = readProperty(readProperty(root, "portal"), "fortress");
  const hellSoldiers = isRecord(fortress)
    ? (finite(readProperty(fortress, "garrison")) ?? 0)
    : 0;
  const fobTroops =
    finite(
      readProperty(readProperty(readProperty(root, "space"), "fob"), "troops"),
    ) ?? 0;
  switch (argument) {
    case "workers":
      return workers;
    case "max":
      return max;
    case "crew":
      return crew;
    case "wounded":
      return wounded;
    case "deadSoldiers":
      return max - workers;
    case "currentCityGarrison":
      return workers - crew - hellSoldiers - fobTroops;
    case "maxCityGarrison":
      return max - crew - hellSoldiers;
    case "hellSoldiers":
      return hellSoldiers;
    case "hellPatrols":
      return isRecord(fortress)
        ? (finite(readProperty(fortress, "patrols")) ?? 0)
        : 0;
    case "hellPatrolSize":
      return isRecord(fortress)
        ? (finite(readProperty(fortress, "patrol_size")) ?? 0)
        : 0;
    default:
      return undefined;
  }
}

/**
 * One stored numeric or boolean setting as the script's own numeric comparison sees it. The
 * compatibility reader compares with `>=`, so a boolean rides as 0 or 1 and only fails a count
 * above it, exactly like the script. Anything that is neither — strings, objects, absent keys —
 * stays unanswered rather than coerced.
 */
function storedSettingNumber(
  context: Readonly<CapturedConditionContext> | undefined,
  argument: unknown,
): number | undefined {
  if (typeof argument !== "string") return undefined;
  const value = context?.settings?.[argument];
  if (typeof value === "boolean") return Number(value);
  return finite(value);
}

/**
 * One entry of the cycle's own adjusted price for a building, stored as
 * `<building>.<resource>`. A priced building missing the named resource costs nothing in it,
 * exactly as the script's own `?? 0` reads; a building the cycle never priced leaves the
 * operand unanswered. An argument with no dot names no entry.
 */
function buildingCostAmount(
  context: Readonly<CapturedConditionContext> | undefined,
  argument: unknown,
): number | undefined {
  if (typeof argument !== "string") return undefined;
  const [buildingId, resourceId] = argument.split(".");
  if (buildingId === undefined || resourceId === undefined) return undefined;
  const price = context?.buildingCosts?.get(buildingId);
  if (price === undefined) return undefined;
  return finite(price.cost[resourceId]) ?? 0;
}

function readDate(root: unknown, argument: unknown): number | undefined {
  const days = finite(readProperty(readProperty(root, "stats"), "days"));
  if (argument === "total") return days;
  const race = readProperty(root, "race");
  if (argument === "impact") {
    if (days === undefined || !isRecord(race)) return undefined;
    // `race.orbit_decay` exists only in the Orbit Decay scenario; the game leaves it out
    // everywhere else, which the script reports as the scenario not running.
    const decay = readProperty(race, "orbit_decay");
    return decay ? Number(decay) - days : -1;
  }
  if (typeof argument !== "string") return undefined;
  return finite(
    readProperty(
      readProperty(readProperty(root, "city"), "calendar"),
      argument,
    ),
  );
}

/** The numeric operands, each a direct read of one captured root field. */
function readNumber(
  root: unknown,
  type: string,
  argument: unknown,
  context?: Readonly<CapturedConditionContext>,
): number | undefined {
  switch (type) {
    case "BuildingCost":
      return buildingCostAmount(context, argument);
    case "SettingCurrent":
    case "SettingDefault":
      return storedSettingNumber(context, argument);
    case "BuildingCount":
      return finite(readProperty(structureState(root, argument), "count"));
    case "BuildingEnabled":
      return switchedCount(context, argument, "on");
    case "BuildingDisabled":
      return switchedCount(context, argument, "off");
    case "ProjectCount":
      return finite(readProperty(projectRecord(root, argument), "rank"));
    case "ProjectProgress":
      return finite(readProperty(projectRecord(root, argument), "complete"));
    case "ResourceQuantity":
      return finite(readProperty(resourceRecord(root, argument), "amount"));
    case "ResourceStorage":
      return finite(readProperty(resourceRecord(root, argument), "max"));
    case "ResourceMaxCost": {
      // The largest single cost the commitments name. Without the demand pass there is no
      // accumulation to read, so unanswered rather than zero.
      if (typeof argument !== "string") return undefined;
      if (demandResourceRecord(root, argument) === undefined) return undefined;
      return finite(context?.demand?.maxCost?.(argument));
    }
    case "ResourceSatisfyRatio":
      return demandUsefulRatio(root, context?.demand, argument);
    case "ResourceRatio": {
      const amount = finite(
        readProperty(resourceRecord(root, argument), "amount"),
      );
      const maximum = finite(
        readProperty(resourceRecord(root, argument), "max"),
      );
      if (amount === undefined || maximum === undefined) return undefined;
      return maximum > 0 ? amount / maximum : 1;
    }
    case "TraitLevel": {
      const race = readProperty(root, "race");
      if (!isRecord(race) || typeof argument !== "string") return undefined;
      // A trait the race does not have is simply absent from the bag, which the script reads
      // as level 0.
      return finite(readProperty(race, argument)) ?? 0;
    }
    case "JobWorkers":
      return jobWorkers(root, argument);
    case "JobMax":
      return jobMax(root, argument);
    case "JobCount":
      return jobCount(root, argument);
    case "JobServants":
      return jobServantCount(root, argument);
    case "Other": {
      if (argument === "tpfleet") {
        const ships = readProperty(
          readProperty(readProperty(root, "space"), "shipyard"),
          "ships",
        );
        return Array.isArray(ships) ? ships.length : 0;
      }
      if (argument === "mrelay") {
        // An absent relay keeps the historical NaN result rather than reading as uncharged.
        return (
          Number(
            readProperty(
              readProperty(readProperty(root, "space"), "m_relay"),
              "charged",
            ),
          ) / 10000.0
        );
      }
      if (argument === "alevel") {
        // The script reports the level as the number of challenges taken, so one less than the
        // game's own count.
        const level = ascensionLevel(root);
        return level === undefined ? undefined : level - 1;
      }
      if (argument === "bcar") {
        const damaged = readProperty(
          readProperty(readProperty(root, "portal"), "carport"),
          "damaged",
        );
        return typeof damaged === "number" ? damaged : 0;
      }
      if (argument === "satcost") {
        // The satellite's next-copy Money price from the cycle's shared priced pass. A cost the
        // game never bound a control for is not one the cost reader can probe, so it stays
        // unanswered rather than reading as free.
        const price = context?.buildingCosts?.get(SWARM_SATELLITE_ACTION_ID);
        if (price === undefined) return undefined;
        return finite(price.cost["Money"]) ?? 0;
      }
      if (argument === "tknow") {
        // The Knowledge the most expensive offered technology costs, from the knowledge gate's
        // own figure: queue, trigger, and build-target Knowledge are not research, so the gate
        // (and this operand, per its own description) counts technologies only. Without the
        // sample there is nothing to answer from.
        return finite(context?.knowledgeRequiredByTechs);
      }
      return undefined;
    }
    case "Date":
      return readDate(root, argument);
    case "Queue":
      if (argument === "queue") return queueLength(root, "queue");
      if (argument === "r_queue") return queueLength(root, "r_queue");
      if (argument === "evo") {
        // The player's own evolution plan, stored alongside the triggers. Anything but an array
        // is a broken setting rather than an empty plan, so it stays unanswered.
        const planned = context?.settings?.["evolutionQueue"];
        return Array.isArray(planned) ? planned.length : undefined;
      }
      return undefined;
    case "Industry":
      if (argument === "smelters") return smelterSlots(root);
      // The factory line pool, from the one module that owns that upstream rule for the captured
      // runtime. See `factorySlots` for what this answers and what it deliberately does not.
      if (argument === "factories") return factorySlots(root);
      return undefined;
    case "Soldiers":
      return soldierCount(root, argument);
    default:
      return undefined;
  }
}

/** The boolean operands, compared for equality against the stored count. */
function readBoolean(
  root: unknown,
  type: string,
  argument: unknown,
  context: Readonly<CapturedConditionContext> | undefined,
): boolean | undefined {
  switch (type) {
    case "ResearchUnlocked": {
      // The research panel's own offer set: path, qualifications and requirements all met and not
      // yet granted. Without that pass there is nothing to answer from.
      if (typeof argument !== "string") return undefined;
      return context?.offeredTechs?.has(argument);
    }
    case "ResearchComplete": {
      // The game renders every granted technology under its own action id, which is the only
      // captured route to completion: the grant keys are private to its action catalog. A
      // technology the current path never draws at all reads as incomplete, exactly as the
      // compatibility runtime's DOM read did.
      if (typeof argument !== "string") return undefined;
      return context?.grantedTechs?.has(argument);
    }
    case "ProjectUnlocked": {
      // The A.R.P.A. panel draws exactly the projects the game is offering: one whose
      // requirements are unmet, whose tech path excludes it, or which has reached its rank cap is
      // drawn nowhere. That is the same thing the compatibility runtime's Vue-binding read
      // reported, so panel membership is the whole answer — and a panel with no rows at all is a
      // real "nothing unlocked", not an absent one.
      if (typeof argument !== "string") return undefined;
      return context?.unlockedProjects?.has(argument);
    }
    case "BuildingUnlocked": {
      // A building row is drawn for exactly the buildings that passed the game's own offer gate,
      // and it stays drawn once built, so panel membership is the answer. Regions are per-sub-tab
      // and each costs a pass, so only the sampled ones can be spoken for: an id under any other
      // region is unanswered rather than reported as locked.
      if (typeof argument !== "string") return undefined;
      const parts = splitActionId(argument);
      if (parts === undefined) return undefined;
      const sample = context?.buildingUnlocks;
      if (sample === undefined) return undefined;
      if (!sample.regions.has(parts.region)) return undefined;
      return sample.unlocked.has(argument);
    }
    case "BuildingAffordable": {
      // The game's `isAffordable(true)`: every positive cost has to name a displayed resource and
      // fit under that resource's capacity. It asks nothing about whether the building is offered,
      // so an unbuilt or locked building still has an answer — the cost is what is being judged.
      if (typeof argument !== "string") return undefined;
      const price = context?.buildingCosts?.get(argument);
      if (price === undefined) return undefined;
      // Once the game splits its resources by supply zone the capacity compared against is the
      // paying pool's share, which the same probe that priced the building reported.
      return costFitsStorage(root, price.cost, { pool: price.pool });
    }
    case "BuildingQueued": {
      // Membership in the game build queue, which is what the script's own queued-target list
      // holds for buildings: the displayed queue's first entry, or every entry with the queue's
      // "buy any affordable" setting on. A hidden queue is an empty list, so false rather than
      // unanswered — but an argument naming no `<region>-<id>` pair names no building at all. The
      // pause flag is deliberately not consulted: the script lists a paused queue's entries just
      // the same, while the reservation sample (which asks what is being saved for) honors it.
      if (typeof argument !== "string") return undefined;
      if (splitActionId(argument) === undefined) return undefined;
      const queue = readProperty(root, "queue");
      if (!isRecord(queue) || !readProperty(queue, "display")) return false;
      const entries = readProperty(queue, "queue");
      if (!Array.isArray(entries)) return false;
      const settings = readProperty(root, "settings");
      const considered = readProperty(settings, "qAny")
        ? entries
        : entries.slice(0, 1);
      return considered.some((entry) => readProperty(entry, "id") === argument);
    }
    case "Boolean":
      return typeof argument === "boolean" ? argument : undefined;
    case "ResourceUnlocked": {
      const entry = resourceRecord(root, argument);
      return isRecord(entry)
        ? readProperty(entry, "display") === true
        : undefined;
    }
    case "ResourceDemanded": {
      // Whether something else is accumulating the resource. Without the demand pass there is no
      // accumulation to consult, so unanswered rather than content.
      if (typeof argument !== "string") return undefined;
      if (demandResourceRecord(root, argument) === undefined) return undefined;
      return context?.demand?.isDemanded(argument);
    }
    case "ResourceSatisfied": {
      const ratio = demandUsefulRatio(root, context?.demand, argument);
      return ratio === undefined ? undefined : ratio >= 1;
    }
    case "JobUnlocked": {
      if (typeof argument !== "string") return undefined;
      const entry = civicJob(root, argument);
      if (isRecord(entry)) return Boolean(readProperty(entry, "display"));
      // Crafting jobs unlock with their resource rather than a civic entry.
      const resource = resourceRecord(root, argument);
      if (isRecord(resource)) return Boolean(readProperty(resource, "display"));
      return undefined;
    }
    case "Challenge": {
      const race = readProperty(root, "race");
      if (!isRecord(race) || typeof argument !== "string") return undefined;
      // Challenge flags are only present while their challenge is active.
      return Boolean(readProperty(race, argument));
    }
    case "Universe": {
      const race = readProperty(root, "race");
      return isRecord(race)
        ? readProperty(race, "universe") === argument
        : undefined;
    }
    case "Government": {
      const civic = readProperty(root, "civic");
      if (!isRecord(civic)) return undefined;
      // `civic.govern` is created when the first government is chosen; before that no government
      // type matches.
      return readProperty(readProperty(civic, "govern"), "type") === argument;
    }
    case "Governor": {
      const race = readProperty(root, "race");
      if (!isRecord(race)) return undefined;
      // Mirrors the script's own governor reader: the background id, or "none".
      const background = readProperty(
        readProperty(readProperty(race, "governor"), "g"),
        "bg",
      );
      return (background ?? "none") === argument;
    }
    case "ResetType": {
      // The prestige the player configured, read off the same stored settings the triggers came
      // from. Without that sample there is nothing to match against.
      if (typeof argument !== "string") return undefined;
      const settings = context?.settings;
      if (settings === undefined) return undefined;
      return settings["prestigeType"] === argument;
    }
    case "RacePillared":
      return racePillared(root, argument);
    case "MimicGenus": {
      const race = readProperty(root, "race");
      if (!isRecord(race)) return undefined;
      // `race.ss_genus` exists only while the Shapeshifter trait is imitating a genus.
      return (readProperty(race, "ss_genus") ?? "none") === argument;
    }
    case "PlanetBiome": {
      const city = readProperty(root, "city");
      return isRecord(city)
        ? readProperty(city, "biome") === argument
        : undefined;
    }
    case "PlanetTrait": {
      const traits = readProperty(readProperty(root, "city"), "ptrait");
      return Array.isArray(traits) ? traits.includes(argument) : undefined;
    }
    default:
      return undefined;
  }
}

/** One operand's current value, or `undefined` when the capture cannot answer it. */
export function readCapturedOperand(
  root: unknown,
  type: unknown,
  argument: unknown,
  context?: Readonly<CapturedConditionContext>,
): CapturedOperandValue | undefined {
  if (typeof type !== "string") return undefined;
  return BOOLEAN_OPERANDS.has(type)
    ? readBoolean(root, type, argument, context)
    : readNumber(root, type, argument, context);
}

/**
 * Whether a stored condition holds right now, or `undefined` when its operand is not captured.
 * `context` carries the cycle's non-root passes; omitting it leaves their operands unanswered.
 *
 * Boolean operands compare equal to the stored count and numeric ones compare `>=`, which is the
 * script's own rule. The count is coerced the same way the script's `==` did: `true` matches 1 and
 * `false` matches 0.
 */
export function evaluateCapturedCondition(
  root: unknown,
  type: unknown,
  argument: unknown,
  count: unknown,
  context?: Readonly<CapturedConditionContext>,
): boolean | undefined {
  const value = readCapturedOperand(root, type, argument, context);
  if (value === undefined) return undefined;
  const target = Number(count);
  if (!Number.isFinite(target)) return undefined;
  return typeof value === "boolean"
    ? Number(value) === target
    : value >= target;
}
