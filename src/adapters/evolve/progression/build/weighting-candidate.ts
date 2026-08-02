import type { BuildingWeightingCandidate } from "../../../../domain/progression/build/building-weighting.ts";
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

const call = (
  record: UnknownRecord,
  method: string,
  path: string,
  ...args: readonly unknown[]
): unknown =>
  requireFunction(record[method], `${path}.${method}`).apply(record, [...args]);

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
 * Four answers are only sampled while the building is unlocked. A locked
 * building has no `definition`, so `powered` and `isAffordable()` throw on it
 * and its consumption rates cannot be evaluated, and `cost` still holds
 * whatever it held before the building locked because
 * `updateResourceRequirements` returns early. The `locked` rule zeroes such a
 * candidate before any rule reads them, so they are reported as neutral rather
 * than sampled.
 */
export function readWeightingCandidate(
  building: unknown,
): BuildingWeightingCandidate {
  const record = requireRecord(building, "BuildingManager.priorityList entry");
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
  return Object.freeze({
    id,
    name: requireString(record["name"], `${path}.name`),
    actionId: requireString(record["_id"], `${path}._id`),
    tab: requireString(record["_tab"], `${path}._tab`),
    location: requireString(record["_location"], `${path}._location`),
    unlocked,
    // `autoBuildEnabled` chains on `settings["bat" + binding]` and
    // `isSmartManaged()` on two more settings, none of which exist until that
    // building's toggle is first written. Both keep the game's truthiness test.
    autoBuildEnabled: Boolean(record["autoBuildEnabled"]),
    smartManaged: callBoolean(record, "isSmartManaged", path),
    count: requireNumber(record["count"], `${path}.count`),
    autoMax: requireNumber(record["autoMax"], `${path}.autoMax`),
    // `_weighting` forwards the building's own weight setting, which the
    // defaults write for every catalog building, so it is always a number.
    baseWeight: requireNumber(record["_weighting"], `${path}._weighting`),
    stateOffCount: requireNumber(
      record["stateOffCount"],
      `${path}.stateOffCount`,
    ),
    housing: Boolean(flags["housing"]),
    garrison: Boolean(flags["garrison"]),
    knowledge: Boolean(flags["knowledge"]),
    randomlyWeighted: Boolean(flags["random"]),
    // Only a ResourceAction records the resource it produces directly.
    producedResource:
      record["resourceKey"] === undefined
        ? null
        : requireString(record["resourceKey"], `${path}.resourceKey`),
    // `isAffordable()` forwards the game's own `checkAffordable`, which keeps
    // the game's truthiness test.
    affordable: unlocked && callBoolean(record, "isAffordable", path, true),
    powered: unlocked ? requireNumber(record["powered"], `${path}.powered`) : 0,
    cost: unlocked ? readCost(record, path) : EMPTY_COST,
    missingConsumption: unlocked
      ? resourceName(
          call(record, "getMissingConsumption", path),
          `${path}.getMissingConsumption()`,
        )
      : null,
    missingSupport: unlocked
      ? resourceName(
          call(record, "getMissingSupport", path),
          `${path}.getMissingSupport()`,
        )
      : null,
    uselessSupport: unlocked
      ? resourceName(
          call(record, "getUselessSupport", path),
          `${path}.getUselessSupport()`,
        )
      : null,
  });
}
