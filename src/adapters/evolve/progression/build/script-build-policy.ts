/**
 * Converts the script's refreshed dynamic building order into the captured construction contract.
 *
 * The compatibility manager remains the temporary owner of the weighting calculation: it samples
 * the script's existing weighting policy, then this adapter copies only the normalized target
 * fields the captured planner needs. No manager object crosses into the captured construction
 * source, and the captured source still owns root-state reads and game-command execution.
 */

import type { BuildConsumptionView } from "../../../../domain/progression/build/build.ts";
import type { ConstructionCycleOptions } from "../../../../ports/construction-candidates.ts";
import type { CapturedBuildTarget } from "./captured-build.ts";
import { readWeightingCandidate } from "./weighting-candidate.ts";
import {
  requireArray,
  requireFunction,
  requireNonEmptyString,
  requireNumber,
  requireRecord,
  readProperty,
  type UnknownRecord,
} from "../../../validation.ts";

export interface ScriptBuildPolicy {
  readonly buildings: readonly Readonly<CapturedBuildTarget>[];
  readonly consumptionMode: ConstructionCycleOptions["consumptionMode"];
  readonly buildIfStorageFull: boolean;
  readonly ignoreZeroRate: boolean;
  readonly respectReservations: boolean;
  readonly saveWhiteholeGems: boolean;
}

export interface ScriptBuildPolicyDependencies {
  readonly getBuildingManager: () => unknown;
  readonly getSettings: () => unknown;
  /** Reports one malformed managed target and keeps the other targets usable. */
  readonly onSkipped?: (key: string, reason: string) => void;
}

function callMethod(
  record: UnknownRecord,
  name: string,
  path: string,
): unknown {
  const method = requireFunction(record[name], `${path}.${name}`);
  return Reflect.apply(method, record, []);
}

function readConsumption(
  record: UnknownRecord,
  path: string,
): readonly Readonly<BuildConsumptionView>[] {
  return Object.freeze(
    requireArray(record["consumption"], `${path}.consumption`).map(
      (raw, index) => {
        const entryPath = `${path}.consumption[${index}]`;
        const entry = requireRecord(raw, entryPath);
        const resource = requireRecord(
          entry["resource"],
          `${entryPath}.resource`,
        );
        return Object.freeze({
          resourceId: requireNonEmptyString(
            resource["_id"],
            `${entryPath}.resource._id`,
          ),
          nonNegativeRate: Number(entry["rate"]) >= 0,
        });
      },
    ),
  );
}

function readTarget(
  raw: unknown,
  index: number,
): Readonly<CapturedBuildTarget> {
  const path = `BuildingManager.managedPriorityList()[${index}]`;
  const record = requireRecord(raw, path);
  const candidate = readWeightingCandidate(record);
  const flags = requireRecord(record["is"], `${path}.is`);
  const definition = readProperty(record, "definition");
  const declaredRegion = readProperty(definition, "region");
  const region =
    typeof declaredRegion === "string" && declaredRegion.length > 0
      ? declaredRegion
      : candidate.tab;
  return Object.freeze({
    key: candidate.id,
    elementId: requireNonEmptyString(
      readProperty(record, "elementId"),
      `${path}.elementId`,
    ),
    region: requireNonEmptyString(region, `${path}.region`),
    id: candidate.actionId,
    weighting: requireNumber(record["weighting"], `${path}.weighting`),
    maximum: candidate.autoMax,
    knowledge: candidate.knowledge,
    important: Boolean(flags["important"]),
    consumption: readConsumption(record, path),
  });
}

function readOptions(
  settings: UnknownRecord,
): Omit<ScriptBuildPolicy, "buildings"> {
  const rawMode = settings["buildingConsumptionCheck"];
  const consumptionMode: ConstructionCycleOptions["consumptionMode"] =
    rawMode === "perResource"
      ? "perResource"
      : rawMode === "unlimited"
        ? "unlimited"
        : "onePerTick";
  return Object.freeze({
    consumptionMode,
    buildIfStorageFull: Boolean(settings["buildingBuildIfStorageFull"]),
    ignoreZeroRate: Boolean(settings["buildingsIgnoreZeroRate"]),
    // Reservation enforcement is the captured construction contract's safe default; the legacy
    // build settings have no separate opt-out for it.
    respectReservations: true,
    saveWhiteholeGems:
      settings["prestigeType"] === "whitehole" &&
      Boolean(settings["prestigeWhiteholeSaveGems"]),
  });
}

export function createScriptBuildPolicyReader({
  getBuildingManager,
  getSettings,
  onSkipped,
}: ScriptBuildPolicyDependencies): () => ScriptBuildPolicy {
  return () => {
    const manager = requireRecord(getBuildingManager(), "BuildingManager");
    callMethod(manager, "updateWeighting", "BuildingManager");
    const managed = requireArray(
      callMethod(manager, "managedPriorityList", "BuildingManager"),
      "BuildingManager.managedPriorityList()",
    );
    const buildings: Readonly<CapturedBuildTarget>[] = [];
    for (const [index, raw] of managed.entries()) {
      try {
        buildings.push(readTarget(raw, index));
      } catch (error) {
        const key = String(readProperty(raw, "catalogKey") ?? index);
        onSkipped?.(key, String(error));
      }
    }
    return Object.freeze({
      buildings: Object.freeze(buildings),
      ...readOptions(requireRecord(getSettings(), "settings")),
    });
  };
}
