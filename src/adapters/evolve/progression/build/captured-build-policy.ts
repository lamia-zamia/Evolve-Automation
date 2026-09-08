/**
 * Samples the script-owned part of the captured city-building policy.
 *
 * This is intentionally the small bridge between page capture and the existing construction
 * contract: the game decides which city controls exist, while persisted script settings decide
 * which of those controls are managed, their configured order weight, and their cap. Dynamic
 * weighting remains a separate migration because it needs the game's broader production sample.
 */

import type { ConstructionCycleOptions } from "../../../../ports/construction-candidates.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import type { CapturedBuildTarget } from "./captured-build.ts";
import type { ScriptBuildPolicy } from "./script-build-policy.ts";

export interface CapturedBuildPolicyDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettings: () => unknown;
  readonly onSkipped?: (key: string, reason: string) => void;
}

const UNLIMITED = Number.MAX_SAFE_INTEGER;

function readFiniteSetting(
  settings: Record<PropertyKey, unknown>,
  key: string,
  defaultValue: number,
): number | undefined {
  const value = settings[key];
  if (value === undefined) return defaultValue;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readOptions(
  settings: Record<PropertyKey, unknown>,
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
    respectReservations: true,
    saveWhiteholeGems:
      settings["prestigeType"] === "whitehole" &&
      Boolean(settings["prestigeWhiteholeSaveGems"]),
  });
}

function readTarget(
  settings: Record<PropertyKey, unknown>,
  city: Record<PropertyKey, unknown>,
  elementId: string,
  onSkipped: (key: string, reason: string) => void,
): Readonly<CapturedBuildTarget> | undefined {
  if (!elementId.startsWith("city-") || elementId.length === "city-".length) {
    return undefined;
  }
  const binding = elementId;
  // `bat…` is the script's managed-building switch. Non-building city actions have no such key in
  // the reset settings and therefore remain outside this adapter's construction family.
  if (settings[`bat${binding}`] !== true) return undefined;
  const id = elementId.slice("city-".length);
  if (!isRecord(readProperty(city, id))) {
    onSkipped(binding, "captured city state is unavailable");
    return undefined;
  }
  const weighting = readFiniteSetting(settings, `bld_w_${binding}`, 100);
  if (weighting === undefined) {
    onSkipped(binding, "configured weighting is not finite");
    return undefined;
  }
  const maximum = readFiniteSetting(settings, `bld_m_${binding}`, UNLIMITED);
  if (maximum === undefined) {
    onSkipped(binding, "configured maximum is not finite");
    return undefined;
  }
  return Object.freeze({
    key: binding,
    elementId,
    region: "city",
    id,
    weighting,
    maximum: maximum >= 0 ? maximum : UNLIMITED,
    important: false,
  });
}

export function createCapturedBuildPolicyReader({
  rootState,
  controls,
  getSettings,
  onSkipped,
}: CapturedBuildPolicyDependencies): () => ScriptBuildPolicy {
  const reportSkipped = onSkipped ?? (() => {});
  return () => {
    const settings = getSettings();
    const root = rootState.readRoot();
    const city = readProperty(root, "city");
    const buildings: Readonly<CapturedBuildTarget>[] = [];
    if (isRecord(settings) && isRecord(city)) {
      for (const elementId of controls.capturedElementIds()) {
        const target = readTarget(settings, city, elementId, reportSkipped);
        if (target !== undefined) buildings.push(target);
      }
    }
    return Object.freeze({
      buildings: Object.freeze(buildings),
      ...readOptions(isRecord(settings) ? settings : {}),
    });
  };
}
