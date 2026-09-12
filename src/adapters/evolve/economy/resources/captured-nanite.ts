/** Captured DeadSpace Nanite allocation through the iNFactory industry panel. */

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
import { finite, isRecord, readProperty } from "../../../validation.ts";

export const NANITE_CONTROL = "iNFactory";

const STORAGE_SHIFT = 1.005;

/** `nf_resources` from DeadSpace, in the Nanite manager's default mass order. */
const NANITE_RESOURCES = Object.freeze([
  "Neutronium",
  "Uranium",
  "Orichalcum",
  "Iridium",
  "Adamantite",
  "Polymer",
  "Bolognium",
  "Copper",
  "Steel",
  "Iron",
  "Titanium",
  "Alloy",
  "Aluminium",
  "Stone",
  "Cement",
  "Water",
  "Chrysotile",
  "Furs",
  "Coal",
  "Lumber",
  "Oil",
  "Crystal",
  "Helium_3",
  "Deuterium",
] as const);

const RATIO_MODES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  cap: Object.freeze([0.965]),
  excess: Object.freeze([-1]),
  all: Object.freeze([0.035]),
  mixed: Object.freeze([0.965, -1]),
  full: Object.freeze([0.965, -1, 0.035]),
});
const DEFAULT_RATIOS = Object.freeze([0.965, -1, 0.035]);

export interface CapturedNaniteDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand: () => CapturedDemandSample;
}

interface NaniteSession {
  readonly root: unknown;
  readonly input: Readonly<ConsumeInput>;
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
  const mode = settings["naniteMode"];
  if (mode === undefined) return DEFAULT_RATIOS;
  return typeof mode === "string" ? (RATIO_MODES[mode] ?? []) : [];
}

function readInput(dependencies: CapturedNaniteDependencies): NaniteSession {
  const root = dependencies.rootState.readRoot();
  const settingsValue = dependencies.readSettings();
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const city = readProperty(root, "city");
  const race = readProperty(root, "race");
  const resources = readProperty(root, "resource");
  const factory = readProperty(city, "nanite_factory");
  const nanite = readProperty(resources, "Nanite");
  const control = dependencies.controls.resolve(NANITE_CONTROL);

  if (
    settings["autoNanite"] !== true ||
    !isRecord(race) ||
    !isRecord(resources) ||
    !isRecord(factory) ||
    control === undefined ||
    !control.methods.includes("addItem") ||
    !control.methods.includes("subItem") ||
    !truthy(race["deconstructor"])
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const factoryCount = finite(factory["count"]);
  const naniteAmount = finite(readProperty(nanite, "amount"));
  const naniteMaximum = finite(readProperty(nanite, "max"));
  if (
    factoryCount === undefined ||
    !Number.isSafeInteger(factoryCount) ||
    factoryCount < 0 ||
    naniteAmount === undefined ||
    naniteMaximum === undefined
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const demand = dependencies.readDemand();
  const ratios = readRatios(settings);
  const hungryRace =
    (truthy(race["carnivore"]) &&
      !truthy(race["herbivore"]) &&
      !truthy(race["artifical"])) ||
    truthy(race["ravenous"]);
  const resourceViews: ConsumeResourceView[] = [];
  const current = [];

  for (const id of NANITE_RESOURCES) {
    const resource = readProperty(resources, id);
    if (!isRecord(resource) || resource["display"] !== true) continue;
    const amount = finite(resource["amount"]);
    const maximum = finite(resource["max"]);
    const rate = finite(resource["diff"]);
    const storageRequired = finite(demand.storageRequired(id));
    const requestedQuantity = finite(demand.requestedQuantity(id));
    // DeadSpace's `currentConsume` uses `?? 0` for a lazily-created split key.
    const allocation = nonNegative(factory[id] ?? 0);
    if (
      amount === undefined ||
      maximum === undefined ||
      maximum <= 0 ||
      rate === undefined ||
      storageRequired === undefined ||
      requestedQuantity === undefined ||
      allocation === undefined
    ) {
      return Object.freeze({ root, input: emptyInput() });
    }

    const currentQuantity = amount;
    const enabled = settings[`res_nanite${id}`] === true;
    const demanded = demand.isDemanded(id);
    const storageRatio = amount / maximum;
    const keepView = {
      storageRequired,
      requestedQuantity,
      maxQuantity: maximum,
      isFood: false,
    };
    const ratioMaximums = ratios.map((ratio) => {
      const keepRatio = calculateConsumeKeepRatio(
        ratio,
        keepView,
        STORAGE_SHIFT,
        hungryRace,
      );
      if (
        !enabled ||
        demanded ||
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
        : Math.max(rate, (storageRatio - queryRatio) * maximum);
    });
    resourceViews.push(
      Object.freeze({
        id,
        enabled,
        demanded,
        ...keepView,
        isCraftable: false,
        currentQuantity,
        storageRatio,
        craftableMaximum: null,
        ratioMaximums: Object.freeze(ratioMaximums),
      }),
    );
    current.push(Object.freeze({ id, count: allocation }));
  }

  const usefulRatio = naniteMaximum > 0 ? naniteAmount / naniteMaximum : 1;
  return Object.freeze({
    root,
    input: Object.freeze({
      initialised: true,
      useful: usefulRatio < 1,
      maximum: factoryCount * 50,
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
    readProperty(readProperty(root, "city"), "nanite_factory"),
    id,
  );
  return value === undefined ? 0 : nonNegative(value);
}

function executeDecision(
  dependencies: CapturedNaniteDependencies,
  session: NaniteSession,
  decision: Readonly<ConsumeDecision>,
): CommandExecutionOutcome {
  const adjustments = decision.adjustments.filter(
    (adjustment) => adjustment.delta !== 0,
  );
  if (adjustments.length === 0) return SUCCEEDED;
  const handle = dependencies.controls.resolve(NANITE_CONTROL);
  if (
    handle === undefined ||
    !handle.methods.includes("addItem") ||
    !handle.methods.includes("subItem")
  ) {
    return rejected(
      "captured-nanite-control-missing",
      "captured iNFactory control lacks the required allocation methods",
    );
  }
  for (const adjustment of adjustments) {
    if (
      !Number.isSafeInteger(adjustment.delta) ||
      currentAllocation(session.root, adjustment.resourceId) !==
        adjustment.expectedCurrent
    ) {
      return stale(
        "captured-nanite-allocation-changed",
        `${adjustment.resourceId}: sampled allocation changed`,
      );
    }
  }

  for (const sign of [-1, 1] as const) {
    for (const adjustment of adjustments) {
      if (Math.sign(adjustment.delta) !== sign) continue;
      const method = sign < 0 ? "subItem" : "addItem";
      for (let index = 0; index < Math.abs(adjustment.delta); index += 1) {
        if (dependencies.rootState.readRoot() !== session.root) {
          return stale(
            "captured-nanite-root-changed",
            "captured game root changed",
          );
        }
        const expected = adjustment.expectedCurrent + sign * index;
        if (
          currentAllocation(session.root, adjustment.resourceId) !== expected
        ) {
          return stale(
            "captured-nanite-allocation-changed",
            `${adjustment.resourceId}: allocation changed during execution`,
          );
        }
        const result = dependencies.controls.invoke(handle, method, [
          adjustment.resourceId,
        ]);
        if (!result.ok) {
          return rejected(
            "captured-nanite-control-failed",
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
        "captured-nanite-allocation-unchanged",
        `${adjustment.resourceId}: expected ${adjustment.expectedCurrent + adjustment.delta}, actual ${actual}`,
      );
    }
  }
  return SUCCEEDED;
}

export function createCapturedNaniteAutomation(
  dependencies: CapturedNaniteDependencies,
): { readonly run: () => CommandExecutionOutcome } {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readInput(dependencies);
      return executeDecision(dependencies, session, planConsume(session.input));
    },
  });
}
