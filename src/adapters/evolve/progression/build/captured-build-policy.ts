/**
 * Samples the script-owned part of the captured city-building policy.
 *
 * This is intentionally the small bridge between page capture and the existing construction
 * contract: the game decides which city controls exist, while persisted script settings decide
 * which of those controls are managed, their configured order weight, and their cap. Dynamic rules
 * use only state and current DeadSpace ids that the captured surface can validate.
 */

import {
  applyAuthorityCapWeighting,
  isAuthorityCapBuilding,
  applyNeedfulKnowledgeWeighting,
  applyNewBuildingWeighting,
  applyNeedMoreStorageWeighting,
  applyMissingFuelProductionWeighting,
  applyMissingFuelStorageWeighting,
  applyNonCityPowerProducerWeighting,
  applyNonOperatingWeighting,
  applyNonOperatingCityWeighting,
  applyPowerPlantWeighting,
  applyUnderpoweredWeighting,
  applyUselessMeditationWeighting,
  applyUselessHousingWeighting,
  applyVacuumCollapseWeighting,
  applyUnusedStorageWeighting,
  applyUselessKnowledgeWeighting,
  isKnowledgeGated,
} from "../../../../domain/progression/build/building-weighting.ts";
import { planTruepathAiApocalypse } from "../../../../domain/progression/truepath/ai-apocalypse.ts";
import type { CapturedKnowledgeSample } from "./captured-knowledge-gate.ts";
import type { ConstructionCycleOptions } from "../../../../ports/construction-candidates.ts";
import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty, splitActionId } from "../../../validation.ts";
import type { CapturedBuildTarget } from "./captured-build.ts";
import type { ScriptBuildPolicy } from "./script-build-policy.ts";

export interface CapturedBuildPolicyDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettings: () => unknown;
  /** What this cycle knows about Knowledge, shared with the build planner's own gate. */
  readonly readKnowledge: () => CapturedKnowledgeSample;
  /** Prices the captured mission controls for the fuel-storage weighting rule. */
  readonly costs?: GameActionCostReader;
  readonly onSkipped?: (key: string, reason: string) => void;
}

/**
 * The run-wide answers the rules read, sampled once per cycle. They are questions about the run
 * rather than about a candidate, so one sample applies to every target in the cycle.
 */
interface CityRuleContext {
  readonly unusedStorageParts: boolean;
  readonly storagePartsAllAssigned: boolean;
  readonly housingUnderused: boolean;
  readonly uselessMeditation: boolean;
  /** Research cannot proceed until Knowledge capacity grows. */
  readonly knowledgeGated: boolean;
  /** Capacity already covers every Knowledge cost the run knows it wants. */
  readonly knowledgeSufficient: boolean;
  readonly powerUnlocked: boolean;
  readonly powerSurplus: number;
  readonly unpoweredPowerDemand: number;
  /** Authority capacity is below the managed target. */
  readonly authorityCapBelowTarget: boolean;
  /** Fuel capacity is below the most expensive captured mission that needs it. */
  readonly oilStorageBelowMissionCost: boolean;
  readonly heliumStorageBelowMissionCost: boolean;
  /** Neither the city oil well nor the space oil extractor exists. */
  readonly noOilProduction: boolean;
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

/**
 * Action ids use their upstream root container as the first segment. Keep this allowlist narrow:
 * controls such as `tech-*`, `evolution-*`, and `arpa-*` are not construction targets even when
 * a persisted setting happens to contain a similarly named key.
 */
const CAPTURED_BUILD_REGIONS: ReadonlySet<string> = new Set([
  "city",
  "space",
  "interstellar",
  "galaxy",
  "portal",
  "eden",
  "surface",
  "tauceti",
  "underground",
]);

/**
 * DeadSpace's non-city rule deliberately leaves these smart/multi-segment actions alone. Their
 * `on` count can be below `count` while the game is prebuilding or balancing a grouped structure.
 */
const NON_CITY_NON_OPERATING_EXCEPTIONS: ReadonlySet<string> = new Set([
  "stellar_engine",
  "attractor",
  "mechbay",
  "guard_post",
  "port",
  "base_camp",
]);

// DeadSpace 1.5.0 creates city gather actions without passing the city region to `buildTemplate`,
// so their live controls render as `undefined-food`/`undefined-stone`. The persisted automation
// settings still use the stable city binding; keep both identities in the captured target.
const CITY_ELEMENT_BINDING_ALIASES: Readonly<Record<string, string>> =
  Object.freeze({
    "undefined-food": "city-food",
    "undefined-stone": "city-stone",
  });

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

interface CapturedPowerState {
  readonly unlocked: boolean;
  readonly surplus: number;
  readonly demand: number;
}

function readPowerState(root: unknown): CapturedPowerState | undefined {
  const city = readProperty(root, "city");
  if (!isRecord(city)) return undefined;
  const unlocked = readProperty(city, "powered");
  const surplus = readProperty(city, "power");
  const rawDemand = readProperty(city, "power_total");
  if (
    typeof unlocked !== "boolean" ||
    typeof surplus !== "number" ||
    !Number.isFinite(surplus) ||
    typeof rawDemand !== "number" ||
    !Number.isFinite(rawDemand)
  ) {
    return undefined;
  }
  // DeadSpace stores power capacity as a negative `city.power_total`; the policy compares it
  // with the positive current Power surplus. The current city draw is already included in that
  // value; the True Path Apocalypse route adds only Colonists not built yet.
  return Object.freeze({
    unlocked,
    surplus,
    demand: -rawDemand + readFutureAiColonistPower(root),
  });
}

function readAuthorityCapBelowTarget(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
): boolean {
  if (settings["authorityManage"] !== true) return false;
  const target = settings["generalMinimumAuthority"];
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) {
    return false;
  }
  const authority = readProperty(readProperty(root, "resource"), "Authority");
  if (!isRecord(authority)) return false;
  return (
    readProperty(authority, "display") === true &&
    typeof authority["max"] === "number" &&
    Number.isFinite(authority["max"]) &&
    authority["max"] < target
  );
}

function readNonNegativeCount(owner: unknown, key: string): number | undefined {
  const value = readProperty(owner, key);
  if (value === undefined) return 0;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function readPoweredCount(
  owner: unknown,
  key: string,
): { readonly count: number; readonly on: number } | undefined {
  const record = readProperty(owner, key);
  if (record === undefined) return Object.freeze({ count: 0, on: 0 });
  if (!isRecord(record)) return undefined;
  const count = readNonNegativeCount(record, "count");
  const on = readNonNegativeCount(record, "on");
  if (count === undefined || on === undefined || on > count) return undefined;
  return Object.freeze({ count, on });
}

interface CapturedFuelState {
  readonly oilStorageBelowMissionCost: boolean;
  readonly heliumStorageBelowMissionCost: boolean;
  readonly noOilProduction: boolean;
}

function readFuelState(
  root: unknown,
  controls: GameControlRegistry,
  costs: GameActionCostReader | undefined,
): CapturedFuelState | undefined {
  if (costs === undefined) return undefined;
  const resources = readProperty(root, "resource");
  const oil = readProperty(resources, "Oil");
  const helium = readProperty(resources, "Helium_3");
  const oilMaximum = isRecord(oil) ? oil["max"] : undefined;
  const heliumMaximum = isRecord(helium) ? helium["max"] : undefined;
  if (
    typeof oilMaximum !== "number" ||
    !Number.isFinite(oilMaximum) ||
    oilMaximum < 0 ||
    typeof heliumMaximum !== "number" ||
    !Number.isFinite(heliumMaximum) ||
    heliumMaximum < 0
  ) {
    return undefined;
  }

  const missionIds = controls
    .capturedElementIds()
    .filter((id) => id.startsWith("space-") && id.endsWith("_mission"));
  if (missionIds.length === 0) return undefined;

  let maximumOilCost = 0;
  let maximumHeliumCost = 0;
  for (const missionId of missionIds) {
    const price = costs.readCost(missionId);
    if (price === undefined) return undefined;
    const oilCost = price.cost["Oil"];
    const heliumCost = price.cost["Helium_3"];
    if (
      (oilCost !== undefined &&
        (typeof oilCost !== "number" ||
          !Number.isFinite(oilCost) ||
          oilCost < 0)) ||
      (heliumCost !== undefined &&
        (typeof heliumCost !== "number" ||
          !Number.isFinite(heliumCost) ||
          heliumCost < 0))
    ) {
      return undefined;
    }
    maximumOilCost = Math.max(maximumOilCost, oilCost ?? 0);
    maximumHeliumCost = Math.max(maximumHeliumCost, heliumCost ?? 0);
  }

  const cityOilWell = readPoweredCount(readProperty(root, "city"), "oil_well");
  const spaceOilExtractor = readPoweredCount(
    readProperty(root, "space"),
    "oil_extractor",
  );
  if (cityOilWell === undefined || spaceOilExtractor === undefined) {
    return undefined;
  }
  return Object.freeze({
    oilStorageBelowMissionCost: oilMaximum < maximumOilCost,
    heliumStorageBelowMissionCost:
      readProperty(helium, "display") === true &&
      heliumMaximum < maximumHeliumCost,
    noOilProduction: cityOilWell.count + spaceOilExtractor.count <= 0,
  });
}

/** Reads the future AI-colonist draw characterized by the upstream True Path progress gate. */
function readFutureAiColonistPower(root: unknown): number {
  const race = readProperty(root, "race");
  const settings = readProperty(root, "settings");
  if (
    !readProperty(race, "truepath") ||
    readProperty(settings, "prestigeType") !== "apocalypse"
  ) {
    return 0;
  }
  const techLevel = readNonNegativeCount(
    readProperty(root, "tech"),
    "titan_ai_core",
  );
  const space = readProperty(root, "space");
  const decoder = readPoweredCount(space, "decoder");
  const colonist = readPoweredCount(space, "ai_colonist");
  const trooper = readPoweredCount(space, "shock_trooper");
  const tank = readPoweredCount(space, "tank");
  if (
    techLevel === undefined ||
    decoder === undefined ||
    colonist === undefined ||
    trooper === undefined ||
    tank === undefined
  ) {
    return 0;
  }
  return planTruepathAiApocalypse({
    enabled: true,
    aiCoreLevel: techLevel,
    decoderCount: decoder.count,
    decoderOnCount: decoder.on,
    colonistCount: colonist.count,
    colonistOnCount: colonist.on,
    trooperOnCount: trooper.on,
    tankOnCount: tank.on,
  }).additionalColonistPower;
}

interface CityWeightingInput {
  readonly base: number;
  readonly binding: string;
  readonly id: string;
  readonly count: number;
  readonly on: number | undefined;
  readonly powered: number | undefined;
  readonly context: Readonly<CityRuleContext>;
  readonly prestigeRoute: string;
  readonly raisesKnowledgeCap: boolean;
  readonly multipliers: Readonly<{
    newBuilding: number;
    unusedStorage: number;
    uselessHousing: number;
    uselessMeditation: number;
    vacuumCollapse: number;
    needMoreStorage: number;
    nonOperating: number;
    needfulKnowledge: number;
    uselessKnowledge: number;
    needfulPower: number;
    uselessPower: number;
    underpowered: number;
    authorityCap: number;
    missingFuel: number;
  }>;
}

/**
 * The captured city rules, applied in sequence. Each is a multiplier, so the order is immaterial;
 * the sequence is written out rather than nested so that adding a rule stays a one-line change.
 */
function cityWeighting(input: Readonly<CityWeightingInput>): number {
  const { id, context, multipliers } = input;
  let weight = applyNewBuildingWeighting(
    input.base,
    input.count,
    multipliers.newBuilding,
  );
  weight = applyAuthorityCapWeighting(
    weight,
    input.binding,
    context.authorityCapBelowTarget,
    multipliers.authorityCap,
  );
  weight = applyPowerPlantWeighting(
    weight,
    id,
    context.powerUnlocked,
    context.powerSurplus,
    context.unpoweredPowerDemand,
    multipliers.needfulPower,
    multipliers.uselessPower,
  );
  weight = applyUnderpoweredWeighting(
    weight,
    id,
    context.powerUnlocked,
    context.powerSurplus,
    input.powered,
    multipliers.underpowered,
  );
  weight = applyUnusedStorageWeighting(
    weight,
    id,
    context.unusedStorageParts,
    multipliers.unusedStorage,
  );
  weight = applyUselessHousingWeighting(
    weight,
    id,
    context.housingUnderused,
    multipliers.uselessHousing,
  );
  weight = applyUselessMeditationWeighting(
    weight,
    id,
    context.uselessMeditation,
    multipliers.uselessMeditation,
  );
  weight = applyVacuumCollapseWeighting(
    weight,
    id,
    input.prestigeRoute,
    multipliers.vacuumCollapse,
  );
  weight = applyNeedMoreStorageWeighting(
    weight,
    id,
    context.storagePartsAllAssigned,
    multipliers.needMoreStorage,
  );
  weight = applyMissingFuelProductionWeighting(
    weight,
    id,
    context.oilStorageBelowMissionCost && context.noOilProduction,
    multipliers.missingFuel,
  );
  weight = applyMissingFuelStorageWeighting(
    weight,
    id,
    context.oilStorageBelowMissionCost || context.heliumStorageBelowMissionCost,
    multipliers.missingFuel,
  );
  weight = applyNonOperatingCityWeighting(
    weight,
    input.count,
    input.on,
    multipliers.nonOperating,
    id === "mill" || id === "banquet",
  );
  weight = applyNeedfulKnowledgeWeighting(
    weight,
    input.raisesKnowledgeCap,
    context.knowledgeGated,
    multipliers.needfulKnowledge,
  );
  return applyUselessKnowledgeWeighting(
    weight,
    id,
    input.raisesKnowledgeCap,
    context.knowledgeSufficient,
    multipliers.uselessKnowledge,
  );
}

function readTarget(
  settings: Record<PropertyKey, unknown>,
  city: Record<PropertyKey, unknown>,
  elementId: string,
  context: Readonly<CityRuleContext>,
  onSkipped: (key: string, reason: string) => void,
): Readonly<CapturedBuildTarget> | undefined {
  const binding = CITY_ELEMENT_BINDING_ALIASES[elementId] ?? elementId;
  if (!binding.startsWith("city-") || binding.length === "city-".length) {
    return undefined;
  }
  // `bat…` is the script's managed-building switch. Partial settings are common while the
  // captured settings sections are being initialized, so absence uses the reset default (enabled)
  // when autoBuild is on; an explicit false always disables a captured building.
  if (
    settings[`bat${binding}`] === false ||
    (settings[`bat${binding}`] === undefined && settings.autoBuild !== true)
  ) {
    return undefined;
  }
  const id = binding.slice("city-".length);
  const state = readProperty(city, id);
  if (!isRecord(state)) {
    // A captured city control is broader than the building list: gather/resource/special controls
    // also use the `city-*` namespace. Without a matching state record there is no positive
    // building identity, so leave the control out of this scan rather than reporting it as a
    // skipped building. A positively identified building is validated below and can still report
    // a malformed count or setting.
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
  const fuelWeighting =
    id === "oil_well" || id === "oil_depot"
      ? readFiniteSetting(settings, "buildingWeightingMissingFuel", 1)
      : 1;
  if (fuelWeighting === undefined) {
    onSkipped(binding, "missing-fuel weighting is not finite");
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
  const raisesKnowledgeCap = KNOWLEDGE_BUILDINGS.has(id);
  const needfulKnowledgeWeighting = raisesKnowledgeCap
    ? readFiniteSetting(settings, "buildingWeightingNeedfulKnowledge", 1)
    : 1;
  if (needfulKnowledgeWeighting === undefined) {
    onSkipped(binding, "needful-knowledge weighting is not finite");
    return undefined;
  }
  const uselessKnowledgeWeighting = raisesKnowledgeCap
    ? readFiniteSetting(settings, "buildingWeightingUselessKnowledge", 1)
    : 1;
  if (uselessKnowledgeWeighting === undefined) {
    onSkipped(binding, "useless-knowledge weighting is not finite");
    return undefined;
  }
  const powerPlant = [
    "mill",
    "windmill",
    "coal_power",
    "oil_power",
    "fission_power",
  ].includes(id);
  const needfulPowerWeighting = powerPlant
    ? readFiniteSetting(settings, "buildingWeightingNeedfulPowerPlant", 1)
    : 1;
  if (needfulPowerWeighting === undefined) {
    onSkipped(binding, "needful-power weighting is not finite");
    return undefined;
  }
  const uselessPowerWeighting = powerPlant
    ? readFiniteSetting(settings, "buildingWeightingUselessPowerPlant", 1)
    : 1;
  if (uselessPowerWeighting === undefined) {
    onSkipped(binding, "useless-power weighting is not finite");
    return undefined;
  }
  const authorityCapWeighting = isAuthorityCapBuilding(binding)
    ? readFiniteSetting(settings, "buildingWeightingAuthority", 1)
    : 1;
  if (authorityCapWeighting === undefined) {
    onSkipped(binding, "authority-cap weighting is not finite");
    return undefined;
  }
  const onValue = readProperty(state, "on");
  const on =
    typeof onValue === "number" && Number.isFinite(onValue)
      ? onValue
      : undefined;
  // DeadSpace's build Vue binding captures the mutable structure record as `data.act`; the
  // action definition carrying `powered()` remains a private module value. Do not infer a
  // consumer draw from the structure record or from test-only handle data.
  const powered = undefined;
  const underpoweredWeighting = 1;
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
    weighting: cityWeighting({
      base: weighting,
      binding,
      id,
      count,
      on,
      powered,
      context,
      prestigeRoute: settings["prestigeType"] === "vacuum" ? "vacuum" : "other",
      raisesKnowledgeCap,
      multipliers: {
        newBuilding: newBuildingWeighting,
        unusedStorage: storageWeighting,
        uselessHousing: housingWeighting,
        uselessMeditation: meditationWeighting,
        vacuumCollapse: vacuumWeighting,
        needMoreStorage: needStorageWeighting,
        missingFuel: fuelWeighting,
        nonOperating: nonOperatingWeighting,
        needfulKnowledge: needfulKnowledgeWeighting,
        uselessKnowledge: uselessKnowledgeWeighting,
        needfulPower: needfulPowerWeighting,
        uselessPower: uselessPowerWeighting,
        underpowered: underpoweredWeighting,
        authorityCap: authorityCapWeighting,
      },
    }),
    maximum: maximum >= 0 ? maximum : UNLIMITED,
    knowledge: raisesKnowledgeCap,
    important: false,
  });
}

function readNonCityTarget(
  settings: Record<PropertyKey, unknown>,
  root: unknown,
  elementId: string,
  context: Readonly<CityRuleContext>,
  onSkipped: (key: string, reason: string) => void,
): Readonly<CapturedBuildTarget> | undefined {
  const parts = splitActionId(elementId);
  if (parts === undefined) return undefined;
  const region = parts.region;
  if (!CAPTURED_BUILD_REGIONS.has(region) || region === "city") {
    return undefined;
  }
  const binding = elementId;
  if (
    settings[`bat${binding}`] === false ||
    (settings[`bat${binding}`] === undefined && settings.autoBuild !== true)
  ) {
    return undefined;
  }
  const id = parts.id;
  const owner = readProperty(root, region);
  const state = readProperty(owner, id);
  if (!isRecord(state)) {
    onSkipped(binding, `captured ${region} state is unavailable`);
    return undefined;
  }
  const count = readProperty(state, "count");
  if (typeof count !== "number" || !Number.isFinite(count)) {
    onSkipped(binding, `captured ${region} count is not finite`);
    return undefined;
  }
  const weighting = readFiniteSetting(settings, `bld_w_${binding}`, 100);
  if (weighting === undefined) {
    onSkipped(binding, "configured weighting is not finite");
    return undefined;
  }
  const newBuildingWeighting =
    count === 0 ? readFiniteSetting(settings, "buildingWeightingNew", 1) : 1;
  if (newBuildingWeighting === undefined) {
    onSkipped(binding, "new-building weighting is not finite");
    return undefined;
  }
  // See the city path above: the captured structure state does not expose the action definition's
  // private `powered()` method, so consumer-underpower weighting remains unavailable here too.
  const powered = undefined;
  const underpoweredWeighting = 1;
  const maximum = readFiniteSetting(settings, `bld_m_${binding}`, UNLIMITED);
  if (maximum === undefined) {
    onSkipped(binding, "configured maximum is not finite");
    return undefined;
  }
  const onValue = readProperty(state, "on");
  const on =
    typeof onValue === "number" && Number.isFinite(onValue)
      ? onValue
      : undefined;
  const nonOperatingWeighting =
    on !== undefined &&
    count - on > 0 &&
    !NON_CITY_NON_OPERATING_EXCEPTIONS.has(id)
      ? readFiniteSetting(settings, "buildingWeightingNonOperating", 1)
      : 1;
  if (nonOperatingWeighting === undefined) {
    onSkipped(binding, "non-operating weighting is not finite");
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
  const powerProducer = powered !== undefined && powered < 0;
  const needfulPowerWeighting = powerProducer
    ? readFiniteSetting(settings, "buildingWeightingNeedfulPowerPlant", 1)
    : 1;
  if (needfulPowerWeighting === undefined) {
    onSkipped(binding, "needful-power weighting is not finite");
    return undefined;
  }
  const uselessPowerWeighting = powerProducer
    ? readFiniteSetting(settings, "buildingWeightingUselessPowerPlant", 1)
    : 1;
  if (uselessPowerWeighting === undefined) {
    onSkipped(binding, "useless-power weighting is not finite");
    return undefined;
  }
  const authorityCapWeighting = isAuthorityCapBuilding(binding)
    ? readFiniteSetting(settings, "buildingWeightingAuthority", 1)
    : 1;
  if (authorityCapWeighting === undefined) {
    onSkipped(binding, "authority-cap weighting is not finite");
    return undefined;
  }
  const dynamicWeight = applyNonCityPowerProducerWeighting(
    applyVacuumCollapseWeighting(
      applyNonOperatingWeighting(
        weighting * newBuildingWeighting,
        count,
        on,
        nonOperatingWeighting,
        NON_CITY_NON_OPERATING_EXCEPTIONS.has(id),
      ),
      id,
      settings["prestigeType"] === "vacuum" ? "vacuum" : "other",
      vacuumWeighting,
    ),
    context.powerUnlocked,
    context.powerSurplus,
    context.unpoweredPowerDemand,
    powered,
    needfulPowerWeighting,
    uselessPowerWeighting,
  );
  return Object.freeze({
    key: binding,
    elementId,
    region,
    id,
    weighting: applyUnderpoweredWeighting(
      applyAuthorityCapWeighting(
        dynamicWeight,
        binding,
        context.authorityCapBelowTarget,
        authorityCapWeighting,
      ),
      id,
      context.powerUnlocked,
      context.powerSurplus,
      powered,
      underpoweredWeighting,
    ),
    maximum: maximum >= 0 ? maximum : UNLIMITED,
    knowledge: false,
    important: false,
  });
}

export function createCapturedBuildPolicyReader({
  rootState,
  controls,
  getSettings,
  readKnowledge,
  costs,
  onSkipped,
}: CapturedBuildPolicyDependencies): () => ScriptBuildPolicy {
  const reportSkipped = onSkipped ?? (() => {});
  return () => {
    const settings = getSettings();
    const root = rootState.readRoot();
    const city = readProperty(root, "city");
    const storageParts = readStorageParts(root);
    const power = readPowerState(root);
    const fuel = readFuelState(root, controls, costs);
    const knowledge = readKnowledge();
    const context: CityRuleContext = Object.freeze({
      unusedStorageParts: storageParts?.unused ?? false,
      storagePartsAllAssigned: storageParts?.allAssigned ?? false,
      housingUnderused: readHousingUnderused(root) ?? false,
      uselessMeditation: readUselessMeditation(root) ?? false,
      knowledgeGated: isKnowledgeGated(knowledge.levels),
      // Nothing known to want is not the same as wanting nothing: with no catalog read yet every
      // figure is zero, and the rule would penalize Knowledge buildings on no evidence.
      knowledgeSufficient:
        knowledge.levels.knowledgeCapacity > 0 &&
        Math.max(
          knowledge.knowledgeRequiredByTechs,
          knowledge.levels.knowledgeRequiredByBuildTargets,
        ) <= knowledge.levels.knowledgeCapacity,
      powerUnlocked: power?.unlocked ?? false,
      powerSurplus: power?.surplus ?? 0,
      unpoweredPowerDemand: power?.demand ?? 0,
      authorityCapBelowTarget: isRecord(settings)
        ? readAuthorityCapBelowTarget(root, settings)
        : false,
      oilStorageBelowMissionCost: fuel?.oilStorageBelowMissionCost ?? false,
      heliumStorageBelowMissionCost:
        fuel?.heliumStorageBelowMissionCost ?? false,
      noOilProduction: fuel?.noOilProduction ?? false,
    });
    const buildings: Readonly<CapturedBuildTarget>[] = [];
    if (isRecord(settings)) {
      for (const elementId of controls.capturedElementIds()) {
        const target = isRecord(city)
          ? readTarget(settings, city, elementId, context, reportSkipped)
          : undefined;
        const nonCityTarget =
          target === undefined
            ? readNonCityTarget(
                settings,
                root,
                elementId,
                context,
                reportSkipped,
              )
            : undefined;
        if (target !== undefined) buildings.push(target);
        else if (nonCityTarget !== undefined) buildings.push(nonCityTarget);
      }
    }
    return Object.freeze({
      buildings: Object.freeze(buildings),
      ...readOptions(isRecord(settings) ? settings : {}),
    });
  };
}
