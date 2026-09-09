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
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export const SMELTER_CONTROL = "iSmelter";

export interface CapturedSmelterDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => CapturedDemandSample;
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
}

const FUEL_IDS = Object.freeze([
  "Oil",
  "Coal",
  "Wood",
  "Inferno",
  "Super",
] as const);
type FuelId = (typeof FUEL_IDS)[number];

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

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

function timeTo(resource: ResourceView, target: number): number {
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
  const priorityValue = settings[`smelter_fuel_p_${id.toLowerCase()}`];
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
  const demand = dependencies.readDemand?.() ?? {
    requestedQuantity: () => 0,
    isDemanded: () => false,
    storageRequired: () => 1,
  };
  if (
    !isRecord(smelter) ||
    !isRecord(resources) ||
    !isRecord(race) ||
    !isRecord(tech) ||
    Boolean(race["steelen"]) ||
    dependencies.controls.resolve(SMELTER_CONTROL) === undefined
  ) {
    return Object.freeze({ root, input: emptyInput() });
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
    return Object.freeze({ root, input: emptyInput() });
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
    return Object.freeze({ root, input: emptyInput() });
  }
  const fuels = FUEL_IDS.map((id) =>
    readFuel(id, resources, race, tech, settings, demand),
  );
  if (fuels.some((fuel) => fuel === undefined)) {
    return Object.freeze({ root, input: emptyInput() });
  }
  const orderedFuels = [...fuels]
    .filter((fuel): fuel is SmelterFuelView => fuel !== undefined)
    .sort(
      (left, right) =>
        (finite(settings[`smelter_fuel_p_${left.id.toLowerCase()}`]) ??
          FUEL_IDS.indexOf(left.id as FuelId)) -
        (finite(settings[`smelter_fuel_p_${right.id.toLowerCase()}`]) ??
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
    return Object.freeze({ root, input: emptyInput() });
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
  return Object.freeze({ root, input });
}

function currentValue(root: unknown, id: string): number | undefined {
  const smelter = readProperty(readProperty(root, "city"), "smelter");
  return isRecord(smelter) ? readCount(smelter[id]) : undefined;
}

function methodFor(kind: "fuel" | "metal", delta: number): string {
  if (kind === "fuel") return delta > 0 ? "addFuel" : "subFuel";
  return delta > 0 ? "addMetal" : "subMetal";
}

export function createCapturedSmelterAutomation(
  dependencies: CapturedSmelterDependencies,
): { readonly run: () => CommandExecutionOutcome } {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readInput(dependencies);
      const decision = planSmelter(session.input);
      if (!session.input.initialised) return SUCCEEDED;
      const adjustments = [
        ...decision.fuelAdjustments.map((adjustment) => ({
          kind: "fuel" as const,
          id: adjustment.fuelId,
          expected: adjustment.expectedCurrentFuelCount,
          delta: adjustment.delta,
        })),
        ...decision.smeltAdjustments.map((adjustment) => ({
          kind: "metal" as const,
          id: adjustment.productionId,
          expected: adjustment.expectedCurrentCount,
          delta: adjustment.delta,
        })),
      ].filter((adjustment) => adjustment.delta !== 0);
      if (adjustments.length === 0) return SUCCEEDED;
      const handle = dependencies.controls.resolve(SMELTER_CONTROL);
      if (
        handle === undefined ||
        adjustments.some(
          (adjustment) =>
            !handle.methods.includes(
              methodFor(adjustment.kind, adjustment.delta),
            ),
        )
      ) {
        return rejected(
          "captured-smelter-control-missing",
          "captured iSmelter control lacks the required allocation method",
        );
      }
      for (const adjustment of adjustments) {
        if (currentValue(session.root, adjustment.id) !== adjustment.expected) {
          return stale(
            "captured-smelter-allocation-changed",
            `${adjustment.id}: sampled allocation changed`,
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
                return stale(
                  "captured-smelter-root-changed",
                  "captured game root changed",
                );
              }
              const result = dependencies.controls.invoke(handle, method, [
                adjustment.id,
              ]);
              if (!result.ok) {
                return rejected(
                  "captured-smelter-control-failed",
                  result.detail ?? result.reason,
                );
              }
            }
          }
        }
      }
      for (const adjustment of adjustments) {
        if (
          currentValue(session.root, adjustment.id) !==
          adjustment.expected + adjustment.delta
        ) {
          return stale(
            "captured-smelter-allocation-unchanged",
            `${adjustment.id}: expected ${adjustment.expected + adjustment.delta}, actual ${currentValue(session.root, adjustment.id)}`,
          );
        }
      }
      return SUCCEEDED;
    },
  });
}
