export const POWER_WIDE_OSCILLATION_HOLD_TICKS = 10;

export type PowerSupportKind =
  "none" | "support" | "womlings-support" | "tau-belt-support";

export interface PowerResourceInput {
  readonly id: string;
  readonly title: string;
  readonly currentQuantity: number;
  readonly maxQuantity: number;
  readonly rateOfChange: number;
  readonly storageRatio: number;
  readonly unlocked: boolean;
  readonly useful: boolean;
  readonly income: number;
  readonly incomeAdjusted: boolean;
  readonly supportKind: PowerSupportKind;
}

export interface PowerConsumptionInput {
  readonly resourceId: string;
  readonly rate: number;
  readonly fuelRate: number;
}

export interface BusyWorkerInput {
  readonly resourceId: string;
  readonly useful: boolean;
  readonly production: number;
  readonly income: number;
}

export type PowerBuildingRule =
  | { readonly kind: "ordinary" }
  | { readonly kind: "exotic-zoo" }
  | {
      readonly kind: "neutron-citadel";
      readonly electromagneticField: boolean;
    }
  | {
      readonly kind: "belt-space-station";
      readonly stationStorage: number;
      readonly eleriumMaximum: number;
      readonly eleriumMaximumCost: number;
      readonly eleriumShipsOn: number;
      readonly iridiumShipsOn: number;
      readonly ironShipsOn: number;
    }
  | { readonly kind: "job-dependent"; readonly jobCount: number }
  | {
      readonly kind: "lake-cooling-tower";
      readonly harborCount: number;
      readonly electromagneticField: boolean;
    }
  | { readonly kind: "lake-harbor" }
  | {
      readonly kind: "busy-resource";
      readonly active: boolean;
      readonly savingOnly: boolean;
      readonly observation: BusyWorkerInput;
    }
  | {
      readonly kind: "triton-lander";
      readonly fobOn: number;
      readonly currentSoldiers: number;
      readonly wounded: number;
      readonly healingRate: number;
      readonly highPopulationMultiplier: number;
      readonly authorityReserve: number;
    }
  | {
      readonly kind: "ascension-trigger";
      readonly pillarFinished: boolean;
      readonly prestigeType: string;
    }
  | { readonly kind: "terraformer"; readonly prestigeType: string }
  | {
      readonly kind: "badlands-attractor";
      readonly threat: number;
      readonly bottomThreat: number;
      readonly topThreat: number;
      readonly hellAssigned: number;
    }
  | {
      readonly kind: "tourist-center";
      readonly hungryRace: boolean;
      readonly foodStorageRatio: number;
      readonly moneyUseful: boolean;
      readonly observation: BusyWorkerInput;
    }
  | {
      readonly kind: "mill";
      readonly foodStorageRatio: number;
      readonly foodWorkers: number;
      readonly sampledPower: number;
    }
  | {
      readonly kind: "chthonian-mine-layer";
      readonly raiderOn: number;
      readonly excavatorOn: number;
      readonly starbaseOn: number;
      readonly piracy: number;
      readonly armada: number;
      readonly rating: number;
    }
  | {
      readonly kind: "ruins-guard-post";
      readonly suppressionUseful: boolean;
      readonly postRating: number;
      readonly ruinsRating: number;
      readonly gateUnlocked: boolean;
      readonly gateRating: number;
    }
  | {
      readonly kind: "spire-waygate";
      readonly cleared: boolean;
      readonly demonicBombReady: boolean;
      readonly mechPotentialTooHigh: boolean;
      readonly prestigeFloorProtected: boolean;
    }
  | {
      readonly kind: "early-galaxy-ship";
      readonly piracyUnlocked: boolean;
      readonly embassyUnlocked: boolean;
    }
  | {
      readonly kind: "armed-miner";
      readonly observations: readonly [
        BusyWorkerInput,
        BusyWorkerInput,
        BusyWorkerInput,
      ];
    }
  | {
      readonly kind: "bolognium-ship";
      readonly missionBuildable: boolean;
      readonly scoutCount: number;
      readonly corvetteCount: number;
      readonly gatewaySupportMaximum: number;
      readonly observation: BusyWorkerInput;
    }
  | {
      readonly kind: "chthonian-raider";
      readonly starbaseOn: number;
      readonly observations: readonly [
        BusyWorkerInput,
        BusyWorkerInput,
        BusyWorkerInput,
        BusyWorkerInput,
      ];
    }
  | {
      readonly kind: "dual-resource";
      readonly observations: readonly [BusyWorkerInput, BusyWorkerInput];
    }
  | {
      readonly kind: "womling-farm";
      readonly supportMaximum: number;
      readonly cropPerFarm: number;
    }
  | {
      readonly kind: "womling-overseer";
      readonly loyaltyBase: number;
      readonly loyaltyPerBuilding: number;
      readonly miners: number;
    }
  | {
      readonly kind: "womling-fun";
      readonly moraleBase: number;
      readonly moralePerBuilding: number;
      readonly miners: number;
      readonly farmers: number;
      readonly injured: number;
    }
  | {
      readonly kind: "tau-whaling-station";
      readonly supportMaximum: number;
      readonly supportCurrent: number;
      readonly whalingShipsOn: number;
    }
  | { readonly kind: "tau-mining-pit"; readonly populationMaximum: number };

export interface PowerBuildingInput {
  readonly index: number;
  readonly id: string;
  readonly binding: string;
  readonly count: number;
  readonly stateOn: number;
  readonly powered: number;
  readonly autoMaximum: number;
  readonly tab: string;
  readonly smartCategory: boolean;
  readonly smartEnabled: boolean;
  readonly ship: boolean;
  /**
   * True when this building draws civilian ship crew (its game struct carries a
   * `crew` field). Only these are eligible for crew-reserve shedding.
   */
  readonly crewShip: boolean;
  /**
   * Ordering for crew-reserve shedding: the lowest rank is idled first. Ignored
   * unless `crewShip` is true.
   */
  readonly crewValueRank: number;
  readonly singleState: boolean;
  readonly ignorePositivePowerCap: boolean;
  readonly skipGroup: "none" | "lake" | "spire";
  readonly extraDescription: string;
  readonly consumptions: readonly PowerConsumptionInput[];
  readonly produces: readonly string[];
  readonly fleetMaximum: number | null;
  readonly rule: PowerBuildingRule;
}

export interface PowerSettingsInput {
  readonly showGalactic: boolean;
  readonly limitPowered: boolean;
  readonly autoFleet: boolean;
  /**
   * Civilians to keep out of ship crew and available for jobs. 0 disables the
   * crew-reserve balancing entirely (legacy behavior). See planPowerCycle.
   */
  readonly crewReserve: number;
}

export interface PowerSpireBuildingInput {
  readonly buildingId: string;
  readonly binding: string;
  readonly count: number;
  readonly stateOn: number;
  readonly autoMaximum: number;
  readonly autoBuildable: boolean;
  readonly smartManaged: boolean;
  readonly moneyCost: number;
  readonly supplyCost: number;
}

export interface PowerSpireInput {
  readonly enabled: boolean;
  readonly autoBuild: boolean;
  readonly autoMech: boolean;
  readonly mechActive: boolean;
  readonly autoPrestige: boolean;
  readonly prestigeType: string;
  readonly prestigeDemonicFloor: number;
  readonly towerCount: number;
  readonly moneyMaximum: number;
  readonly supplyCurrent: number;
  readonly mechQueued: boolean;
  readonly purifierQueued: boolean;
  readonly purifierDescription: string;
  readonly expectedSaveSupply: boolean;
  readonly mechBay: PowerSpireBuildingInput;
  readonly port: PowerSpireBuildingInput;
  readonly camp: PowerSpireBuildingInput;
  readonly purifier: PowerSpireBuildingInput;
}

export interface PowerLakeInput {
  readonly enabled: boolean;
  readonly bloodSpireLevel: number;
  readonly biremeId: string;
  readonly biremeBinding: string;
  readonly biremeCount: number;
  readonly biremeStateOn: number;
  readonly transportId: string;
  readonly transportBinding: string;
  readonly transportCount: number;
  readonly transportStateOn: number;
}

export interface PowerCycleInput {
  readonly powerUnlocked: boolean;
  readonly powerResourceId: string;
  readonly powerCurrent: number;
  readonly powerMaximum: number;
  readonly replicatorAvailable: boolean;
  readonly fasting: boolean;
  readonly hungryRace: boolean;
  readonly banquetStateOn: number;
  readonly debug: boolean;
  readonly consumptionBalanceMinimum: number;
  /** Civilian workforce shared between jobs and ship crew. */
  readonly civilianPopulation: number;
  /** Civilians currently assigned as ship crew (`civic.crew.workers`). */
  readonly currentCrew: number;
  readonly settings: PowerSettingsInput;
  readonly resources: readonly PowerResourceInput[];
  readonly buildings: readonly PowerBuildingInput[];
  readonly lake: PowerLakeInput;
  readonly spire: PowerSpireInput;
}

export interface PowerOscillationEntry {
  readonly previous?: number;
  readonly a?: number;
  readonly b?: number;
  readonly locked?: number;
  readonly holdTicks?: number;
}

export interface PowerWarningCap {
  readonly cap: number;
  readonly ticks: number;
}

export interface PowerAutomationState {
  readonly oscillations: Readonly<Record<string, PowerOscillationEntry>>;
  readonly warningCaps: Readonly<Record<string, PowerWarningCap>>;
}

export type PowerOperation =
  | {
      readonly kind: "set-resource-rate";
      readonly resourceId: string;
      readonly expected: number;
      readonly value: number;
    }
  | {
      readonly kind: "set-income-adjusted";
      readonly resourceId: string;
      readonly expected: boolean;
      readonly value: boolean;
    }
  | {
      readonly kind: "set-description";
      readonly buildingId: string;
      readonly expected: string;
      readonly value: string;
    }
  | {
      readonly kind: "adjust-building";
      readonly buildingId: string;
      readonly binding: string;
      readonly expectedStateOn: number;
      readonly amount: number;
    }
  | {
      readonly kind: "set-mech-save-supply";
      readonly expected: boolean;
      readonly value: boolean;
    }
  | {
      readonly kind: "set-power-model";
      readonly resourceId: string;
      readonly expectedCurrent: number;
      readonly expectedRate: number;
      readonly value: number;
    }
  | { readonly kind: "log"; readonly message: string };

export interface ApplyPowerCycleDecision {
  readonly kind: "apply-power-cycle";
  readonly expectedBuildings: readonly {
    readonly id: string;
    readonly binding: string;
  }[];
  readonly operations: readonly PowerOperation[];
}

export interface PowerWarnBuildingInput {
  readonly domId: string;
  readonly buildingId: string;
  readonly binding: string;
  readonly stateOn: number;
  readonly autoStateEnabled: boolean;
  readonly ship: boolean;
  readonly warningKind:
    | "ordinary"
    | "belt-elerium"
    | "belt-iridium"
    | "belt-iron"
    | "lake-bireme"
    | "lake-transport"
    | "tau-whaling"
    | "tau-mining";
  readonly beltSupportNeeded: number;
  readonly beltSupportMaximum: number;
  readonly lakeSupportNeeded: number;
  readonly lakeSupportMaximum: number;
}

export interface PowerWarnShutdownDecision {
  readonly kind: "shutdown-warned-building";
  readonly domId: string;
  readonly buildingId: string;
  readonly binding: string;
  readonly expectedStateOn: number;
}

export type PowerDecision = ApplyPowerCycleDecision | PowerWarnShutdownDecision;

interface MutableResource {
  readonly input: PowerResourceInput;
  rate: number;
  incomeAdjusted: boolean;
}

interface MutableOscillationEntry {
  previous?: number;
  a?: number;
  b?: number;
  locked?: number;
  holdTicks?: number;
}

function mapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new TypeError(`missing ${label}`);
  }
  return value;
}

function calculateBusyWorkers(
  observation: Readonly<BusyWorkerInput>,
  currentWorkers: number,
  incomeAdjusted: boolean,
): number {
  if (incomeAdjusted) {
    return currentWorkers;
  }
  if (currentWorkers > 0) {
    const perWorker = observation.production / currentWorkers;
    const usedIncome = observation.production - observation.income;
    return usedIncome > 0 ? Math.ceil(usedIncome / perWorker) : 0;
  }
  return observation.income < 0 ? 1 : 0;
}

function applyBusyCap(
  maximum: number,
  current: number,
  observation: Readonly<BusyWorkerInput>,
  resources: ReadonlyMap<string, MutableResource>,
): { readonly maximum: number; readonly adjusted: readonly string[] } {
  if (observation.useful) {
    return { maximum, adjusted: [] };
  }
  const resource = mapValue(
    resources,
    observation.resourceId,
    `power resource ${observation.resourceId}`,
  );
  const next = Math.min(
    maximum,
    calculateBusyWorkers(observation, current, resource.incomeAdjusted),
  );
  return {
    maximum: next,
    adjusted: next === current ? [] : [observation.resourceId],
  };
}

/**
 * Exotic Zoos are only kept powered while Food income comfortably exceeds
 * their upkeep: each on-zoo requires this many multiples of its own Food
 * consumption in available income before another is allowed on.
 */
const EXOTIC_ZOO_FOOD_MARGIN = 2;

function applySmartRule(
  building: Readonly<PowerBuildingInput>,
  maximum: number,
  current: number,
  savingPower: boolean,
  availablePower: number,
  resources: ReadonlyMap<string, MutableResource>,
): { readonly maximum: number; readonly adjusted: readonly string[] } {
  const rule = building.rule;
  if (savingPower) {
    switch (rule.kind) {
      case "belt-space-station": {
        const extra =
          rule.stationStorage > 0
            ? Math.floor(
                (rule.eleriumMaximum - rule.eleriumMaximumCost) /
                  rule.stationStorage,
              )
            : 0;
        const minersNeeded =
          rule.eleriumShipsOn * 2 + rule.iridiumShipsOn + rule.ironShipsOn;
        maximum = Math.min(
          maximum,
          Math.max(current - extra, Math.ceil(minersNeeded / 3)),
        );
        break;
      }
      case "job-dependent":
        if (rule.jobCount === 0) {
          maximum = 0;
        }
        break;
      case "lake-cooling-tower":
        if (
          rule.harborCount > 0 &&
          // The caller supplies the current available-power cap as maximum.
          maximum > 0
        ) {
          const needed =
            building.powered * maximum +
            Number(
              (
                500 *
                0.92 ** maximum *
                (rule.electromagneticField ? 1.5 : 1)
              ).toFixed(2),
            ) *
              Math.min(2, rule.harborCount);
          if (availablePower < needed) {
            maximum = 0;
          }
        }
        break;
      case "lake-harbor":
        if (maximum === 1 && building.count > 1) {
          maximum = 0;
        }
        break;
      case "busy-resource":
        if (rule.active && rule.savingOnly) {
          return applyBusyCap(maximum, current, rule.observation, resources);
        }
        break;
      default:
        break;
    }
  }

  switch (rule.kind) {
    case "busy-resource":
      if (rule.active && !rule.savingOnly) {
        return applyBusyCap(maximum, current, rule.observation, resources);
      }
      break;
    case "triton-lander":
      if (rule.fobOn < 1) {
        maximum = 0;
      } else {
        const dispatch =
          rule.currentSoldiers -
          rule.authorityReserve -
          Math.max(0, rule.wounded - Math.floor(rule.healingRate));
        maximum = Math.min(
          maximum,
          Math.floor(dispatch / (3 * rule.highPopulationMultiplier)),
        );
      }
      break;
    case "ascension-trigger":
      if (
        building.powered > 0 &&
        (!rule.pillarFinished || rule.prestigeType !== "ascension")
      ) {
        maximum = 0;
      }
      break;
    case "terraformer":
      if (rule.prestigeType !== "terraform") {
        maximum = 0;
      }
      break;
    case "badlands-attractor": {
      let best = 0;
      if (rule.threat < rule.topThreat && rule.hellAssigned > 0) {
        best =
          rule.threat > rule.bottomThreat && rule.topThreat > rule.bottomThreat
            ? Math.floor(
                (maximum * (rule.topThreat - rule.threat)) /
                  (rule.topThreat - rule.bottomThreat),
              )
            : maximum;
      }
      maximum = Math.min(maximum, current + 1, Math.max(current - 1, best));
      break;
    }
    case "tourist-center":
      if (
        !rule.hungryRace &&
        rule.foodStorageRatio < 0.7 &&
        !rule.moneyUseful
      ) {
        return applyBusyCap(maximum, current, rule.observation, resources);
      }
      break;
    case "mill":
      if (
        building.powered !== 0 &&
        rule.foodStorageRatio < 0.7 &&
        rule.foodWorkers > 0
      ) {
        maximum = Math.min(
          maximum,
          current - (rule.sampledPower - 5) / -building.powered,
        );
      }
      break;
    case "exotic-zoo": {
      // `resources.Food.rate` here is income with all consumers backed out and
      // higher-priority consumers already re-applied, so it is the Food income
      // available to the zoos. Keep on only as many as that income covers with
      // the configured margin over their per-zoo upkeep.
      const food = resources.get("Food");
      const perZoo =
        building.consumptions.find((entry) => entry.resourceId === "Food")
          ?.rate ?? 0;
      if (food !== undefined && perZoo > 0) {
        maximum = Math.min(
          maximum,
          Math.floor(food.rate / (perZoo * EXOTIC_ZOO_FOOD_MARGIN)),
        );
      }
      break;
    }
    case "chthonian-mine-layer":
      if (
        (rule.raiderOn === 0 && rule.excavatorOn === 0) ||
        rule.starbaseOn === 0
      ) {
        maximum = 0;
      } else {
        maximum = Math.min(
          maximum,
          current + Math.ceil((rule.piracy - rule.armada) / rule.rating),
        );
      }
      break;
    case "ruins-guard-post":
      if (!rule.suppressionUseful) {
        maximum = 0;
      } else {
        let adjustment = (5001 - rule.ruinsRating) / rule.postRating;
        if (rule.gateUnlocked) {
          adjustment = Math.max(
            adjustment,
            (7501 - rule.gateRating) / rule.postRating,
          );
        }
        maximum = Math.min(
          maximum,
          current + 1,
          current + Math.ceil(adjustment),
        );
      }
      break;
    case "spire-waygate":
      if (
        rule.cleared ||
        rule.demonicBombReady ||
        (rule.mechPotentialTooHigh && !rule.prestigeFloorProtected)
      ) {
        maximum = 0;
      }
      break;
    case "early-galaxy-ship":
      if (!rule.piracyUnlocked && rule.embassyUnlocked) {
        maximum = 0;
      }
      break;
    case "armed-miner":
      if (rule.observations.every((entry) => !entry.useful)) {
        let cap = 0;
        for (const observation of rule.observations) {
          const resource = mapValue(
            resources,
            observation.resourceId,
            `power resource ${observation.resourceId}`,
          );
          cap = Math.max(
            cap,
            calculateBusyWorkers(observation, current, resource.incomeAdjusted),
          );
        }
        maximum = Math.min(maximum, cap);
      }
      return {
        maximum,
        adjusted:
          maximum === current
            ? []
            : rule.observations.map((entry) => entry.resourceId),
      };
    case "bolognium-ship":
      if (
        rule.missionBuildable &&
        rule.scoutCount >= 2 &&
        rule.corvetteCount >= 1
      ) {
        maximum = Math.min(
          maximum,
          rule.gatewaySupportMaximum - (rule.scoutCount + rule.corvetteCount),
        );
      }
      if (!rule.observation.useful) {
        maximum = applyBusyCap(
          maximum,
          current,
          rule.observation,
          resources,
        ).maximum;
      }
      return {
        maximum,
        adjusted: maximum === current ? [] : [rule.observation.resourceId],
      };
    case "chthonian-raider":
      if (rule.starbaseOn === 0) {
        maximum = 0;
      } else if (rule.observations.every((entry) => !entry.useful)) {
        let cap = 0;
        for (const observation of rule.observations) {
          const resource = mapValue(
            resources,
            observation.resourceId,
            `power resource ${observation.resourceId}`,
          );
          cap = Math.max(
            cap,
            calculateBusyWorkers(observation, current, resource.incomeAdjusted),
          );
        }
        maximum = Math.min(maximum, cap);
      }
      return {
        maximum,
        adjusted:
          maximum === current
            ? []
            : rule.observations.map((entry) => entry.resourceId),
      };
    case "dual-resource":
      if (rule.observations.every((entry) => !entry.useful)) {
        let cap = 0;
        for (const observation of rule.observations) {
          const resource = mapValue(
            resources,
            observation.resourceId,
            `power resource ${observation.resourceId}`,
          );
          cap = Math.max(
            cap,
            calculateBusyWorkers(observation, current, resource.incomeAdjusted),
          );
        }
        maximum = Math.min(maximum, cap);
      }
      return {
        maximum,
        adjusted:
          maximum === current
            ? []
            : rule.observations.map((entry) => entry.resourceId),
      };
    case "womling-farm":
      maximum = Math.min(
        maximum,
        Math.ceil(rule.supportMaximum / rule.cropPerFarm),
      );
      break;
    case "womling-overseer":
      maximum = Math.min(
        maximum,
        Math.ceil(
          (100 - (rule.loyaltyBase - rule.miners)) / rule.loyaltyPerBuilding,
        ),
      );
      break;
    case "womling-fun":
      maximum = Math.min(
        maximum,
        Math.ceil(
          (100 -
            (rule.moraleBase - (rule.miners + rule.farmers + rule.injured))) /
            rule.moralePerBuilding,
        ),
      );
      break;
    case "tau-whaling-station": {
      const efficiency =
        1 - (1 - rule.supportMaximum / rule.supportCurrent) ** 1.4;
      const income = 8 * efficiency * rule.whalingShipsOn;
      maximum = Math.min(maximum, Math.ceil(income / 12));
      break;
    }
    case "tau-mining-pit":
      maximum = Math.min(maximum, Math.ceil(rule.populationMaximum / 6));
      break;
    default:
      break;
  }
  return { maximum, adjusted: [] };
}

export function getCitadelPowerConsumption(
  amount: number,
  electromagneticField: boolean,
): number {
  return (30 + (amount - 1) * 2.5) * amount * (electromagneticField ? 1.5 : 1);
}

export function getBestPowerSupplyRatio(
  support: number,
  maximumPorts: number,
  maximumCamps: number,
): readonly [number, number, number] {
  let bestPort = 0;
  let bestCamp = 0;
  const optimalPort = Math.ceil(support / 2 + 1);
  const optimalCamp = Math.floor(support / 2 - 1);
  if (support <= 3 || optimalPort > maximumPorts) {
    bestPort = Math.min(maximumPorts, support);
    bestCamp = Math.min(maximumCamps, support - bestPort);
  } else if (optimalCamp > maximumCamps) {
    bestCamp = Math.min(maximumCamps, support);
    bestPort = Math.min(maximumPorts, support - bestCamp);
  } else if (optimalPort <= maximumPorts && optimalCamp <= maximumCamps) {
    bestPort = optimalPort;
    bestCamp = optimalCamp;
  }
  return Object.freeze([
    Math.round(bestPort * (1 + bestCamp * 0.4) * 10000 + 100),
    bestPort,
    bestCamp,
  ]);
}

function debouncePower(
  desired: number,
  current: number,
  entry: MutableOscillationEntry,
): number {
  if (entry.locked !== undefined) {
    if (desired === entry.a || desired === entry.b) {
      return entry.locked;
    }
    delete entry.locked;
  }
  if (entry.holdTicks) {
    if (desired === entry.a || desired === entry.b) {
      entry.holdTicks--;
      if (entry.holdTicks > 0) {
        return current;
      }
      entry.previous = current;
      return desired;
    }
    entry.holdTicks = 0;
  }
  if (desired === current) {
    return desired;
  }
  if (entry.previous === desired) {
    entry.a = current;
    entry.b = desired;
    if (Math.abs(desired - current) === 1) {
      entry.locked = Math.max(current, desired);
      return entry.locked;
    }
    entry.holdTicks = POWER_WIDE_OSCILLATION_HOLD_TICKS;
    return current;
  }
  entry.previous = current;
  return desired;
}

function freezeState(
  oscillations: Readonly<Record<string, MutableOscillationEntry>>,
  warningCaps: Readonly<Record<string, PowerWarningCap>>,
): PowerAutomationState {
  return Object.freeze({
    oscillations: Object.freeze(
      Object.fromEntries(
        Object.entries(oscillations).map(([key, value]) => [
          key,
          Object.freeze({ ...value }),
        ]),
      ),
    ),
    warningCaps: Object.freeze(
      Object.fromEntries(
        Object.entries(warningCaps).map(([key, value]) => [
          key,
          Object.freeze({ ...value }),
        ]),
      ),
    ),
  });
}

function appendRateOperation(
  operations: PowerOperation[],
  resource: MutableResource,
  value: number,
): void {
  operations.push({
    kind: "set-resource-rate",
    resourceId: resource.input.id,
    expected: resource.rate,
    value,
  });
  resource.rate = value;
}

function appendIncomeAdjusted(
  operations: PowerOperation[],
  resource: MutableResource,
): void {
  operations.push({
    kind: "set-income-adjusted",
    resourceId: resource.input.id,
    expected: resource.incomeAdjusted,
    value: true,
  });
  resource.incomeAdjusted = true;
}

export interface PowerCyclePlan {
  readonly decision: ApplyPowerCycleDecision | null;
  readonly nextState: PowerAutomationState;
}

export function planPowerCycle(
  input: Readonly<PowerCycleInput>,
  state: Readonly<PowerAutomationState>,
): PowerCyclePlan {
  if (!input.powerUnlocked || input.buildings.length === 0) {
    return Object.freeze({ decision: null, nextState: state });
  }

  const operations: PowerOperation[] = [];
  const resources = new Map<string, MutableResource>();
  for (const resource of input.resources) {
    if (resources.has(resource.id)) {
      throw new TypeError(`duplicate power resource ${resource.id}`);
    }
    resources.set(resource.id, {
      input: resource,
      rate: resource.rateOfChange,
      incomeAdjusted: resource.incomeAdjusted,
    });
  }
  const buildingIds = new Set(input.buildings.map((building) => building.id));
  if (buildingIds.size !== input.buildings.length) {
    throw new TypeError("duplicate power building id");
  }
  const oscillations: Record<string, MutableOscillationEntry> =
    Object.fromEntries(
      Object.entries(state.oscillations).map(([key, value]) => [
        key,
        { ...value },
      ]),
    );
  const warningCaps: Record<string, PowerWarningCap> = Object.fromEntries(
    Object.entries(state.warningCaps).map(([key, value]) => [
      key,
      { ...value },
    ]),
  );

  let availablePower = input.powerCurrent;
  const missingProducer: Record<string, number> = {};
  for (const building of input.buildings) {
    availablePower += building.powered * building.stateOn;
    for (const consumption of building.consumptions) {
      const resource = mapValue(
        resources,
        consumption.resourceId,
        `power resource ${consumption.resourceId}`,
      );
      const value =
        building.rule.kind === "belt-space-station" &&
        resource.input.supportKind === "support" &&
        resource.input.id === "Belt_Support"
          ? resource.rate - resource.input.maxQuantity
          : resource.rate + consumption.fuelRate * building.stateOn;
      appendRateOperation(operations, resource, value);
      if (resource.input.supportKind !== "none" && consumption.rate < 0) {
        missingProducer[resource.input.id] =
          (missingProducer[resource.input.id] ?? 0) + 1;
      }
    }
  }

  let reservedPower = 0;
  const producerReserve = new Map<string, number>();
  for (const building of input.buildings) {
    if (building.produces.length === 0 || building.powered <= 0) {
      continue;
    }
    const consumed = building.produces.some((resourceId) =>
      input.buildings.some((candidate) =>
        candidate.consumptions.some(
          (consumption) =>
            consumption.resourceId === resourceId && consumption.rate > 0,
        ),
      ),
    );
    if (!consumed) {
      continue;
    }
    const cap = input.settings.limitPowered
      ? Math.min(building.count, building.autoMaximum)
      : building.count;
    const growth = building.produces.some(
      (resourceId) =>
        mapValue(resources, resourceId, `producer resource ${resourceId}`).input
          .useful,
    )
      ? 1
      : 0;
    const reserve = building.powered * Math.min(cap, building.stateOn + growth);
    producerReserve.set(building.binding, reserve);
    reservedPower += reserve;
  }

  // Crew reserve: ship crew is drawn from the same civilian pool as jobs, so when
  // it exceeds the labor budget we idle the lowest-value crewed ship one step this
  // tick. Gradual shedding converges over ticks without oscillating against power's
  // own on/off decisions (debouncePower absorbs the rest); currentCrew lags the
  // on-counts by design, so re-checking each tick self-terminates at the budget.
  let crewShedBinding: string | null = null;
  if (input.settings.crewReserve > 0) {
    const crewBudget = input.civilianPopulation - input.settings.crewReserve;
    if (input.currentCrew > crewBudget) {
      let target: Readonly<PowerBuildingInput> | null = null;
      for (const building of input.buildings) {
        if (!building.crewShip || building.stateOn <= 0) {
          continue;
        }
        if (target === null || building.crewValueRank < target.crewValueRank) {
          target = building;
        }
      }
      if (target !== null) {
        crewShedBinding = target.binding;
      }
    }
  }

  for (const building of input.buildings) {
    let maximum = building.count;
    const current = building.stateOn;
    if (!input.settings.showGalactic && building.tab === "galaxy") {
      maximum = 0;
    }
    if (input.settings.limitPowered) {
      maximum = Math.min(maximum, building.autoMaximum);
    }
    if (building.singleState) {
      maximum = Math.min(maximum, 1);
    }
    reservedPower -= producerReserve.get(building.binding) ?? 0;
    if (building.rule.kind === "neutron-citadel") {
      while (
        maximum > 0 &&
        availablePower - reservedPower <
          getCitadelPowerConsumption(
            maximum,
            building.rule.electromagneticField,
          )
      ) {
        maximum--;
      }
    } else if (building.powered > 0 && !building.ignorePositivePowerCap) {
      maximum = Math.min(
        maximum,
        (availablePower - reservedPower) / building.powered,
      );
    }

    if (
      (building.rule.kind === "ascension-trigger" ||
        building.rule.kind === "terraformer") &&
      availablePower < building.powered
    ) {
      operations.push({
        kind: "set-description",
        buildingId: building.id,
        expected: building.extraDescription,
        value: `Missing ${Math.ceil(
          building.powered - availablePower,
        )} MW to power on<br>${building.extraDescription}`,
      });
    }

    if (building.skipGroup !== "none") {
      continue;
    }

    if (building.smartCategory && building.smartEnabled) {
      const result = applySmartRule(
        building,
        maximum,
        current,
        input.powerCurrent <= input.powerMaximum || input.replicatorAvailable,
        availablePower,
        resources,
      );
      maximum = result.maximum;
      for (const resourceId of result.adjusted) {
        appendIncomeAdjusted(
          operations,
          mapValue(resources, resourceId, `power resource ${resourceId}`),
        );
      }
      if (input.settings.autoFleet && building.fleetMaximum !== null) {
        maximum = Math.min(maximum, building.fleetMaximum);
      }
    }

    let description =
      operations
        .filter(
          (
            operation,
          ): operation is Extract<
            PowerOperation,
            { readonly kind: "set-description" }
          > =>
            operation.kind === "set-description" &&
            operation.buildingId === building.id,
        )
        .at(-1)?.value ?? building.extraDescription;
    for (const consumption of building.consumptions) {
      const resource = mapValue(
        resources,
        consumption.resourceId,
        `power resource ${consumption.resourceId}`,
      );
      if (consumption.rate > 0) {
        if (!resource.input.unlocked) {
          maximum = 0;
          break;
        }
        if (resource.input.id === "Food") {
          if (input.fasting) {
            maximum = 0;
            break;
          }
          if (input.banquetStateOn > 0) {
            continue;
          }
          if (resource.input.storageRatio > 0.05 || input.hungryRace) {
            continue;
          }
        } else if (
          current > 0 &&
          resource.input.supportKind === "none" &&
          (building.powered < 0 || resource.input.storageRatio >= 0.95) &&
          resource.input.currentQuantity >=
            maximum * input.consumptionBalanceMinimum * consumption.rate
        ) {
          continue;
        } else if (resource.input.supportKind === "tau-belt-support") {
          continue;
        }
        let supported = resource.rate / consumption.rate;
        if (resource.input.supportKind === "womlings-support") {
          supported = Math.ceil(supported);
        }
        maximum = Math.min(maximum, supported);
        if (missingProducer[resource.input.id]) {
          const value = `Make sure all ${resource.input.title} producers are above consumers in buildings list!<br>${description}`;
          operations.push({
            kind: "set-description",
            buildingId: building.id,
            expected: description,
            value,
          });
          description = value;
        }
      } else if (missingProducer[resource.input.id] && consumption.rate < 0) {
        missingProducer[resource.input.id]!--;
      }
    }

    if (building.powered < 0) {
      maximum = Math.max(maximum, current - 1);
    }
    if (building.binding === crewShedBinding) {
      maximum = Math.min(maximum, current - 1);
    }
    maximum = Math.max(0, Math.floor(maximum));
    const oscillation =
      oscillations[building.binding] ?? (oscillations[building.binding] = {});
    maximum = debouncePower(maximum, current, oscillation);
    const warningCap = warningCaps[building.binding];
    if (warningCap !== undefined) {
      const ticks = warningCap.ticks - 1;
      if (ticks <= 0) {
        delete warningCaps[building.binding];
      } else {
        warningCaps[building.binding] = { cap: warningCap.cap, ticks };
        maximum = Math.min(maximum, warningCap.cap);
      }
    }

    if (input.debug && maximum !== current) {
      const consumption = building.consumptions
        .filter((entry) => entry.fuelRate > 0)
        .map((entry) => {
          const resource = mapValue(
            resources,
            entry.resourceId,
            `power resource ${entry.resourceId}`,
          );
          return `${entry.resourceId}: income=${resource.rate.toFixed(
            2,
          )}, qty=${resource.input.currentQuantity.toFixed(
            0,
          )}, perUnit=${entry.fuelRate.toFixed(2)}, reserveTo=${(
            maximum *
            input.consumptionBalanceMinimum *
            entry.rate
          ).toFixed(0)}`;
        })
        .join(" | ");
      const delta = maximum - current;
      operations.push({
        kind: "log",
        message: `[power] ${building.binding}: on ${current}→${maximum} (Δ${
          delta >= 0 ? "+" : ""
        }${delta}), powered=${building.powered}, availPower≈${availablePower.toFixed(
          1,
        )}${
          reservedPower > 0 ? `, reserved≈${reservedPower.toFixed(1)}` : ""
        }${consumption ? " || " + consumption : ""}`,
      });
    }

    for (const consumption of building.consumptions) {
      const resource = mapValue(
        resources,
        consumption.resourceId,
        `power resource ${consumption.resourceId}`,
      );
      const value =
        building.rule.kind === "belt-space-station" &&
        resource.input.id === "Belt_Support"
          ? resource.rate + resource.input.maxQuantity
          : resource.rate - consumption.fuelRate * maximum;
      appendRateOperation(operations, resource, value);
    }
    operations.push({
      kind: "adjust-building",
      buildingId: building.id,
      binding: building.binding,
      expectedStateOn: current,
      amount: maximum - current,
    });
    availablePower -=
      building.rule.kind === "neutron-citadel"
        ? getCitadelPowerConsumption(
            maximum,
            building.rule.electromagneticField,
          )
        : building.powered * maximum;
  }

  const lakeSupport = resources.get("Lake_Support")?.rate ?? 0;
  if (input.lake.enabled && lakeSupport > 0) {
    const rating = input.lake.bloodSpireLevel >= 2 ? 0.8 : 0.85;
    let bireme = input.lake.biremeCount;
    let transport = input.lake.transportCount;
    while (bireme + transport > lakeSupport) {
      const nextBireme = (1 - rating ** (bireme - 1)) * (transport * 5);
      const nextTransport = (1 - rating ** bireme) * ((transport - 1) * 5);
      if (nextBireme > nextTransport) {
        bireme--;
      } else {
        transport--;
      }
    }
    // Legacy called tryAdjustState directly on buildings.LakeBireme/LakeTransport,
    // so these may not appear in managedStatePriorityList (e.g. count 0 while still
    // smart-managed). Source id/binding from the lake input rather than buildingById.
    operations.push(
      {
        kind: "adjust-building",
        buildingId: input.lake.biremeId,
        binding: input.lake.biremeBinding,
        expectedStateOn: input.lake.biremeStateOn,
        amount: bireme - input.lake.biremeStateOn,
      },
      {
        kind: "adjust-building",
        buildingId: input.lake.transportId,
        binding: input.lake.transportBinding,
        expectedStateOn: input.lake.transportStateOn,
        amount: transport - input.lake.transportStateOn,
      },
    );
  }

  const spireSupport = Math.floor(resources.get("Spire_Support")?.rate ?? 0);
  if (input.spire.enabled && spireSupport > 0) {
    const spire = input.spire;
    const buildAllowed =
      spire.autoBuild &&
      !(spire.autoMech && spire.mechActive) &&
      !(
        spire.autoPrestige &&
        spire.prestigeType === "demonic" &&
        spire.prestigeDemonicFloor - spire.towerCount <= spire.mechBay.count
      );
    const canBuild = (
      building: Readonly<PowerSpireBuildingInput>,
      checkSmart = false,
    ) =>
      buildAllowed &&
      building.autoBuildable &&
      spire.moneyMaximum >= building.moneyCost &&
      (!checkSmart || building.smartManaged);
    const maximumBay = Math.min(spire.mechBay.count, spireSupport);
    const currentPort = spire.port.count;
    const currentCamp = spire.camp.count;
    const maximumPorts = canBuild(spire.port)
      ? spire.port.autoMaximum
      : currentPort;
    const maximumCamps = canBuild(spire.camp)
      ? spire.camp.autoMaximum
      : currentCamp;
    const nextMechCost = canBuild(spire.mechBay, true)
      ? spire.mechBay.supplyCost
      : Number.MAX_SAFE_INTEGER;
    const nextPurifierCost = canBuild(spire.purifier, true)
      ? spire.purifier.supplyCost
      : Number.MAX_SAFE_INTEGER;
    const [bestSupplies] = getBestPowerSupplyRatio(
      spireSupport,
      maximumPorts,
      maximumCamps,
    );
    const purifierDescription =
      operations
        .filter(
          (
            operation,
          ): operation is Extract<
            PowerOperation,
            { readonly kind: "set-description" }
          > =>
            operation.kind === "set-description" &&
            operation.buildingId === spire.purifier.buildingId,
        )
        .at(-1)?.value ?? spire.purifierDescription;
    operations.push({
      kind: "set-description",
      buildingId: spire.purifier.buildingId,
      expected: purifierDescription,
      value: `Supported Supplies: ${Math.floor(bestSupplies)}<br>${
        purifierDescription
      }`,
    });
    const nextCost =
      spire.mechQueued && nextMechCost <= bestSupplies
        ? nextMechCost
        : spire.purifierQueued && nextPurifierCost <= bestSupplies
          ? nextPurifierCost
          : Math.min(nextMechCost, nextPurifierCost);
    operations.push({
      kind: "set-mech-save-supply",
      expected: spire.expectedSaveSupply,
      value: nextCost <= bestSupplies,
    });
    let assignStorage = spire.mechQueued || spire.purifierQueued;
    const addSpireAdjustments = (mech: number, port: number, camp: number) => {
      for (const [building, target] of [
        [spire.mechBay, mech],
        [spire.port, port],
        [spire.camp, camp],
      ] as const) {
        // Spire mech/port/camp are adjusted directly and may be absent from the
        // managed building list, so use the binding carried on the input rather
        // than resolving through buildingById.
        operations.push({
          kind: "adjust-building",
          buildingId: building.buildingId,
          binding: building.binding,
          expectedStateOn: building.stateOn,
          amount: target - building.stateOn,
        });
      }
    };
    for (let targetMech = maximumBay; targetMech >= 0; targetMech--) {
      const [targetSupplies, targetPort, targetCamp] = getBestPowerSupplyRatio(
        spireSupport - targetMech,
        maximumPorts,
        maximumCamps,
      );
      const missingStorage =
        targetPort > currentPort
          ? spire.port
          : targetCamp > currentCamp
            ? spire.camp
            : null;
      if (missingStorage !== null) {
        for (let index = maximumBay; index >= 0; index--) {
          const [storageSupplies, storagePort, storageCamp] =
            getBestPowerSupplyRatio(
              spireSupport - index,
              currentPort,
              currentCamp,
            );
          if (storageSupplies >= missingStorage.supplyCost) {
            addSpireAdjustments(index, storagePort, storageCamp);
            break;
          }
        }
        break;
      }
      if (spire.supplyCurrent >= targetSupplies) {
        assignStorage = true;
      }
      if (
        !assignStorage ||
        bestSupplies < nextCost ||
        targetSupplies >= nextCost
      ) {
        addSpireAdjustments(targetMech, targetPort, targetCamp);
        break;
      }
    }
  }

  operations.push({
    kind: "set-power-model",
    resourceId: input.powerResourceId,
    expectedCurrent: input.powerCurrent,
    expectedRate: mapValue(resources, input.powerResourceId, "power resource")
      .rate,
    value: availablePower,
  });

  return Object.freeze({
    decision: Object.freeze({
      kind: "apply-power-cycle",
      expectedBuildings: Object.freeze(
        input.buildings.map((building) =>
          Object.freeze({ id: building.id, binding: building.binding }),
        ),
      ),
      operations: Object.freeze(operations),
    }),
    nextState: freezeState(oscillations, warningCaps),
  });
}

export function planPowerWarningShutdown(
  warnings: readonly Readonly<PowerWarnBuildingInput>[],
): PowerWarnShutdownDecision | null {
  for (const warning of warnings) {
    if (!warning.autoStateEnabled || warning.ship) {
      continue;
    }
    if (
      (warning.warningKind === "belt-elerium" ||
        warning.warningKind === "belt-iridium" ||
        warning.warningKind === "belt-iron") &&
      warning.beltSupportNeeded <= warning.beltSupportMaximum
    ) {
      continue;
    }
    if (
      (warning.warningKind === "lake-bireme" ||
        warning.warningKind === "lake-transport") &&
      warning.lakeSupportNeeded <= warning.lakeSupportMaximum
    ) {
      continue;
    }
    if (
      warning.warningKind === "tau-whaling" ||
      warning.warningKind === "tau-mining"
    ) {
      continue;
    }
    return Object.freeze({
      kind: "shutdown-warned-building",
      domId: warning.domId,
      buildingId: warning.buildingId,
      binding: warning.binding,
      expectedStateOn: warning.stateOn,
    });
  }
  return null;
}

export function recordPowerWarningCap(
  state: Readonly<PowerAutomationState>,
  binding: string,
  cap: number,
): PowerAutomationState {
  const oscillations = { ...state.oscillations };
  delete oscillations[binding];
  return freezeState(oscillations, {
    ...state.warningCaps,
    [binding]: {
      cap,
      ticks: POWER_WIDE_OSCILLATION_HOLD_TICKS,
    },
  });
}

export const EMPTY_POWER_AUTOMATION_STATE: PowerAutomationState = Object.freeze(
  {
    oscillations: Object.freeze({}),
    warningCaps: Object.freeze({}),
  },
);
