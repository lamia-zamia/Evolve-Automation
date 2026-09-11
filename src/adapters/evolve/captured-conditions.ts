/**
 * Stored condition operands answered entirely from the captured game root.
 *
 * A stored trigger condition names an operand type, an argument and a count. This module answers
 * the operand types whose whole input is the game's own root state: building and project counts,
 * resource holdings, the race and planet bags, the calendar and the two build queues. Everything
 * else a condition can name — script-computed resource fields, the settings layer, custom
 * expressions, and anything needing a drawn catalog or a private action definition — is
 * deliberately absent.
 *
 * `undefined` has exactly one meaning here: the operand cannot be answered from what has been
 * captured. It is never "false" and never "zero", so a caller has to drop the condition rather
 * than decide on it.
 */

import { isRecord, readProperty } from "../validation.ts";

/** A condition compares an operand's value against its stored count. */
export type CapturedOperandValue = boolean | number;

/**
 * Operand types whose value is compared for equality instead of `>=`, mirroring the script's own
 * `retBools` list. Only the entries this module answers are listed.
 */
const BOOLEAN_OPERANDS: ReadonlySet<string> = new Set([
  "Boolean",
  "ResourceUnlocked",
  "Challenge",
  "Universe",
  "Government",
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
): boolean | undefined {
  switch (type) {
    case "Boolean":
      return typeof argument === "boolean" ? argument : undefined;
    case "ResourceUnlocked": {
      const entry = resourceRecord(root, argument);
      return isRecord(entry)
        ? readProperty(entry, "display") === true
        : undefined;
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

/** One operand's current value, or `undefined` when the captured root cannot answer it. */
export function readCapturedOperand(
  root: unknown,
  type: unknown,
  argument: unknown,
): CapturedOperandValue | undefined {
  if (typeof type !== "string") return undefined;
  return BOOLEAN_OPERANDS.has(type)
    ? readBoolean(root, type, argument)
    : readNumber(root, type, argument);
}

/**
 * Whether a stored condition holds right now, or `undefined` when its operand is not captured.
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
): boolean | undefined {
  const value = readCapturedOperand(root, type, argument);
  if (value === undefined) return undefined;
  const target = Number(count);
  if (!Number.isFinite(target)) return undefined;
  return typeof value === "boolean"
    ? Number(value) === target
    : value >= target;
}
