/**
 * Stored condition operands answered entirely from the captured game root.
 *
 * A stored trigger condition names an operand type, an argument and a count. This module answers
 * the operand types whose whole input is the game's own root state: building and project counts,
 * civic job assignments, resource holdings, the appointed governor, the race and planet bags, the
 * calendar, the two build queues, the ascension level and pillar ranks, and the True Path fleet,
 * Mass Relay, and carport fields.
 *
 * It also answers the operands the root cannot supply but a drawn panel can. The game's grant
 * keys live in its private action catalog, so `ResearchUnlocked` and `ResearchComplete` are read
 * from the research panel the cycle already drew; `ProjectUnlocked` is read the same way from the
 * A.R.P.A. panel. Those come in through `CapturedConditionContext`, and a condition naming one
 * goes unanswered whenever the pass it needs was not taken.
 *
 * Everything else a condition can name — script-computed resource fields, the settings layer,
 * custom expressions, building unlock and clickability states, manager-computed values, and
 * anything needing the module-level race catalog or a private action definition — is deliberately
 * absent.
 *
 * `undefined` has exactly one meaning here: the operand cannot be answered from what has been
 * captured. It is never "false" and never "zero", so a caller has to drop the condition rather
 * than decide on it.
 */

import { isRecord, readProperty } from "../validation.ts";

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
}

/**
 * Operand types whose value is compared for equality instead of `>=`, mirroring the script's own
 * `retBools` list. Only the entries this module answers are listed.
 */
const BOOLEAN_OPERANDS: ReadonlySet<string> = new Set([
  "Boolean",
  "ResourceUnlocked",
  "JobUnlocked",
  "ResearchUnlocked",
  "ResearchComplete",
  "ProjectUnlocked",
  "Challenge",
  "Universe",
  "Government",
  "Governor",
  "RacePillared",
  "MimicGenus",
  "PlanetBiome",
  "PlanetTrait",
]);

function finiteValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * The mutable structure record behind an action id: `city-farm` is `city.farm`. Region and id are
 * the two halves of the id the game renders the action under, which is how the game itself stores
 * every tabbed structure.
 */
function structureState(root: unknown, argument: unknown): unknown {
  if (typeof argument !== "string") return undefined;
  const separator = argument.indexOf("-");
  if (separator <= 0) return undefined;
  const region = readProperty(root, argument.slice(0, separator));
  return readProperty(region, argument.slice(separator + 1));
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
  const assigned = finiteValue(
    readProperty(civicJob(root, argument), "workers"),
  );
  if (assigned !== undefined) return assigned;
  return finiteValue(readProperty(foundryRecord(root), argument));
}

/** Whether the argument names a job at all: a civic entry or a foundry assignment. */
function jobExists(root: unknown, argument: unknown): boolean {
  if (typeof argument !== "string") return false;
  if (isRecord(civicJob(root, argument))) return true;
  return finiteValue(readProperty(foundryRecord(root), argument)) !== undefined;
}

/**
 * Assigned servants: the servant table for an ordinary job, the skilled-servant table for a
 * crafting job, and zero for a job that takes none — but only when the argument names a job.
 * An unknown id is unanswerable rather than zero, matching the compatibility lookup's throw.
 */
function jobServantCount(root: unknown, argument: unknown): number | undefined {
  if (typeof argument !== "string") return undefined;
  const servants = readProperty(readProperty(root, "race"), "servants");
  const assigned = finiteValue(
    readProperty(readProperty(servants, "jobs"), argument),
  );
  if (assigned !== undefined) return assigned;
  const skilled = finiteValue(
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
  if (isRecord(entry)) return finiteValue(readProperty(entry, "max"));
  // Crafting jobs share the one cap on the craftsman entry.
  if (!jobExists(root, argument)) return undefined;
  return finiteValue(
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
  const rank = finiteValue(readProperty(pillars, raceId));
  return rank !== undefined && rank >= level;
}

function queueLength(root: unknown, key: string): number | undefined {
  const entries = readProperty(readProperty(root, key), "queue");
  return Array.isArray(entries) ? entries.length : undefined;
}

function readDate(root: unknown, argument: unknown): number | undefined {
  const days = finiteValue(readProperty(readProperty(root, "stats"), "days"));
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
  return finiteValue(
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
): number | undefined {
  switch (type) {
    case "BuildingCount":
      return finiteValue(readProperty(structureState(root, argument), "count"));
    case "ProjectCount":
      return finiteValue(readProperty(projectRecord(root, argument), "rank"));
    case "ProjectProgress":
      return finiteValue(
        readProperty(projectRecord(root, argument), "complete"),
      );
    case "ResourceQuantity":
      return finiteValue(
        readProperty(resourceRecord(root, argument), "amount"),
      );
    case "ResourceStorage":
      return finiteValue(readProperty(resourceRecord(root, argument), "max"));
    case "ResourceRatio": {
      const amount = finiteValue(
        readProperty(resourceRecord(root, argument), "amount"),
      );
      const maximum = finiteValue(
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
      return finiteValue(readProperty(race, argument)) ?? 0;
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
      return undefined;
    }
    case "Date":
      return readDate(root, argument);
    case "Queue":
      if (argument === "queue") return queueLength(root, "queue");
      if (argument === "r_queue") return queueLength(root, "r_queue");
      return undefined;
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
    case "Boolean":
      return typeof argument === "boolean" ? argument : undefined;
    case "ResourceUnlocked": {
      const entry = resourceRecord(root, argument);
      return isRecord(entry)
        ? readProperty(entry, "display") === true
        : undefined;
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
    : readNumber(root, type, argument);
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
