import type { BuildingWeightingCandidate } from "../../../../domain/progression/build/building-weighting.ts";
import type { PhaseTimingSink } from "../../../../utils/performance.ts";
import {
  callBoolean,
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../../validation.ts";

const EMPTY_COST: Readonly<Record<string, number>> = Object.freeze({});

const SAMPLE_PREFIX = "autoBuild.weighting.sample.";

/**
 * Shared no-op so the disabled path allocates nothing per candidate: the marks
 * sit in a loop whose cost is the thing they exist to measure.
 */
const NO_MARK = (_phase: string): void => {};

/** As `callBoolean`, except the caller validates the answer it asked for. */
const call = (
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): unknown =>
  Reflect.apply(requireFunction(record[name], `${path}.${name}`), record, args);

/**
 * The `name` of the resource a consumption answer named, or `null` when it
 * named none. The three consumption answers return a resource wrapper.
 */
const resourceName = (value: unknown, path: string): string | null =>
  value === null || value === undefined
    ? null
    : requireString(requireRecord(value, path)["name"], `${path}.name`);

const readCost = (
  record: UnknownRecord,
  path: string,
): Readonly<Record<string, number>> => {
  const cost = requireRecord(record["cost"], `${path}.cost`);
  const amounts: Record<string, number> = {};
  for (const [resource, amount] of Object.entries(cost)) {
    amounts[resource] = requireNumber(amount, `${path}.cost.${resource}`);
  }
  return Object.freeze(amounts);
};

/**
 * Projects one live building wrapper into the immutable candidate the weighting
 * rules read.
 *
 * Only `id`, `unlocked`, `baseWeight` and the wrapper's own plain properties
 * are sampled unconditionally. Every answer that costs a settings lookup, a
 * game-state walk or a `definition` read is taken only while the building is
 * unlocked, and reported as neutral otherwise.
 *
 * That is safe because of where the `locked` rule sits: it is second in the
 * rule list, the only rule ahead of it reads the phase snapshot alone, and it
 * zeroes the weight, which stops the loop. So no rule and no `describe` call
 * ever reads a locked candidate's other fields. `weighting-policy-test.mjs`
 * pins that ordering; if a rule is ever inserted ahead of `locked`, or `locked`
 * stops zeroing, that test fails and this guard has to be revisited.
 *
 * Some of the guarded answers cannot be taken at all while locked: a locked
 * building has no `definition`, so `powered` and `isAffordable()` throw on it
 * and its consumption rates cannot be evaluated, and `cost` still holds
 * whatever it held before the building locked because
 * `updateResourceRequirements` returns early. The rest are guarded for cost
 * alone: on a late-game save 353 of 404 candidates are locked, and the four
 * `flags` answers were the dominant field of the weighting sample.
 *
 * `timing` is the caller's already-resolved sink: `undefined` unless the
 * diagnostics toggle was on when the weighting phase began. When present, each
 * sampled answer is charged to its own sub-phase, because the phase total alone
 * does not say which of the game calls below is the expensive one. The fields
 * are read into locals rather than straight into the literal so the marks can
 * sit between them.
 */
export function readWeightingCandidate(
  building: unknown,
  timing?: PhaseTimingSink,
): BuildingWeightingCandidate {
  const record = requireRecord(building, "BuildingManager.priorityList entry");
  let mark = NO_MARK;
  if (timing !== undefined) {
    const sink = timing;
    let markedAtMs = sink.nowMs();
    mark = (phase) => {
      const nowMs = sink.nowMs();
      sink.recordPerformance(`${SAMPLE_PREFIX}${phase}`, nowMs - markedAtMs);
      markedAtMs = nowMs;
    };
  }

  const id = requireString(
    record["catalogKey"],
    "BuildingManager.priorityList entry.catalogKey",
  );
  const path = `buildings.${id}`;
  // `is` carries only the flags a building declares, so every other flag is
  // absent rather than false.
  const flags = requireRecord(record["is"], `${path}.is`);
  // `Action.isUnlocked()` is an exact boolean: it either fails one of the tab
  // tests or answers whether the building has a Vue view.
  const unlocked = requireBoolean(
    call(record, "isUnlocked", path),
    `${path}.isUnlocked()`,
  );
  mark("unlocked");

  // `autoBuildEnabled` chains on `settings["bat" + binding]` and
  // `isSmartManaged()` on two more settings plus its own `isUnlocked()`, none
  // of which exist until that building's toggle is first written. Both keep the
  // game's truthiness test. `count` walks `isMission()` and the game instance,
  // and `stateOffCount` walks `hasState()` and the instance again.
  const autoBuildEnabled = unlocked && Boolean(record["autoBuildEnabled"]);
  const smartManaged = unlocked && callBoolean(record, "isSmartManaged", path);
  const count = unlocked ? requireNumber(record["count"], `${path}.count`) : 0;
  const stateOffCount = unlocked
    ? requireNumber(record["stateOffCount"], `${path}.stateOffCount`)
    : 0;
  mark("flags");

  // `isAffordable()` forwards the game's own `checkAffordable`, which keeps
  // the game's truthiness test.
  const affordable =
    unlocked && callBoolean(record, "isAffordable", path, true);
  mark("affordable");

  const powered = unlocked
    ? requireNumber(record["powered"], `${path}.powered`)
    : 0;
  mark("powered");

  const cost = unlocked ? readCost(record, path) : EMPTY_COST;
  mark("cost");

  const missingConsumption = unlocked
    ? resourceName(
        call(record, "getMissingConsumption", path),
        `${path}.getMissingConsumption()`,
      )
    : null;
  mark("missingConsumption");

  const missingSupport = unlocked
    ? resourceName(
        call(record, "getMissingSupport", path),
        `${path}.getMissingSupport()`,
      )
    : null;
  mark("missingSupport");

  const uselessSupport = unlocked
    ? resourceName(
        call(record, "getUselessSupport", path),
        `${path}.getUselessSupport()`,
      )
    : null;
  mark("uselessSupport");

  return Object.freeze({
    id,
    name: requireString(record["name"], `${path}.name`),
    actionId: requireString(record["_id"], `${path}._id`),
    tab: requireString(record["_tab"], `${path}._tab`),
    location: requireString(record["_location"], `${path}._location`),
    unlocked,
    autoBuildEnabled,
    smartManaged,
    count,
    // `autoMax` reads a setting and compares it against `gameMax`. Neutral for
    // a locked candidate is 0: it has none built and is to build none.
    autoMax: unlocked ? requireNumber(record["autoMax"], `${path}.autoMax`) : 0,
    // `_weighting` forwards the building's own weight setting, which the
    // defaults write for every catalog building, so it is always a number.
    baseWeight: requireNumber(record["_weighting"], `${path}._weighting`),
    stateOffCount,
    housing: Boolean(flags["housing"]),
    garrison: Boolean(flags["garrison"]),
    knowledge: Boolean(flags["knowledge"]),
    randomlyWeighted: Boolean(flags["random"]),
    // Only a ResourceAction records the resource it produces directly.
    producedResource:
      record["resourceKey"] === undefined
        ? null
        : requireString(record["resourceKey"], `${path}.resourceKey`),
    affordable,
    powered,
    cost,
    missingConsumption,
    missingSupport,
    uselessSupport,
  });
}
