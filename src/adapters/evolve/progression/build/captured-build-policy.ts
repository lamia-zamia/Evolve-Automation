/**
 * Samples the script-owned part of the captured city-building policy.
 *
 * This is intentionally the small bridge between page capture and the existing construction
 * contract: the game decides which city controls exist, while persisted script settings decide
 * which of those controls are managed, their configured order weight, and their cap. The first
 * captured dynamic rule boosts a managed building with no copies; the broader production sample
 * remains a separate migration.
 */

import {
  applyNewBuildingWeighting,
  applyNeedMoreStorageWeighting,
  applyNonOperatingCityWeighting,
  applyUselessMeditationWeighting,
  applyUselessHousingWeighting,
  applyVacuumCollapseWeighting,
  applyUnusedStorageWeighting,
} from "../../../../domain/progression/build/building-weighting.ts";
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

/**
 * The city buildings whose effect raises `resource.Knowledge.max` in DeadSpace, verified against
 * `actions.city` at the reference commit. The planner's Knowledge gate needs to know which
 * candidates answer a capacity shortage; the upstream effect that says so runs inside the game's
 * own module and has no captured route. Later regions have their own and are not in this sample.
 */
const KNOWLEDGE_BUILDINGS: ReadonlySet<string> = new Set([
  "university",
  "library",
  "wardenclyffe",
  "biolab",
]);

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

interface CapturedStorageParts {
  readonly unused: boolean;
  readonly allAssigned: boolean;
}

function readStorageParts(root: unknown): CapturedStorageParts | undefined {
  const resource = readProperty(root, "resource");
  const parts: ReadonlyArray<unknown> = [
    readProperty(resource, "Crates"),
    readProperty(resource, "Containers"),
  ];
  const ratios: number[] = [];
  for (const part of parts) {
    if (!isRecord(part)) return undefined;
    const amount = part["amount"];
    const maximum = part["max"];
    const display = part["display"];
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      typeof maximum !== "number" ||
      !Number.isFinite(maximum) ||
      typeof display !== "boolean"
    ) {
      return undefined;
    }
    ratios.push(maximum > 0 ? amount / maximum : 0);
  }
  const crates = parts[0];
  const containers = parts[1];
  return Object.freeze({
    unused: ratios.some((ratio) => ratio < 1),
    allAssigned:
      Boolean(readProperty(crates, "display")) &&
      Boolean(readProperty(containers, "display")) &&
      ratios.every((ratio) => ratio === 1),
  });
}

function readHousingUnderused(root: unknown): boolean | undefined {
  const population = readProperty(readProperty(root, "resource"), "Population");
  if (!isRecord(population)) return undefined;
  const amount = population["amount"];
  const maximum = population["max"];
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    typeof maximum !== "number" ||
    !Number.isFinite(maximum)
  ) {
    return undefined;
  }
  return maximum > 50 && amount / maximum < 0.9;
}

function readUselessMeditation(root: unknown): boolean | undefined {
  const race = readProperty(root, "race");
  const zen = readProperty(readProperty(root, "resource"), "Zen");
  if (!isRecord(zen)) return undefined;
  const amount = zen["amount"];
  const maximum = zen["max"];
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    typeof maximum !== "number" ||
    !Number.isFinite(maximum)
  ) {
    return undefined;
  }
  return Boolean(readProperty(race, "calm")) && amount < maximum;
}

function readTarget(
  settings: Record<PropertyKey, unknown>,
  city: Record<PropertyKey, unknown>,
  elementId: string,
  unusedStorageParts: boolean,
  storagePartsAllAssigned: boolean,
  housingUnderused: boolean,
  uselessMeditation: boolean,
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
  const state = readProperty(city, id);
  if (!isRecord(state)) {
    onSkipped(binding, "captured city state is unavailable");
    return undefined;
  }
  const weighting = readFiniteSetting(settings, `bld_w_${binding}`, 100);
  if (weighting === undefined) {
    onSkipped(binding, "configured weighting is not finite");
    return undefined;
  }
  const count = readProperty(state, "count");
  if (typeof count !== "number" || !Number.isFinite(count)) {
    onSkipped(binding, "captured city count is not finite");
    return undefined;
  }
  const newBuildingWeighting =
    count === 0 ? readFiniteSetting(settings, "buildingWeightingNew", 1) : 1;
  if (newBuildingWeighting === undefined) {
    onSkipped(binding, "new-building weighting is not finite");
    return undefined;
  }
  const nonOperatingWeighting = readFiniteSetting(
    settings,
    "buildingWeightingNonOperatingCity",
    1,
  );
  if (nonOperatingWeighting === undefined) {
    onSkipped(binding, "non-operating-city weighting is not finite");
    return undefined;
  }
  const storageWeighting =
    id === "storage_yard" || id === "warehouse"
      ? readFiniteSetting(settings, "buildingWeightingCrateUseless", 1)
      : 1;
  if (storageWeighting === undefined) {
    onSkipped(binding, "storage weighting is not finite");
    return undefined;
  }
  const needStorageWeighting =
    id === "shed"
      ? readFiniteSetting(settings, "buildingWeightingNeedStorage", 1)
      : 1;
  if (needStorageWeighting === undefined) {
    onSkipped(binding, "storage expansion weighting is not finite");
    return undefined;
  }
  const housingWeighting = [
    "basic_housing",
    "cottage",
    "apartment",
    "lodge",
    "slave_pen",
  ].includes(id)
    ? readFiniteSetting(settings, "buildingWeightingUselessHousing", 1)
    : 1;
  if (housingWeighting === undefined) {
    onSkipped(binding, "housing weighting is not finite");
    return undefined;
  }
  const meditationWeighting =
    id === "meditation"
      ? readFiniteSetting(settings, "buildingWeightingZenUseless", 1)
      : 1;
  if (meditationWeighting === undefined) {
    onSkipped(binding, "meditation weighting is not finite");
    return undefined;
  }
  const vacuumWeighting =
    id === "pylon"
      ? readFiniteSetting(settings, "buildingWeightingVacuumCollapse", 1)
      : 1;
  if (vacuumWeighting === undefined) {
    onSkipped(binding, "vacuum-collapse weighting is not finite");
    return undefined;
  }
  const onValue = readProperty(state, "on");
  const on =
    typeof onValue === "number" && Number.isFinite(onValue)
      ? onValue
      : undefined;
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
    weighting: applyNonOperatingCityWeighting(
      applyNeedMoreStorageWeighting(
        applyVacuumCollapseWeighting(
          applyUselessMeditationWeighting(
            applyUselessHousingWeighting(
              applyUnusedStorageWeighting(
                applyNewBuildingWeighting(
                  weighting,
                  count,
                  newBuildingWeighting,
                ),
                id,
                unusedStorageParts,
                storageWeighting,
              ),
              id,
              housingUnderused,
              housingWeighting,
            ),
            id,
            uselessMeditation,
            meditationWeighting,
          ),
          id,
          settings["prestigeType"] === "vacuum" ? "vacuum" : "other",
          vacuumWeighting,
        ),
        id,
        storagePartsAllAssigned,
        needStorageWeighting,
      ),
      count,
      on,
      nonOperatingWeighting,
      id === "mill" || id === "banquet",
    ),
    maximum: maximum >= 0 ? maximum : UNLIMITED,
    knowledge: KNOWLEDGE_BUILDINGS.has(id),
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
    const storageParts = readStorageParts(root);
    const buildings: Readonly<CapturedBuildTarget>[] = [];
    if (isRecord(settings) && isRecord(city)) {
      for (const elementId of controls.capturedElementIds()) {
        const target = readTarget(
          settings,
          city,
          elementId,
          storageParts?.unused ?? false,
          storageParts?.allAssigned ?? false,
          readHousingUnderused(root) ?? false,
          readUselessMeditation(root) ?? false,
          reportSkipped,
        );
        if (target !== undefined) buildings.push(target);
      }
    }
    return Object.freeze({
      buildings: Object.freeze(buildings),
      ...readOptions(isRecord(settings) ? settings : {}),
    });
  };
}
