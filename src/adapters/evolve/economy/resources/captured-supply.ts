/** Captured DeadSpace Supply allocation through the resource supply rows. */

import {
  calculateConsumeKeepRatio,
  planConsume,
  type ConsumeDecision,
  type ConsumeInput,
  type ConsumeResourceView,
} from "../../../../domain/economy/resources/consume.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { CapturedDemandSample } from "./captured-resource-demand.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export const SUPPLY_SUMMARY_CONTROL = "spireSupply";

const STORAGE_SHIFT = 1.01;
const SUPPLY_VALUES: Readonly<
  Record<string, Readonly<{ in: number; out: number }>>
> = Object.freeze({
  Lumber: Object.freeze({ in: 0.5, out: 25000 }),
  Chrysotile: Object.freeze({ in: 0.5, out: 25000 }),
  Stone: Object.freeze({ in: 0.5, out: 25000 }),
  Crystal: Object.freeze({ in: 3, out: 25000 }),
  Furs: Object.freeze({ in: 3, out: 25000 }),
  Copper: Object.freeze({ in: 1.5, out: 25000 }),
  Iron: Object.freeze({ in: 1.5, out: 25000 }),
  Aluminium: Object.freeze({ in: 2.5, out: 25000 }),
  Cement: Object.freeze({ in: 3, out: 25000 }),
  Coal: Object.freeze({ in: 1.5, out: 25000 }),
  Oil: Object.freeze({ in: 2.5, out: 12000 }),
  Uranium: Object.freeze({ in: 5, out: 300 }),
  Steel: Object.freeze({ in: 3, out: 25000 }),
  Titanium: Object.freeze({ in: 3, out: 25000 }),
  Alloy: Object.freeze({ in: 6, out: 25000 }),
  Polymer: Object.freeze({ in: 6, out: 25000 }),
  Iridium: Object.freeze({ in: 8, out: 25000 }),
  Helium_3: Object.freeze({ in: 4.5, out: 12000 }),
  Deuterium: Object.freeze({ in: 4, out: 1000 }),
  Neutronium: Object.freeze({ in: 15, out: 1000 }),
  Adamantite: Object.freeze({ in: 12.5, out: 1000 }),
  Infernite: Object.freeze({ in: 25, out: 250 }),
  Elerium: Object.freeze({ in: 30, out: 250 }),
  Nano_Tube: Object.freeze({ in: 6.5, out: 1000 }),
  Graphene: Object.freeze({ in: 5, out: 1000 }),
  Stanene: Object.freeze({ in: 4.5, out: 1000 }),
  Bolognium: Object.freeze({ in: 18, out: 1000 }),
  Vitreloy: Object.freeze({ in: 14, out: 1000 }),
  Orichalcum: Object.freeze({ in: 10, out: 1000 }),
  Plywood: Object.freeze({ in: 10, out: 250 }),
  Brick: Object.freeze({ in: 10, out: 250 }),
  Wrought_Iron: Object.freeze({ in: 10, out: 250 }),
  Sheet_Metal: Object.freeze({ in: 10, out: 250 }),
  Mythril: Object.freeze({ in: 12.5, out: 250 }),
  Aerogel: Object.freeze({ in: 16.5, out: 250 }),
  Nanoweave: Object.freeze({ in: 18, out: 250 }),
  Scarletite: Object.freeze({ in: 35, out: 250 }),
});
const CRAFTABLE_RESOURCES: Readonly<Record<string, true>> = Object.freeze({
  Plywood: true,
  Brick: true,
  Wrought_Iron: true,
  Sheet_Metal: true,
  Mythril: true,
  Aerogel: true,
  Nanoweave: true,
});
const RATIO_MODES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  cap: Object.freeze([0.975]),
  excess: Object.freeze([-1]),
  all: Object.freeze([0.045]),
  mixed: Object.freeze([0.975, -1]),
  full: Object.freeze([0.975, -1, 0.045]),
});
const DEFAULT_RATIOS = Object.freeze([0.975]);

export interface CapturedSupplyDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand: () => CapturedDemandSample;
}

interface SupplySession {
  readonly root: unknown;
  readonly input: Readonly<ConsumeInput>;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function nonNegative(value: unknown): number | undefined {
  const number = finite(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function truthy(value: unknown): boolean {
  return value ? true : false;
}

function emptyInput(): ConsumeInput {
  return Object.freeze({
    initialised: false,
    useful: false,
    maximum: 0,
    storageShift: STORAGE_SHIFT,
    hungryRace: false,
    ratios: Object.freeze([]),
    resources: Object.freeze([]),
    current: Object.freeze([]),
  });
}

function readRatios(settings: Record<PropertyKey, unknown>): readonly number[] {
  const mode = settings["supplyMode"];
  if (mode === undefined) return DEFAULT_RATIOS;
  return typeof mode === "string" ? (RATIO_MODES[mode] ?? []) : [];
}

function supplyResourceIds(controls: GameControlRegistry): readonly string[] {
  return Object.freeze(
    controls
      .capturedElementIds()
      .filter(
        (id) =>
          id.startsWith("supply") &&
          id !== SUPPLY_SUMMARY_CONTROL &&
          id.length > "supply".length,
      )
      .map((id) => id.slice("supply".length)),
  );
}

function readInput(dependencies: CapturedSupplyDependencies): SupplySession {
  const root = dependencies.rootState.readRoot();
  const settingsValue = dependencies.readSettings();
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const portal = readProperty(root, "portal");
  const transport = readProperty(portal, "transport");
  const cargo = readProperty(transport, "cargo");
  const resources = readProperty(root, "resource");
  const race = readProperty(root, "race");

  if (
    settings["autoSupply"] !== true ||
    !isRecord(transport) ||
    !isRecord(cargo) ||
    !isRecord(resources) ||
    !isRecord(race)
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const transportCount = finite(transport["count"]);
  const transportOn = finite(transport["on"]);
  const cargoMaximum = nonNegative(cargo["max"]);
  const bireme = readProperty(portal, "bireme");
  const biremeOn = finite(readProperty(bireme, "on"));
  const supply = readProperty(resources, "Supply");
  const supplyAmount = finite(readProperty(supply, "amount"));
  const supplyMaximum = finite(readProperty(supply, "max"));
  if (
    transportCount === undefined ||
    !Number.isSafeInteger(transportCount) ||
    transportCount < 1 ||
    transportOn === undefined ||
    biremeOn === undefined ||
    cargoMaximum === undefined ||
    !Number.isSafeInteger(cargoMaximum) ||
    !isRecord(supply) ||
    supplyAmount === undefined ||
    supplyMaximum === undefined
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  // `SupplyManager.isUseful` requires both Lake structures to be active and
  // the Supply resource to have storage headroom.
  const useful =
    supplyMaximum > 0 &&
    supplyAmount / supplyMaximum < 1 &&
    transportOn > 0 &&
    biremeOn > 0;
  const demand = dependencies.readDemand();
  const ratios = readRatios(settings);
  const hungryRace =
    (truthy(race["carnivore"]) &&
      !truthy(race["herbivore"]) &&
      !truthy(race["artifical"])) ||
    truthy(race["ravenous"]);
  const resourceViews: ConsumeResourceView[] = [];
  const current = [];

  for (const id of supplyResourceIds(dependencies.controls)) {
    const value = SUPPLY_VALUES[id];
    const resource = readProperty(resources, id);
    if (
      value === undefined ||
      !isRecord(resource) ||
      resource["display"] !== true
    ) {
      continue;
    }
    const amount = nonNegative(resource["amount"]);
    const rawMaximum = finite(resource["max"]);
    const baseRate = finite(resource["diff"]);
    const storageRequired = finite(demand.storageRequired(id));
    const requestedQuantity = finite(demand.requestedQuantity(id));
    const allocation = nonNegative(cargo[id] ?? 0);
    if (
      amount === undefined ||
      rawMaximum === undefined ||
      baseRate === undefined ||
      storageRequired === undefined ||
      requestedQuantity === undefined ||
      allocation === undefined ||
      value.out <= 0
    ) {
      return Object.freeze({ root, input: emptyInput() });
    }

    const maximum = rawMaximum >= 0 ? rawMaximum : Number.MAX_SAFE_INTEGER;
    if (maximum <= 0) return Object.freeze({ root, input: emptyInput() });
    const enabled = settings[`res_supply${id}`] === true;
    const demanded = demand.isDemanded(id);
    const storageRatio = amount / maximum;
    const isCraftable = CRAFTABLE_RESOURCES[id] === true;
    const keepView = {
      storageRequired,
      requestedQuantity,
      maxQuantity: maximum,
      isFood: false,
    };
    // The upstream game does not know script-owned cargo allocations. Mirror
    // SupplyManager.updateResources before applying its max-consume formulas.
    const rate = baseRate + allocation * value.out;
    const craftableMaximum =
      isCraftable && amount > storageRequired * STORAGE_SHIFT
        ? Math.max(rate, amount - storageRequired * STORAGE_SHIFT) / value.out
        : null;
    const ratioMaximums = ratios.map((ratio) => {
      if (!enabled || demanded || isCraftable) return null;
      const keepRatio = calculateConsumeKeepRatio(
        ratio,
        keepView,
        STORAGE_SHIFT,
        hungryRace,
      );
      if (
        keepRatio === null ||
        !(storageRatio > keepRatio || (storageRatio >= 0.999 && keepRatio >= 1))
      ) {
        return null;
      }
      const queryRatio =
        storageRatio > keepRatio
          ? keepRatio
          : storageRatio >= 0.999 && keepRatio >= 1
            ? storageRatio
            : null;
      return queryRatio === null
        ? null
        : Math.max(rate, (storageRatio - queryRatio) * maximum) / value.out;
    });
    resourceViews.push(
      Object.freeze({
        id,
        enabled,
        demanded,
        ...keepView,
        isCraftable,
        currentQuantity: amount,
        storageRatio,
        craftableMaximum,
        ratioMaximums: Object.freeze(ratioMaximums),
      }),
    );
    current.push(Object.freeze({ id, count: allocation }));
  }

  return Object.freeze({
    root,
    input: Object.freeze({
      initialised: true,
      useful,
      maximum: cargoMaximum,
      storageShift: STORAGE_SHIFT,
      hungryRace,
      ratios: Object.freeze([...ratios]),
      resources: Object.freeze(resourceViews),
      current: Object.freeze(current),
    }),
  });
}

function currentAllocation(root: unknown, id: string): number | undefined {
  const value = readProperty(
    readProperty(
      readProperty(readProperty(root, "portal"), "transport"),
      "cargo",
    ),
    id,
  );
  return value === undefined ? 0 : nonNegative(value);
}

function executeDecision(
  dependencies: CapturedSupplyDependencies,
  session: SupplySession,
  decision: Readonly<ConsumeDecision>,
): CommandExecutionOutcome {
  const adjustments = decision.adjustments.filter(
    (adjustment) => adjustment.delta !== 0,
  );
  if (adjustments.length === 0) return SUCCEEDED;

  for (const adjustment of adjustments) {
    if (!Number.isSafeInteger(adjustment.delta)) {
      return rejected(
        "captured-supply-invalid-adjustment",
        "supply adjustment must be a safe integer",
      );
    }
    const actual = currentAllocation(session.root, adjustment.resourceId);
    if (actual !== adjustment.expectedCurrent) {
      return stale(
        "captured-supply-allocation-changed",
        `${adjustment.resourceId}: sampled allocation changed`,
      );
    }
  }

  for (const sign of [-1, 1] as const) {
    for (const adjustment of adjustments) {
      if (Math.sign(adjustment.delta) !== sign) continue;
      const handle = dependencies.controls.resolve(
        `supply${adjustment.resourceId}`,
      );
      const method = sign < 0 ? "supplyLess" : "supplyMore";
      if (handle === undefined || !handle.methods.includes(method)) {
        return rejected(
          "captured-supply-control-missing",
          `captured supply${adjustment.resourceId} row lacks ${method}`,
        );
      }
      for (let index = 0; index < Math.abs(adjustment.delta); index += 1) {
        if (dependencies.rootState.readRoot() !== session.root) {
          return stale(
            "captured-supply-root-changed",
            "captured game root changed",
          );
        }
        const expected = adjustment.expectedCurrent + sign * index;
        if (
          currentAllocation(session.root, adjustment.resourceId) !== expected
        ) {
          return stale(
            "captured-supply-allocation-changed",
            `${adjustment.resourceId}: allocation changed during execution`,
          );
        }
        const result = dependencies.controls.invoke(handle, method, [
          adjustment.resourceId,
        ]);
        if (!result.ok) {
          return rejected(
            "captured-supply-control-failed",
            result.detail ?? result.reason,
          );
        }
      }
    }
  }

  for (const adjustment of adjustments) {
    const actual = currentAllocation(session.root, adjustment.resourceId);
    if (actual !== adjustment.expectedCurrent + adjustment.delta) {
      return stale(
        "captured-supply-allocation-unchanged",
        `${adjustment.resourceId}: expected ${adjustment.expectedCurrent + adjustment.delta}, actual ${actual}`,
      );
    }
  }
  return SUCCEEDED;
}

export function createCapturedSupplyAutomation(
  dependencies: CapturedSupplyDependencies,
): { readonly run: () => CommandExecutionOutcome } {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readInput(dependencies);
      return executeDecision(dependencies, session, planConsume(session.input));
    },
  });
}
