/** Bounded DeadSpace smelter allocation through the captured industry panel. */

import { CONSUMPTION_BALANCE_MIN } from "../../../../config.ts";
import {
  planSmelter,
  type SmelterCostView,
  type SmelterFuelView,
  type SmelterInput,
  proveSmelterSteelTimeInvariance,
} from "../../../../domain/economy/production/smelter.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import { capturedSupplyScope } from "../../captured-affordability.ts";
import type { CapturedDemandSample } from "../resources/captured-resource-demand.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameControlHandle } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

export const SMELTER_CONTROL = "iSmelter";

export type CapturedSmelterObservationModeForTest = "G" | "H" | "S" | "Q" | "U";

export function setCapturedSmelterObservationModeForTest(
  hooks: unknown,
  mode: unknown,
): boolean {
  if (
    !isRecord(hooks) ||
    (mode !== "G" &&
      mode !== "H" &&
      mode !== "S" &&
      mode !== "Q" &&
      mode !== "U")
  )
    return false;
  Reflect.set(hooks, "smelterObservationMode", mode);
  return true;
}

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
      steelSupplyScope: "civilization-wide" | "regional" | "unavailable";
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
  readonly shouldObserveOutcomeForTest?: () => boolean;
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
    savingTargetPoolWasPresent: boolean;
    steelTarget: number | undefined;
    savingTargetSteelCostWasPresent: boolean;
    savingTargetCost: Readonly<Record<string, number>> | undefined;
    steelSupplyScope: "civilization-wide" | "regional" | "unavailable";
  }>;
  readonly input: Readonly<SmelterInput>;
  /** Steel amount, storage and rate from the same ordinary owner input capture. */
  readonly steelResource:
    Readonly<{ amount: number; maximum: number; rate: number }> | undefined;
  /** The pinned game's Steel payment scope, derived from this same root snapshot. */
  readonly steelSupplyScope: "civilization-wide" | "regional" | "unavailable";
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

export interface CapturedSmelterGoalDemandProposal {
  readonly goalId: string;
  readonly requirementId: string;
  readonly provenance: "verified-mandatory" | "provisional-advisory";
  readonly nativeActionPrice?: Readonly<{
    actionId: string;
    priceIdentity: string;
  }>;
  readonly resourceId: string;
  readonly pool: string;
  readonly additionalQuantity: number;
  readonly root: unknown;
  readonly progressionGeneration: number;
  readonly demandGeneration: number;
  readonly permissionEnabled: boolean;
  readonly originatingOwner: string;
  readonly validity: Readonly<{
    valid: boolean;
    expiresAtOwnerCycle: number;
    invalidatedBy: readonly string[];
  }>;
  readonly knownCompetingCommitments: readonly string[];
  /** A conflict blocks only when a source explicitly proves it for Steel and this pool. */
  readonly provenConflictingCommitments?: readonly Readonly<{
    sourceBacked: true;
    resourceId: string;
    pool: string;
    reason: string;
  }>[];
  readonly unknownCommitmentCoverage: boolean;
}

export function evaluateCapturedSmelterGoalDemandProposal(
  snapshot: CapturedSmelterIncumbentSnapshot,
  proposal: unknown,
  ownerCycle: number,
): Readonly<{
  proposalValidForEvaluation: boolean;
  structurallyValid: boolean;
  ownerLocalComparisonAvailable: boolean;
  goalRequestAuthorized: false;
  status: string;
  diagnosticStates: readonly string[];
  reasons: readonly string[];
  requestBlockedByCompetingCommitment: boolean;
  unknownCommitmentCoverage: boolean | undefined;
  freshness: Readonly<{
    sameCycleRoot: boolean;
    sameCycleProgression: boolean;
    sameCyclePermission: boolean;
    demandGenerationTokenMatchesOwnerCycle: boolean;
    demandIdentity: "unknown";
    proposalDemandGeneration: number | undefined;
    currentOwnerCycle: number;
    invalidationListIsDeclarationOnly: true;
    declaredInvalidations: readonly string[];
    missingInvalidationDeclarations: readonly string[];
    verifiedPriceIdentity: false;
    currentGoalIdentity: "unknown";
    offerFreshness: "unknown";
    goalFreshness: "unknown";
    queueFreshness: "unknown";
    authorizationToExecute: false;
  }>;
  knownCommitments: readonly string[];
  sourceBackedCompetingClaims: readonly unknown[];
  demonstratedConflicts: readonly unknown[];
  productionEffectKnown: false;
  economicBenefitKnown: false;
  comparison: ReturnType<typeof compareCapturedSmelterSteelDemand> | undefined;
}> {
  const item = isRecord(proposal) ? proposal : {};
  const validity = isRecord(item["validity"]) ? item["validity"] : {};
  const nativeActionPrice = isRecord(item["nativeActionPrice"])
    ? item["nativeActionPrice"]
    : undefined;
  const reasons: string[] = [];
  const requiredInvalidations = [
    "root-replacement",
    "progression-change",
    "offer-price-change",
    "goal-change-or-satisfaction",
    "resource-stock-change",
    "demand-change",
    "native-control-generation-change",
    "permission-change",
    "construction-queue-change",
    "conflicting-iron-demand",
    "unknown-commitment-coverage",
    "owner-disabled-or-uninitialized",
    "incomplete-candidate-enumeration",
    "newer-owner-cycle",
  ];
  const structuralReasons: string[] = [];
  if (typeof item["goalId"] !== "string" || !item["goalId"])
    structuralReasons.push("goal-identity-unavailable");
  if (typeof item["requirementId"] !== "string" || !item["requirementId"])
    structuralReasons.push("requirement-identity-unavailable");
  if (
    item["provenance"] !== "verified-mandatory" &&
    item["provenance"] !== "provisional-advisory"
  )
    structuralReasons.push("requirement-provenance-unavailable");
  if (
    nativeActionPrice &&
    (typeof nativeActionPrice["actionId"] !== "string" ||
      typeof nativeActionPrice["priceIdentity"] !== "string")
  )
    structuralReasons.push("native-action-price-identity-unavailable");
  if (
    typeof item["additionalQuantity"] !== "number" ||
    !Number.isFinite(item["additionalQuantity"])
  )
    structuralReasons.push("additional-quantity-must-be-finite");
  else if (item["additionalQuantity"] <= 0)
    structuralReasons.push("additional-quantity-must-be-positive");
  if (item["resourceId"] !== "Steel" || item["pool"] !== "city")
    structuralReasons.push("unsupported-resource-pool");
  if (item["originatingOwner"] !== "smelter")
    structuralReasons.push("originating-owner-mismatch");
  if (validity["valid"] !== true) structuralReasons.push("request-invalid");
  if (
    !Number.isSafeInteger(validity["expiresAtOwnerCycle"]) ||
    (validity["expiresAtOwnerCycle"] as number) < ownerCycle
  )
    reasons.push("request-expired");
  if (
    !Array.isArray(validity["invalidatedBy"]) ||
    !(validity["invalidatedBy"] as unknown[]).every(
      (condition) => typeof condition === "string",
    )
  )
    structuralReasons.push("invalidation-declaration-malformed");
  if (!Array.isArray(item["knownCompetingCommitments"]))
    structuralReasons.push("competing-commitments-unavailable");
  if (
    Array.isArray(item["knownCompetingCommitments"]) &&
    !(item["knownCompetingCommitments"] as unknown[]).every(
      (commitment) => typeof commitment === "string",
    )
  )
    structuralReasons.push("competing-commitments-malformed");
  if (typeof item["unknownCommitmentCoverage"] !== "boolean")
    structuralReasons.push("commitment-coverage-unavailable");
  reasons.push(...structuralReasons);
  if (item["root"] !== snapshot.root) reasons.push("root-replaced");
  if (item["progressionGeneration"] !== snapshot.progressionGeneration)
    reasons.push("progression-changed");
  if (item["demandGeneration"] !== ownerCycle)
    reasons.push("demand-generation-stale");
  if (item["permissionEnabled"] !== snapshot.permissionEnabled)
    reasons.push("permission-changed");
  const structurallyValid = structuralReasons.length === 0;
  const proposalValidForEvaluation = structurallyValid && reasons.length === 0;
  const comparison = proposalValidForEvaluation
    ? compareCapturedSmelterSteelDemand(snapshot, {
        resourceId: item["resourceId"],
        pool: item["pool"],
        additionalSteel: item["additionalQuantity"],
      })
    : undefined;
  if (comparison && !comparison.requestValid)
    reasons.push(...comparison.requestUnavailableReasons);
  if (comparison && !comparison.quantityRepresented)
    reasons.push(...comparison.unavailableReasons);
  const knownCommitments = Array.isArray(item["knownCompetingCommitments"])
    ? item["knownCompetingCommitments"].filter(
        (commitment): commitment is string => typeof commitment === "string",
      )
    : [];
  const sourceBackedClaims = Array.isArray(item["provenConflictingCommitments"])
    ? item["provenConflictingCommitments"].filter(
        (claim): claim is Record<string, unknown> =>
          isRecord(claim) && claim["sourceBacked"] === true,
      )
    : [];
  const demonstratedConflicts = sourceBackedClaims.filter(
    (claim) =>
      claim["resourceId"] === "Steel" &&
      claim["pool"] === "city" &&
      typeof claim["reason"] === "string" &&
      claim["reason"].trim().length > 0,
  );
  const ownerLocalComparisonAvailable =
    proposalValidForEvaluation &&
    comparison?.quantitativeComparison === "available";
  const requestValid =
    proposalValidForEvaluation && comparison?.requestValid !== false;
  const status = !requestValid
    ? reasons.includes("request-expired")
      ? "request-expired"
      : reasons.some((reason) =>
            [
              "root-replaced",
              "progression-changed",
              "permission-changed",
              "demand-generation-stale",
            ].includes(reason),
          )
        ? "request-invalidated"
        : "invalid-request"
    : demonstratedConflicts.length > 0
      ? "request-blocked-by-competing-commitment"
      : !comparison?.quantityRepresented
        ? "unavailable-authority"
        : comparison.commandsChanged
          ? comparison.nativeAllocationFeasible
            ? "commands-changed"
            : "native-allocation-infeasible"
          : "quantity-represented-but-native-policy-insensitive";
  const diagnosticStates = [
    ...(!requestValid ? ["invalid-request"] : []),
    ...(reasons.includes("request-expired") ? ["request-expired"] : []),
    ...(reasons.some((reason) =>
      [
        "root-replaced",
        "progression-changed",
        "permission-changed",
        "demand-generation-stale",
      ].includes(reason),
    )
      ? ["request-invalidated"]
      : []),
    ...(comparison && !comparison.quantityRepresented
      ? ["unavailable-authority"]
      : []),
    ...(comparison?.quantityRepresented ? ["quantity-represented"] : []),
    ...(comparison?.classification ===
    "quantity-represented-but-native-policy-insensitive"
      ? ["quantity-represented-but-native-policy-insensitive"]
      : []),
    ...(comparison?.commandsChanged ? ["commands-changed"] : []),
    ...(comparison?.nativeAllocationFeasible === false
      ? ["native-allocation-infeasible"]
      : []),
    "production-effect-unknown",
    "economic-benefit-unknown",
    ...(demonstratedConflicts.length > 0
      ? ["request-blocked-by-competing-commitment"]
      : []),
    ...(item["unknownCommitmentCoverage"] === true
      ? ["unknown-commitment-coverage"]
      : []),
  ];
  return Object.freeze({
    proposalValidForEvaluation: requestValid,
    structurallyValid,
    ownerLocalComparisonAvailable,
    goalRequestAuthorized: false,
    status,
    diagnosticStates: Object.freeze([...new Set(diagnosticStates)]),
    reasons: Object.freeze([...new Set(reasons)]),
    requestBlockedByCompetingCommitment: demonstratedConflicts.length > 0,
    unknownCommitmentCoverage:
      typeof item["unknownCommitmentCoverage"] === "boolean"
        ? item["unknownCommitmentCoverage"]
        : undefined,
    freshness: Object.freeze({
      sameCycleRoot: item["root"] === snapshot.root,
      sameCycleProgression:
        item["progressionGeneration"] === snapshot.progressionGeneration,
      sameCyclePermission:
        item["permissionEnabled"] === snapshot.permissionEnabled,
      demandGenerationTokenMatchesOwnerCycle:
        item["demandGeneration"] === ownerCycle,
      demandIdentity: "unknown",
      proposalDemandGeneration:
        typeof item["demandGeneration"] === "number"
          ? item["demandGeneration"]
          : undefined,
      currentOwnerCycle: ownerCycle,
      invalidationListIsDeclarationOnly: true,
      declaredInvalidations: Object.freeze(
        Array.isArray(validity["invalidatedBy"])
          ? (validity["invalidatedBy"] as unknown[]).filter(
              (condition): condition is string => typeof condition === "string",
            )
          : [],
      ),
      missingInvalidationDeclarations: Object.freeze(
        requiredInvalidations.filter(
          (condition) =>
            !Array.isArray(validity["invalidatedBy"]) ||
            !(validity["invalidatedBy"] as unknown[]).includes(condition),
        ),
      ),
      verifiedPriceIdentity: false,
      currentGoalIdentity: "unknown",
      offerFreshness: "unknown",
      goalFreshness: "unknown",
      queueFreshness: "unknown",
      authorizationToExecute: false,
    }),
    knownCommitments: Object.freeze([...knownCommitments]),
    sourceBackedCompetingClaims: Object.freeze(sourceBackedClaims),
    demonstratedConflicts: Object.freeze(demonstratedConflicts),
    productionEffectKnown: false,
    economicBenefitKnown: false,
    comparison,
  });
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
    steelSupplyScope: "civilization-wide" | "regional" | "unavailable";
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
      savingTargetPoolWasPresent:
        savingTarget != null && Object.hasOwn(savingTarget, "pool"),
      steelTarget: savingTarget?.cost["Steel"],
      savingTargetSteelCostWasPresent:
        savingTarget != null && Object.hasOwn(savingTarget.cost, "Steel"),
      savingTargetCost: savingTarget?.cost,
      steelSupplyScope: observation.steelSupplyScope,
    }),
    input,
    steelResource: observation.steelResource,
    steelSupplyScope: observation.steelSupplyScope,
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
    savingTargetPoolWasPresent: boolean;
    steelTarget: number | undefined;
    savingTargetSteelCostWasPresent: boolean;
    savingTargetCost: Readonly<Record<string, number>> | undefined;
    steelSupplyScope: "civilization-wide" | "regional" | "unavailable";
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
    snapshot.demand.savingTargetPoolWasPresent ===
      current.savingTargetPoolWasPresent &&
    snapshot.demand.steelTarget === current.steelTarget &&
    snapshot.demand.savingTargetSteelCostWasPresent ===
      current.savingTargetSteelCostWasPresent &&
    JSON.stringify(snapshot.demand.savingTargetCost) ===
      JSON.stringify(current.savingTargetCost) &&
    snapshot.demand.steelSupplyScope === current.steelSupplyScope &&
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
  hypotheticalPlannerCalls: 0 | 1;
  comparisonMethod: "proven-invariant" | "planned" | "unavailable";
  invarianceReason:
    ReturnType<typeof proveSmelterSteelTimeInvariance> | undefined;
  incumbentDemand: CapturedSmelterIncumbentSnapshot["demand"];
  currentSteel: CapturedSmelterIncumbentSnapshot["steelResource"];
  incumbentInput: CapturedSmelterIncumbentSnapshot["input"];
  incumbentDecision: CapturedSmelterIncumbentSnapshot["decision"];
  steelSupplyScope: CapturedSmelterIncumbentSnapshot["steelSupplyScope"];
  incumbentSteelTimeToRequired: number;
  requestedSteelBefore: number | undefined;
  requestedSteelAfter: number | undefined;
  effectiveAdditionalSteel: number | undefined;
  storageClamped: boolean | undefined;
  quantitativeComparison: "available" | "unavailable";
  proposedInput: Readonly<SmelterInput> | undefined;
  policyPermitted: boolean | undefined;
  nativeAllocationFeasible: boolean | undefined;
  commandsChanged: boolean | undefined;
  incumbentCommands: readonly string[];
  proposedCommands: readonly string[] | undefined;
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
  const steel = snapshot.steelResource;
  const incumbentDemandValid =
    Number.isFinite(requestedSteel) && requestedSteel >= 0;
  const unclampedTarget =
    typeof additionalSteel === "number" && incumbentDemandValid
      ? requestedSteel + additionalSteel
      : NaN;
  if (
    typeof additionalSteel === "number" &&
    additionalSteel > 0 &&
    incumbentDemandValid &&
    !Number.isFinite(unclampedTarget)
  )
    requestUnavailableReasons.push("combined-demand-quantity-overflow");
  const storageCapacity = steel?.maximum;
  const storageAuthorityValid =
    typeof storageCapacity === "number" &&
    Number.isFinite(storageCapacity) &&
    storageCapacity >= 0;
  const combinedTarget =
    Number.isFinite(unclampedTarget) && storageAuthorityValid
      ? Math.min(unclampedTarget, storageCapacity)
      : NaN;
  const requestValid = requestUnavailableReasons.length === 0;
  const representationUnavailableReasons: string[] = [];
  if (
    typeof additionalSteel === "number" &&
    additionalSteel > 0 &&
    incumbentDemandValid &&
    unclampedTarget - requestedSteel !== additionalSteel &&
    unclampedTarget < storageCapacity!
  )
    representationUnavailableReasons.push(
      "additional-quantity-below-representable-resolution",
    );
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
  if (!snapshot.steelResource)
    representationUnavailableReasons.push("steel-quantity-input-unavailable");
  if (snapshot.demand.steelSupplyScope === "regional")
    representationUnavailableReasons.push(
      "regional-steel-request-scope-unavailable",
    );
  else if (snapshot.demand.steelSupplyScope !== "civilization-wide")
    representationUnavailableReasons.push("steel-payment-scope-unavailable");
  if (!storageAuthorityValid)
    representationUnavailableReasons.push("steel-storage-capacity-unavailable");
  if (!snapshot.input.initialised)
    representationUnavailableReasons.push("smelter-input-unavailable");
  if (!snapshot.input.productionSmelting)
    representationUnavailableReasons.push("required-target-policy-unavailable");
  let proposedSteelTimeToRequired: number | undefined;
  if (
    requestValid &&
    typeof additionalSteel === "number" &&
    incumbentDemandValid &&
    steel
  ) {
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
  const invarianceReason = proposedInput
    ? proveSmelterSteelTimeInvariance(snapshot.input, proposedInput)
    : undefined;
  const comparisonMethod: "proven-invariant" | "planned" | "unavailable" =
    proposedInput && policyPermitted
      ? invarianceReason === undefined
        ? "planned"
        : "proven-invariant"
      : "unavailable";
  const proposedDecision =
    comparisonMethod === "proven-invariant"
      ? snapshot.decision
      : comparisonMethod === "planned" && proposedInput
        ? planSmelter(proposedInput)
        : undefined;
  const hypotheticalPlannerCalls: 0 | 1 =
    comparisonMethod === "planned" ? 1 : 0;
  const proposedCommands = proposedDecision
    ? comparisonMethod === "proven-invariant"
      ? incumbent
      : normalizedCommands(proposedDecision)
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
    hypotheticalPlannerCalls,
    comparisonMethod,
    invarianceReason,
    incumbentDemand: snapshot.demand,
    currentSteel: snapshot.steelResource,
    incumbentInput: snapshot.input,
    incumbentDecision: snapshot.decision,
    steelSupplyScope: snapshot.demand.steelSupplyScope,
    incumbentSteelTimeToRequired: snapshot.input.steelTimeToRequired,
    requestedSteelBefore: incumbentDemandValid ? requestedSteel : undefined,
    requestedSteelAfter:
      quantityRepresented && Number.isFinite(combinedTarget)
        ? combinedTarget
        : undefined,
    effectiveAdditionalSteel:
      quantityRepresented && incumbentDemandValid
        ? Math.max(0, combinedTarget - requestedSteel)
        : undefined,
    storageClamped:
      quantityRepresented && Number.isFinite(unclampedTarget)
        ? combinedTarget < unclampedTarget
        : undefined,
    quantitativeComparison: proposedDecision ? "available" : "unavailable",
    proposedInput,
    policyPermitted,
    nativeAllocationFeasible: proposedDecision ? commandsFeasible : undefined,
    commandsChanged,
    incumbentCommands: Object.freeze([...incumbent]),
    proposedCommands,
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
    // A current stock comparison is not an economic redundancy proof. The
    // request remains a represented demand even when it leaves native policy unchanged.
    redundant: undefined,
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
            steelSupplyScope: capturedSupplyScope(session.root),
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
        else if (
          typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
          __EA_TEST_SURFACE_ENABLED__ === true &&
          dependencies.shouldObserveOutcomeForTest?.() === true
        ) {
          dependencies.observeOutcomeForTest?.(
            outcome,
            Object.freeze({
              root: session.root,
              plannedCommands: normalizedCommands(decision),
              expectedAllocations: Object.freeze({
                Iron: input.ironCount,
                Steel: input.steelCount,
                Iridium: input.iridiumCount,
                ...Object.fromEntries(
                  input.fuels.map((fuel) => [fuel.id, fuel.currentFuelCount]),
                ),
              }),
              controlGeneration: session.control?.generation,
            }),
            postcondition,
          );
        }
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
