/** Bounded DeadSpace smelter allocation through the captured industry panel. */

import { CONSUMPTION_BALANCE_MIN } from "../../../../config.ts";
import {
  planSmelter,
  type SmelterCostView,
  type SmelterFuelView,
  type SmelterInput,
} from "../../../../domain/economy/production/smelter.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { CapturedDemandSample } from "../resources/captured-resource-demand.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameControlHandle } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

export const SMELTER_CONTROL = "iSmelter";

export function capturedSmelterSkipReason(
  enabled: boolean,
  prerequisiteDemandReady: boolean,
): "permission-disabled" | "construction-demand-unavailable" | undefined {
  if (!prerequisiteDemandReady) return "construction-demand-unavailable";
  if (!enabled) return "permission-disabled";
  return undefined;
}

/** Applies one validated test-surface strategy choice to its matching native planner input. */
export function applyCapturedSmelterTestCandidate(
  input: Readonly<SmelterInput>,
  selected: unknown,
  sampledRoot: unknown,
  currentRoot: unknown,
  sampledRootGeneration: number | undefined,
  currentRootGeneration: number | undefined,
): Readonly<SmelterInput> {
  if (
    !isRecord(selected) ||
    selected["apply"] !== true ||
    (selected["resourceId"] !== "Iron" && selected["resourceId"] !== "Steel") ||
    typeof selected["actionId"] !== "string" ||
    selected["actionId"].length === 0 ||
    !isRecord(selected["stock"]) ||
    selected["stock"]["resourceId"] !== selected["resourceId"] ||
    sampledRootGeneration === undefined ||
    sampledRootGeneration !== currentRootGeneration ||
    selected["stock"]["rootGeneration"] !== sampledRootGeneration ||
    sampledRoot !== currentRoot
  )
    return input;
  const resourceId = selected["resourceId"];
  const amount = finite(
    readProperty(
      readProperty(readProperty(sampledRoot, "resource"), resourceId),
      "amount",
    ),
  );
  if (
    amount === undefined ||
    amount < 0 ||
    amount !== selected["stock"]["amount"]
  )
    return input;
  const demandField = resourceId === "Iron" ? "ironDemanded" : "steelDemanded";
  return input[demandField] === true
    ? input
    : Object.freeze({ ...input, [demandField]: true });
}

export interface CapturedSmelterDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => CapturedDemandSample;
  /** Test-surface-only policy seam; the native planner still owns the resulting decision. */
  readonly prepareInputForTest?: (
    input: Readonly<SmelterInput>,
    demand: CapturedDemandSample,
  ) => Readonly<SmelterInput>;
  readonly shouldPrepareInputForTest?: () => boolean;
  readonly observePlanForDiagnostics?: (
    input: Readonly<SmelterInput>,
    decision: ReturnType<typeof planSmelter>,
    demand: Readonly<{
      requestedSteel: number;
      isSteelDemanded: boolean;
      savingTarget: CapturedDemandSample["savingTarget"];
    }>,
    observation?: Readonly<{
      root: unknown;
      permissionEnabled: boolean;
      controlGeneration: number | undefined;
      controlMethods: readonly string[];
      plannedCommands: readonly string[];
      expectedAllocations: Readonly<Record<string, number>>;
      progressionGeneration: number | undefined;
      steelResource:
        Readonly<{ amount: number; maximum: number; rate: number }> | undefined;
      demandAuthorityAvailable: boolean;
    }>,
  ) => void;
  readonly shouldObservePlanForDiagnostics?: () => boolean;
  readonly observeOutcomeForTest?: (
    outcome: CommandExecutionOutcome,
    observation: Readonly<{
      root: unknown;
      plannedCommands: readonly string[];
      expectedAllocations: Readonly<Record<string, number>>;
      controlGeneration: number | undefined;
    }>,
    postcondition: Readonly<{
      status: "verified" | "failed" | "no-op" | "not-checked";
      allocations: Readonly<Record<string, number | undefined>>;
    }>,
  ) => void;
  readonly readProgressionGeneration?: () => number | undefined;
}

interface ResourceView {
  readonly name: string;
  readonly amount: number;
  readonly maximum: number;
  readonly rate: number;
  readonly display: boolean;
}

interface SmelterSession {
  readonly root: unknown;
  readonly input: Readonly<SmelterInput>;
  readonly demand: CapturedDemandSample;
  readonly permissionEnabled: boolean;
  readonly control: GameControlHandle | undefined;
  readonly steelResource: ResourceView | undefined;
  readonly demandAuthorityAvailable: boolean;
}

const FUEL_IDS = Object.freeze([
  "Oil",
  "Coal",
  "Wood",
  "Inferno",
  "Super",
] as const);
type FuelId = (typeof FUEL_IDS)[number];

/**
 * The smelter fuel identities in default-priority order, shared with the
 * settings catalog and the lifecycle defaults. Verified against the
 * `smelting` fuel set the automation prices.
 */
export const SMELTER_FUEL_IDS: readonly string[] = FUEL_IDS;

function readCount(value: unknown): number | undefined {
  const count = finite(value);
  return count !== undefined && Number.isSafeInteger(count) && count >= 0
    ? count
    : undefined;
}

function readResource(
  resources: unknown,
  id: string,
): ResourceView | undefined {
  const resource = readProperty(resources, id);
  if (!isRecord(resource)) return undefined;
  const amount = finite(resource["amount"]);
  const maximum = finite(resource["max"]);
  const rate = finite(resource["diff"]);
  const display = resource["display"];
  if (
    amount === undefined ||
    maximum === undefined ||
    rate === undefined ||
    typeof display !== "boolean"
  ) {
    return undefined;
  }
  return Object.freeze({
    name: typeof resource["name"] === "string" ? resource["name"] : id,
    amount,
    maximum,
    rate,
    display,
  });
}

function timeTo(
  resource: Pick<ResourceView, "amount" | "maximum" | "rate">,
  target: number,
): number {
  if (resource.maximum <= 0 || resource.amount / resource.maximum > 0.98) {
    return Number.MIN_SAFE_INTEGER;
  }
  if (target <= resource.amount) return 0;
  return resource.rate > 0
    ? (target - resource.amount) / resource.rate
    : Number.MAX_SAFE_INTEGER;
}

function makeSmelterCost(
  resource: ResourceView,
  quantity: number,
  minRateOfChange: number,
  demanded: boolean,
): SmelterCostView {
  return Object.freeze({
    resourceName: resource.name,
    currentQuantity: resource.amount,
    rateOfChange: resource.rate,
    isDemanded: demanded,
    quantity,
    minRateOfChange,
  });
}

function emptyInput(): SmelterInput {
  return Object.freeze({
    initialised: false,
    hasForge: false,
    totalSmelters: 0,
    extraOperating: 0,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    fuels: Object.freeze([]),
    ironCount: 0,
    steelCount: 0,
    iridiumCount: 0,
    iridiumUnlocked: false,
    iridiumCapped: false,
    productionSmeltingIridium: 0.5,
    productionSmelting: "",
    steelCost: Object.freeze([]),
    ironTimeToFull: 0,
    ironTimeToRequired: 0,
    ironDemanded: false,
    steelTimeToFull: 0,
    steelTimeToRequired: 0,
    steelDemanded: false,
    minerCount: 0,
    beltIronShipStateOnCount: 0,
    titaniumStorageRatio: 1,
    haveTitaniumTech: false,
  });
}

function readSettingRecord(value: unknown): Record<PropertyKey, unknown> {
  return isRecord(value) ? value : {};
}

function readFuel(
  id: FuelId,
  resources: unknown,
  race: Record<PropertyKey, unknown>,
  tech: Record<PropertyKey, unknown>,
  settings: Record<PropertyKey, unknown>,
  demand: CapturedDemandSample,
): SmelterFuelView | undefined {
  const isLumberRace = !race["kindling_kindred"] && !race["smoldering"];
  const evil = Boolean(race["evil"]);
  const species = typeof race["species"] === "string" ? race["species"] : "";
  const resourceId =
    id === "Wood"
      ? evil &&
        Boolean(race["soul_eater"]) &&
        species !== "wendigo" &&
        !race["artificial"]
        ? "Food"
        : evil
          ? "Furs"
          : "Lumber"
      : id === "Inferno"
        ? "Coal"
        : id === "Super"
          ? "Super_Fuel"
          : id;
  const resource = readResource(resources, resourceId);
  const unlocked =
    id === "Wood"
      ? isLumberRace || evil
      : id === "Inferno"
        ? (finite(tech["smelting"]) ?? 0) >= 8
        : id === "Super"
          ? (finite(tech["super_fuel"]) ?? 0) >= 2
          : resource?.display === true;
  if (!unlocked) {
    return Object.freeze({
      id,
      unlocked: false,
      isInfernoBeforeOil: false,
      currentFuelCount: 0,
      cost: Object.freeze([]),
    });
  }
  if (resource === undefined) return undefined;
  const quantity =
    id === "Wood"
      ? evil && (!race["soul_eater"] || species === "wendigo")
        ? 1
        : 3
      : id === "Coal"
        ? isLumberRace
          ? 0.25
          : 0.15
        : id === "Oil"
          ? 0.35
          : id === "Super"
            ? 1
            : 50;
  const minRateOfChange =
    id === "Inferno"
      ? 50
      : id === "Wood" || id === "Oil" || id === "Coal" || id === "Super"
        ? 2
        : 50;
  const priorityValue = settings[`smelter_fuel_p_${id}`];
  const priority = finite(priorityValue) ?? FUEL_IDS.indexOf(id);
  if (!Number.isFinite(priority)) return undefined;
  const costs =
    id === "Inferno"
      ? (() => {
          const oil = readResource(resources, "Oil");
          const infernite = readResource(resources, "Infernite");
          if (oil === undefined || infernite === undefined) return undefined;
          return Object.freeze([
            makeSmelterCost(resource, 50, 50, demand.isDemanded("Coal")),
            makeSmelterCost(oil, 35, 50, demand.isDemanded("Oil")),
            makeSmelterCost(infernite, 0.5, 50, demand.isDemanded("Infernite")),
          ]);
        })()
      : Object.freeze([
          makeSmelterCost(
            resource,
            quantity,
            minRateOfChange,
            demand.isDemanded(resourceId),
          ),
        ]);
  if (costs === undefined) return undefined;
  return Object.freeze({
    id,
    unlocked: true,
    isInfernoBeforeOil: priority === 0,
    currentFuelCount: 0,
    cost: costs,
  });
}

function readInput(dependencies: CapturedSmelterDependencies): SmelterSession {
  const root = dependencies.rootState.readRoot();
  const city = readProperty(root, "city");
  const smelter = readProperty(city, "smelter");
  const resources = readProperty(root, "resource");
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  const settings = readSettingRecord(dependencies.readSettings());
  const control = dependencies.controls.resolve(SMELTER_CONTROL);
  const demand = dependencies.readDemand?.() ?? {
    savingTarget: null,
    requestedQuantity: () => 0,
    requestedQuantityExcludingMech: () => 0,
    requestedQuantityForMechPriority: () => 0,
    isDemanded: () => false,
    storageRequired: () => 1,
  };
  const demandAuthorityAvailable = dependencies.readDemand !== undefined;
  if (
    !isRecord(smelter) ||
    !isRecord(resources) ||
    !isRecord(race) ||
    !isRecord(tech) ||
    Boolean(race["steelen"]) ||
    control === undefined
  ) {
    return Object.freeze({
      root,
      input: emptyInput(),
      demand,
      permissionEnabled: settings["autoSmelter"] === true,
      control,
      steelResource: undefined,
      demandAuthorityAvailable,
    });
  }
  const cap = readCount(smelter["cap"]);
  const star = readCount(smelter["Star"]);
  const ironCount = readCount(smelter["Iron"]);
  const steelCount = readCount(smelter["Steel"]);
  const iridiumCount = readCount(smelter["Iridium"]);
  if (
    cap === undefined ||
    star === undefined ||
    ironCount === undefined ||
    steelCount === undefined ||
    iridiumCount === undefined ||
    star > cap
  ) {
    return Object.freeze({
      root,
      input: emptyInput(),
      demand,
      permissionEnabled: settings["autoSmelter"] === true,
      control,
      steelResource: undefined,
      demandAuthorityAvailable,
    });
  }
  const iron = readResource(resources, "Iron");
  const steel = readResource(resources, "Steel");
  const coal = readResource(resources, "Coal");
  const titanium = readResource(resources, "Titanium");
  if (
    iron === undefined ||
    steel === undefined ||
    coal === undefined ||
    titanium === undefined
  ) {
    return Object.freeze({
      root,
      input: emptyInput(),
      demand,
      permissionEnabled: settings["autoSmelter"] === true,
      control,
      steelResource: undefined,
      demandAuthorityAvailable,
    });
  }
  const fuels = FUEL_IDS.map((id) =>
    readFuel(id, resources, race, tech, settings, demand),
  );
  if (fuels.some((fuel) => fuel === undefined)) {
    return Object.freeze({
      root,
      input: emptyInput(),
      demand,
      permissionEnabled: settings["autoSmelter"] === true,
      control,
      steelResource: steel,
      demandAuthorityAvailable,
    });
  }
  const orderedFuels = [...fuels]
    .filter((fuel): fuel is SmelterFuelView => fuel !== undefined)
    .sort(
      (left, right) =>
        (finite(settings[`smelter_fuel_p_${left.id}`]) ??
          FUEL_IDS.indexOf(left.id as FuelId)) -
        (finite(settings[`smelter_fuel_p_${right.id}`]) ??
          FUEL_IDS.indexOf(right.id as FuelId)),
    )
    .map((fuel, index, list) =>
      Object.freeze({
        ...fuel,
        isInfernoBeforeOil:
          fuel.id === "Inferno" && list[index + 1]?.id === "Oil",
      }),
    );
  const withSmelterCounts = orderedFuels.map((fuel) =>
    Object.freeze({
      ...fuel,
      currentFuelCount: readCount(smelter[fuel.id]) ?? 0,
    }),
  );
  const requestedIron = demand.requestedQuantity("Iron");
  const requestedSteel = demand.requestedQuantity("Steel");
  const productionSmeltingIridium =
    finite(settings["productionSmeltingIridium"]) ?? 0.5;
  if (productionSmeltingIridium < 0) {
    return Object.freeze({
      root,
      input: emptyInput(),
      demand,
      permissionEnabled: settings["autoSmelter"] === true,
      control,
      steelResource: undefined,
      demandAuthorityAvailable,
    });
  }
  const miner = readProperty(readProperty(root, "civic"), "miner");
  const ironShip = readProperty(readProperty(root, "space"), "iron_ship");
  const titaniumRatio =
    titanium.maximum > 0 ? titanium.amount / titanium.maximum : 1;
  const input: SmelterInput = Object.freeze({
    initialised: true,
    hasForge: Boolean(race["forge"]),
    totalSmelters: cap - star,
    extraOperating: star,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    fuels: Object.freeze(withSmelterCounts),
    ironCount,
    steelCount,
    iridiumCount,
    iridiumUnlocked:
      readResource(resources, "Iridium")?.display === true &&
      ((finite(tech["m_smelting"]) ?? 0) >= 2 ||
        Boolean(tech["irid_smelting"])),
    iridiumCapped: (() => {
      const iridium = readResource(resources, "Iridium");
      return iridium === undefined || iridium.maximum <= 0
        ? true
        : iridium.amount + iridium.rate / 20 >= iridium.maximum;
    })(),
    productionSmeltingIridium,
    productionSmelting:
      typeof settings["productionSmelting"] === "string"
        ? settings["productionSmelting"]
        : "required",
    steelCost: Object.freeze([
      makeSmelterCost(coal, 0.25, 1.25, demand.isDemanded("Coal")),
      makeSmelterCost(iron, 2, 6, demand.isDemanded("Iron")),
    ]),
    ironTimeToFull: timeTo(iron, iron.maximum),
    ironTimeToRequired: timeTo(iron, Math.max(iron.amount, requestedIron)),
    ironDemanded: demand.isDemanded("Iron"),
    steelTimeToFull: timeTo(steel, steel.maximum),
    steelTimeToRequired: timeTo(steel, Math.max(steel.amount, requestedSteel)),
    steelDemanded: demand.isDemanded("Steel"),
    minerCount: readCount(readProperty(miner, "workers")) ?? 0,
    beltIronShipStateOnCount: readCount(readProperty(ironShip, "on")) ?? 0,
    titaniumStorageRatio: titaniumRatio,
    haveTitaniumTech: (finite(tech["titanium"]) ?? 0) > 0,
  });
  return Object.freeze({
    root,
    input,
    demand,
    permissionEnabled: settings["autoSmelter"] === true,
    control,
    steelResource: steel,
    demandAuthorityAvailable,
  });
}

function currentValue(root: unknown, id: string): number | undefined {
  const smelter = readProperty(readProperty(root, "city"), "smelter");
  return isRecord(smelter) ? readCount(smelter[id]) : undefined;
}

function methodFor(kind: "fuel" | "metal", delta: number): string {
  if (kind === "fuel") return delta > 0 ? "addFuel" : "subFuel";
  return delta > 0 ? "addMetal" : "subMetal";
}

function normalizedCommands(
  decision: ReturnType<typeof planSmelter>,
): readonly string[] {
  return Object.freeze(
    (["fuel", "metal"] as const).flatMap((kind) =>
      ([-1, 1] as const).flatMap((sign) => {
        const adjustments =
          kind === "fuel"
            ? decision.fuelAdjustments.map((item) => ({
                id: item.fuelId,
                delta: item.delta,
              }))
            : decision.smeltAdjustments.map((item) => ({
                id: item.productionId,
                delta: item.delta,
              }));
        return adjustments.flatMap((item) =>
          item.delta !== 0 && Math.sign(item.delta) === sign
            ? Array.from(
                { length: Math.abs(item.delta) },
                () => `${methodFor(kind, item.delta)}:${item.id}`,
              )
            : [],
        );
      }),
    ),
  );
}

export interface CapturedSmelterIncumbentSnapshot {
  readonly ownerId: "smelter";
  readonly capability: "smelter-allocation";
  readonly boundary: "after-plan-before-native-execution";
  readonly root: unknown;
  readonly progressionGeneration: number | undefined;
  readonly permissionEnabled: boolean;
  readonly demand: Readonly<{
    requestedSteel: number;
    steelDemanded: boolean;
    savingTargetName: string | undefined;
    savingTargetPool: string | undefined;
    steelTarget: number | undefined;
  }>;
  readonly input: Readonly<SmelterInput>;
  /** Steel amount, storage and rate from the same ordinary owner input capture. */
  readonly steelResource:
    Readonly<{ amount: number; maximum: number; rate: number }> | undefined;
  readonly demandAuthorityAvailable: boolean;
  readonly decision: ReturnType<typeof planSmelter>;
  readonly commands: readonly string[];
  readonly controlGeneration: number | undefined;
  readonly controlMethods: readonly string[];
  readonly unavailableAuthority: readonly string[];
}

/** Additional city Steel quantity on top of the observed incumbent target. */
export interface CapturedSmelterSteelDemandRequest {
  readonly resourceId: "Steel";
  readonly pool: "city";
  readonly additionalSteel: number;
}

export function createCapturedSmelterIncumbentSnapshot(
  input: Readonly<SmelterInput>,
  decision: ReturnType<typeof planSmelter>,
  demand: Readonly<{
    requestedSteel: number;
    isSteelDemanded: boolean;
    savingTarget: CapturedDemandSample["savingTarget"];
  }>,
  observation: Readonly<{
    root: unknown;
    permissionEnabled: boolean;
    controlGeneration: number | undefined;
    controlMethods: readonly string[];
    plannedCommands: readonly string[];
    progressionGeneration: number | undefined;
    steelResource:
      Readonly<{ amount: number; maximum: number; rate: number }> | undefined;
    demandAuthorityAvailable: boolean;
  }>,
): CapturedSmelterIncumbentSnapshot {
  const unavailableAuthority = [
    ...(!Number.isSafeInteger(observation.progressionGeneration)
      ? ["progression-generation"]
      : []),
    ...(!Number.isSafeInteger(observation.controlGeneration)
      ? ["control-generation"]
      : []),
    ...(observation.plannedCommands.some((command) => {
      const method = command.slice(0, command.indexOf(":"));
      return !observation.controlMethods.includes(method);
    })
      ? ["native-command-method"]
      : []),
    ...(!input.initialised ? ["smelter-input"] : []),
    "cross-owner-commitment-coverage",
    "measured-production-marginals",
    "post-execution-allocation-is-a-separate-observation",
  ];
  const savingTarget = demand.savingTarget;
  return Object.freeze({
    ownerId: "smelter",
    capability: "smelter-allocation",
    boundary: "after-plan-before-native-execution",
    root: observation.root,
    progressionGeneration: observation.progressionGeneration,
    permissionEnabled: observation.permissionEnabled,
    demand: Object.freeze({
      requestedSteel: demand.requestedSteel,
      steelDemanded: demand.isSteelDemanded,
      savingTargetName: savingTarget?.name,
      savingTargetPool: savingTarget?.pool,
      steelTarget: savingTarget?.cost["Steel"],
    }),
    input,
    steelResource: observation.steelResource,
    demandAuthorityAvailable: observation.demandAuthorityAvailable,
    decision,
    commands: Object.freeze([...observation.plannedCommands]),
    controlGeneration: observation.controlGeneration,
    controlMethods: Object.freeze([...observation.controlMethods]),
    unavailableAuthority: Object.freeze([...new Set(unavailableAuthority)]),
  });
}

export function isCapturedSmelterSnapshotCurrent(
  snapshot: CapturedSmelterIncumbentSnapshot,
  current: Readonly<{
    root: unknown;
    progressionGeneration: number | undefined;
    permissionEnabled: boolean;
    requestedSteel: number;
    steelDemanded: boolean;
    savingTargetName: string | undefined;
    savingTargetPool: string | undefined;
    steelTarget: number | undefined;
    controlGeneration: number | undefined;
    controlMethods: readonly string[];
    allocations: Readonly<Record<string, number>>;
    capacity: number;
    inputSignature: string;
    steelResource:
      Readonly<{ amount: number; maximum: number; rate: number }> | undefined;
    demandAuthorityAvailable: boolean;
  }>,
): boolean {
  const allocations = {
    Iron: snapshot.input.ironCount,
    Steel: snapshot.input.steelCount,
    Iridium: snapshot.input.iridiumCount,
    ...Object.fromEntries(
      snapshot.input.fuels.map((fuel) => [fuel.id, fuel.currentFuelCount]),
    ),
  };
  return (
    !snapshot.unavailableAuthority.some((authority) =>
      [
        "progression-generation",
        "control-generation",
        "native-command-method",
        "smelter-input",
      ].includes(authority),
    ) &&
    snapshot.root === current.root &&
    snapshot.progressionGeneration === current.progressionGeneration &&
    snapshot.permissionEnabled === current.permissionEnabled &&
    snapshot.demand.requestedSteel === current.requestedSteel &&
    snapshot.demand.steelDemanded === current.steelDemanded &&
    snapshot.demand.savingTargetName === current.savingTargetName &&
    snapshot.demand.savingTargetPool === current.savingTargetPool &&
    snapshot.demand.steelTarget === current.steelTarget &&
    snapshot.controlGeneration === current.controlGeneration &&
    JSON.stringify([...snapshot.controlMethods].sort()) ===
      JSON.stringify([...current.controlMethods].sort()) &&
    snapshot.input.totalSmelters === current.capacity &&
    JSON.stringify(snapshot.steelResource) ===
      JSON.stringify(current.steelResource) &&
    snapshot.demandAuthorityAvailable === current.demandAuthorityAvailable &&
    JSON.stringify(snapshot.input) === current.inputSignature &&
    Object.entries(allocations).every(
      ([id, value]) => current.allocations[id] === value,
    )
  );
}

export function compareCapturedSmelterSteelDemand(
  snapshot: CapturedSmelterIncumbentSnapshot,
  request: unknown,
): Readonly<{
  requestValid: boolean;
  requestUnavailableReasons: readonly string[];
  quantityRepresented: boolean;
  quantitativeComparison: "available" | "unavailable";
  proposedInput: Readonly<SmelterInput> | undefined;
  policyPermitted: boolean | undefined;
  nativeAllocationFeasible: boolean | undefined;
  commandsChanged: boolean | undefined;
  incumbentAllocation: Readonly<Record<string, number>>;
  proposedAllocation: Readonly<Record<string, number>> | undefined;
  changedCommands:
    | Readonly<{
        incumbent: readonly string[];
        proposed: readonly string[];
      }>
    | undefined;
  availableSmelters: number | undefined;
  displacedAllocation: Readonly<Record<string, number>> | undefined;
  quantityDeliverable: boolean | undefined;
  incrementalProductionKnown: boolean;
  economicBenefitKnown: boolean;
  redundant: boolean | undefined;
  classification:
    | "quantity-represented-but-native-policy-insensitive"
    | "commands-changed"
    | "unavailable";
  unavailableReasons: readonly string[];
}> {
  const preCommandAllocation = {
    Iron: snapshot.input.ironCount,
    Steel: snapshot.input.steelCount,
    Iridium: snapshot.input.iridiumCount,
    ...Object.fromEntries(
      snapshot.input.fuels.map((fuel) => [fuel.id, fuel.currentFuelCount]),
    ),
  };
  const incumbentAllocation: Record<string, number> = {
    ...preCommandAllocation,
  };
  for (const item of snapshot.decision.fuelAdjustments)
    incumbentAllocation[item.fuelId] =
      item.expectedCurrentFuelCount + item.delta;
  for (const item of snapshot.decision.smeltAdjustments)
    incumbentAllocation[item.productionId] =
      item.expectedCurrentCount + item.delta;
  const incumbent = snapshot.commands;
  const requestRecord = isRecord(request) ? request : {};
  const additionalSteel = requestRecord["additionalSteel"];
  const requestUnavailableReasons: string[] = [];
  if (requestRecord["resourceId"] !== "Steel")
    requestUnavailableReasons.push("unsupported-resource");
  if (requestRecord["pool"] !== "city")
    requestUnavailableReasons.push("unsupported-resource-pool");
  if (typeof additionalSteel !== "number" || !Number.isFinite(additionalSteel))
    requestUnavailableReasons.push("additional-quantity-must-be-finite-number");
  else if (additionalSteel <= 0)
    requestUnavailableReasons.push("additional-quantity-must-be-positive");
  const requestedSteel = snapshot.demand.requestedSteel;
  const incumbentDemandValid =
    Number.isFinite(requestedSteel) && requestedSteel >= 0;
  const combinedTarget =
    typeof additionalSteel === "number" && incumbentDemandValid
      ? requestedSteel + additionalSteel
      : NaN;
  if (
    typeof additionalSteel === "number" &&
    additionalSteel > 0 &&
    incumbentDemandValid &&
    !Number.isFinite(combinedTarget)
  )
    requestUnavailableReasons.push("combined-demand-quantity-overflow");
  const requestValid = requestUnavailableReasons.length === 0;
  const representationUnavailableReasons: string[] = [];
  if (!snapshot.demandAuthorityAvailable)
    representationUnavailableReasons.push(
      "incumbent-demand-authority-unavailable",
    );
  if (!incumbentDemandValid)
    representationUnavailableReasons.push(
      "incumbent-demand-quantity-unavailable",
    );
  if (typeof snapshot.demand.steelDemanded !== "boolean")
    representationUnavailableReasons.push(
      "incumbent-demand-presence-unavailable",
    );
  if (
    snapshot.demand.savingTargetName !== undefined &&
    (snapshot.demand.savingTargetPool !== "city" ||
      !Number.isFinite(snapshot.demand.steelTarget) ||
      snapshot.demand.steelTarget! < 0)
  )
    representationUnavailableReasons.push(
      "incumbent-demand-pool-or-target-unsupported",
    );
  if (!snapshot.steelResource)
    representationUnavailableReasons.push("steel-quantity-input-unavailable");
  if (!snapshot.input.initialised)
    representationUnavailableReasons.push("smelter-input-unavailable");
  if (!snapshot.input.productionSmelting)
    representationUnavailableReasons.push("required-target-policy-unavailable");
  const steel = snapshot.steelResource;
  let proposedSteelTimeToRequired: number | undefined;
  if (
    requestValid &&
    typeof additionalSteel === "number" &&
    incumbentDemandValid &&
    steel
  ) {
    if (combinedTarget - requestedSteel !== additionalSteel)
      representationUnavailableReasons.push(
        "additional-quantity-below-representable-resolution",
      );
    const target = Math.max(steel.amount, combinedTarget);
    proposedSteelTimeToRequired = timeTo(steel, target);
    if (target > steel.amount && proposedSteelTimeToRequired === 0)
      representationUnavailableReasons.push(
        "additional-quantity-underflow-in-required-time",
      );
  }
  const quantityRepresented =
    requestValid && representationUnavailableReasons.length === 0;
  const proposedInput =
    quantityRepresented && proposedSteelTimeToRequired !== undefined
      ? Object.freeze({
          ...snapshot.input,
          steelTimeToRequired: proposedSteelTimeToRequired,
        })
      : undefined;
  const policyPermitted = quantityRepresented
    ? snapshot.permissionEnabled
    : undefined;
  const proposedDecision =
    proposedInput && policyPermitted ? planSmelter(proposedInput) : undefined;
  const proposedCommands = proposedDecision
    ? normalizedCommands(proposedDecision)
    : undefined;
  const commandsChanged = proposedCommands
    ? JSON.stringify(proposedCommands) !== JSON.stringify(incumbent)
    : undefined;
  const changedCommands =
    proposedCommands && commandsChanged
      ? Object.freeze({ incumbent, proposed: proposedCommands })
      : undefined;
  const proposedAllocation: Record<string, number> = {
    ...preCommandAllocation,
  };
  for (const item of proposedDecision?.fuelAdjustments ?? [])
    proposedAllocation[item.fuelId] =
      item.expectedCurrentFuelCount + item.delta;
  for (const item of proposedDecision?.smeltAdjustments ?? [])
    proposedAllocation[item.productionId] =
      item.expectedCurrentCount + item.delta;
  const displacedAllocation = proposedDecision
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(incumbentAllocation)
            .map(([id, value]) => [
              id,
              value - (proposedAllocation[id] ?? value),
            ])
            .filter(([, delta]) => delta !== 0),
        ),
      )
    : undefined;
  const proposedAllocationResult = proposedDecision
    ? Object.freeze(proposedAllocation)
    : undefined;
  const commandsFeasible =
    proposedDecision !== undefined &&
    Number.isSafeInteger(snapshot.controlGeneration) &&
    proposedCommands!.every((command) =>
      snapshot.controlMethods.includes(command.slice(0, command.indexOf(":"))),
    ) &&
    Object.values(proposedAllocation).every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) &&
    proposedAllocation.Iron! +
      proposedAllocation.Steel! +
      proposedAllocation.Iridium! <=
      snapshot.input.totalSmelters + snapshot.input.extraOperating &&
    SMELTER_FUEL_IDS.reduce(
      (sum, id) => sum + (proposedAllocation[id] ?? 0),
      0,
    ) <=
      snapshot.input.totalSmelters + snapshot.input.extraOperating;
  const stockCoversTarget =
    quantityRepresented &&
    steel !== undefined &&
    steel.amount >= combinedTarget;
  const unavailableReasons = !requestValid
    ? [...requestUnavailableReasons, ...representationUnavailableReasons]
    : !quantityRepresented
      ? [...representationUnavailableReasons]
      : policyPermitted
        ? commandsFeasible
          ? []
          : ["native-control-or-allocation-feasibility-unavailable"]
        : ["smelter-policy-disabled"];
  return Object.freeze({
    requestValid,
    requestUnavailableReasons: Object.freeze(requestUnavailableReasons),
    quantityRepresented,
    quantitativeComparison: proposedDecision ? "available" : "unavailable",
    proposedInput,
    policyPermitted,
    nativeAllocationFeasible: proposedDecision ? commandsFeasible : undefined,
    commandsChanged,
    incumbentAllocation,
    proposedAllocation: proposedAllocationResult,
    changedCommands,
    availableSmelters: proposedDecision
      ? Math.max(
          0,
          snapshot.input.totalSmelters +
            snapshot.input.extraOperating -
            incumbentAllocation.Iron! -
            incumbentAllocation.Steel! -
            incumbentAllocation.Iridium! -
            SMELTER_FUEL_IDS.reduce(
              (sum, id) => sum + (incumbentAllocation[id] ?? 0),
              0,
            ),
        )
      : undefined,
    displacedAllocation,
    quantityDeliverable: undefined,
    incrementalProductionKnown: false,
    economicBenefitKnown: false,
    redundant: stockCoversTarget ? true : undefined,
    classification: !proposedDecision
      ? "unavailable"
      : commandsChanged
        ? "commands-changed"
        : "quantity-represented-but-native-policy-insensitive",
    unavailableReasons: Object.freeze(unavailableReasons),
  });
}

export function createCapturedSmelterAutomation(
  dependencies: CapturedSmelterDependencies,
): {
  readonly readPlanForDiagnostics: () => Readonly<{
    input: Readonly<SmelterInput>;
    decision: ReturnType<typeof planSmelter>;
    controlAvailable: boolean;
    controlMethods: readonly string[];
  }>;
  readonly run: () => CommandExecutionOutcome;
} {
  return Object.freeze({
    readPlanForDiagnostics() {
      const session = readInput(dependencies);
      const control = dependencies.controls.resolve(SMELTER_CONTROL);
      return Object.freeze({
        input: session.input,
        decision: planSmelter(session.input),
        controlAvailable: control !== undefined,
        controlMethods: Object.freeze([...(control?.methods ?? [])]),
      });
    },
    run(): CommandExecutionOutcome {
      const session = readInput(dependencies);
      const prepareForTest =
        dependencies.prepareInputForTest !== undefined &&
        (dependencies.shouldPrepareInputForTest?.() ?? true);
      const input =
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true &&
        prepareForTest
          ? (dependencies.prepareInputForTest?.(
              session.input,
              session.demand,
            ) ?? session.input)
          : session.input;
      const decision = planSmelter(input);
      const publishPlan =
        dependencies.observePlanForDiagnostics !== undefined &&
        (dependencies.shouldObservePlanForDiagnostics?.() ?? true);
      const commandGroups = [
        ...decision.fuelAdjustments.map((adjustment) => ({
          kind: "fuel" as const,
          id: adjustment.fuelId,
          delta: adjustment.delta,
          expected: adjustment.expectedCurrentFuelCount,
        })),
        ...decision.smeltAdjustments.map((adjustment) => ({
          kind: "metal" as const,
          id: adjustment.productionId,
          delta: adjustment.delta,
          expected: adjustment.expectedCurrentCount,
        })),
      ].filter((adjustment) => adjustment.delta !== 0);
      const plannedCommands = publishPlan
        ? normalizedCommands(decision)
        : Object.freeze([] as string[]);
      const expectedAllocations = publishPlan
        ? Object.freeze({
            Iron: input.ironCount,
            Steel: input.steelCount,
            Iridium: input.iridiumCount,
            ...Object.fromEntries(
              input.fuels.map((fuel) => [fuel.id, fuel.currentFuelCount]),
            ),
          })
        : Object.freeze({});
      const observation = publishPlan
        ? Object.freeze({
            root: session.root,
            permissionEnabled: session.permissionEnabled,
            controlGeneration: session.control?.generation,
            controlMethods: Object.freeze([
              ...(session.control?.methods ?? []),
            ]),
            plannedCommands,
            expectedAllocations,
            progressionGeneration: dependencies.readProgressionGeneration?.(),
            steelResource: session.steelResource
              ? Object.freeze({
                  amount: session.steelResource.amount,
                  maximum: session.steelResource.maximum,
                  rate: session.steelResource.rate,
                })
              : undefined,
            demandAuthorityAvailable: session.demandAuthorityAvailable,
          })
        : undefined;
      if (publishPlan)
        dependencies.observePlanForDiagnostics?.(
          input,
          decision,
          {
            requestedSteel: session.demand.requestedQuantity("Steel"),
            isSteelDemanded: session.demand.isDemanded("Steel"),
            savingTarget: session.demand.savingTarget,
          },
          observation,
        );
      const finish = (
        outcome: CommandExecutionOutcome,
        postcondition: Readonly<{
          status: "verified" | "failed" | "no-op" | "not-checked";
          allocations: Readonly<Record<string, number | undefined>>;
        }> = Object.freeze({
          status: "not-checked",
          allocations: Object.freeze({}),
        }),
      ) => {
        if (observation !== undefined)
          dependencies.observeOutcomeForTest?.(
            outcome,
            observation,
            postcondition,
          );
        return outcome;
      };
      if (!session.input.initialised) return finish(SUCCEEDED);
      const adjustments = commandGroups;
      if (adjustments.length === 0)
        return finish(
          SUCCEEDED,
          Object.freeze({ status: "no-op", allocations: expectedAllocations }),
        );
      const handle = dependencies.controls.resolve(SMELTER_CONTROL);
      if (
        observation !== undefined &&
        handle !== undefined &&
        (handle.generation !== observation.controlGeneration ||
          handle.elementId !== SMELTER_CONTROL)
      ) {
        return finish(
          stale(
            "captured-smelter-control-replaced",
            "captured iSmelter control changed after the plan was observed",
          ),
        );
      }
      if (
        handle === undefined ||
        adjustments.some(
          (adjustment) =>
            !handle.methods.includes(
              methodFor(adjustment.kind, adjustment.delta),
            ),
        )
      ) {
        return finish(
          rejected(
            "captured-smelter-control-missing",
            "captured iSmelter control lacks the required allocation method",
          ),
        );
      }
      for (const adjustment of adjustments) {
        const actual = currentValue(session.root, adjustment.id);
        if (actual !== adjustment.expected) {
          return finish(
            stale(
              "captured-smelter-allocation-changed",
              `${adjustment.id}: sampled allocation changed`,
            ),
            Object.freeze({
              status: "failed",
              allocations: Object.freeze({ [adjustment.id]: actual }),
            }),
          );
        }
      }
      for (const kind of ["fuel", "metal"] as const) {
        for (const sign of [-1, 1] as const) {
          for (const adjustment of adjustments) {
            if (
              adjustment.kind !== kind ||
              Math.sign(adjustment.delta) !== sign
            )
              continue;
            const method = methodFor(kind, adjustment.delta);
            for (
              let index = 0;
              index < Math.abs(adjustment.delta);
              index += 1
            ) {
              if (dependencies.rootState.readRoot() !== session.root) {
                return finish(
                  stale(
                    "captured-smelter-root-changed",
                    "captured game root changed",
                  ),
                  Object.freeze({
                    status: "failed",
                    allocations: Object.freeze({}),
                  }),
                );
              }
              const result = dependencies.controls.invoke(handle, method, [
                adjustment.id,
              ]);
              if (!result.ok) {
                const actualAllocations =
                  observation === undefined
                    ? Object.freeze({})
                    : Object.freeze(
                        Object.fromEntries(
                          adjustments.map((item) => [
                            item.id,
                            currentValue(session.root, item.id),
                          ]),
                        ),
                      );
                return finish(
                  rejected(
                    "captured-smelter-control-failed",
                    result.detail ?? result.reason,
                  ),
                  Object.freeze({
                    status: "failed",
                    allocations: actualAllocations,
                  }),
                );
              }
            }
          }
        }
      }
      const postAllocations: Record<string, number | undefined> = {};
      for (const adjustment of adjustments) {
        const actual = currentValue(session.root, adjustment.id);
        postAllocations[adjustment.id] = actual;
        if (actual !== adjustment.expected + adjustment.delta) {
          return finish(
            stale(
              "captured-smelter-allocation-unchanged",
              `${adjustment.id}: expected ${adjustment.expected + adjustment.delta}, actual ${actual}`,
            ),
            Object.freeze({
              status: "failed",
              allocations: Object.freeze(postAllocations),
            }),
          );
        }
      }
      return finish(
        SUCCEEDED,
        Object.freeze({
          status: "verified",
          allocations: Object.freeze(postAllocations),
        }),
      );
    },
  });
}
