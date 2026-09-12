/** Captured DeadSpace Mass Ejector allocation through the resource ejector rows. */

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

export const EJECTOR_SUMMARY_CONTROL = "eject";

const STORAGE_SHIFT = 1.015;
const RATIO_MODES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  cap: Object.freeze([0.985]),
  excess: Object.freeze([-1]),
  all: Object.freeze([0.055]),
  mixed: Object.freeze([0.985, -1]),
  full: Object.freeze([0.985, -1, 0.055]),
});
const DEFAULT_RATIOS = Object.freeze([0.985]);

export interface CapturedEjectorDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand: () => CapturedDemandSample;
}

interface EjectorSession {
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
  const mode = settings["ejectMode"];
  if (mode === undefined) return DEFAULT_RATIOS;
  return typeof mode === "string" ? (RATIO_MODES[mode] ?? []) : [];
}

function ejectableResourceIds(
  controls: GameControlRegistry,
): readonly string[] {
  return Object.freeze(
    controls
      .capturedElementIds()
      .filter(
        (id) =>
          id.startsWith("eject") &&
          id !== EJECTOR_SUMMARY_CONTROL &&
          id.length > "eject".length,
      )
      .map((id) => id.slice("eject".length)),
  );
}

function readInput(dependencies: CapturedEjectorDependencies): EjectorSession {
  const root = dependencies.rootState.readRoot();
  const settingsValue = dependencies.readSettings();
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const interstellar = readProperty(root, "interstellar");
  const ejector = readProperty(interstellar, "mass_ejector");
  const resources = readProperty(root, "resource");
  const race = readProperty(root, "race");

  if (
    settings["autoEject"] !== true ||
    !isRecord(ejector) ||
    !isRecord(resources) ||
    !isRecord(race)
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const count = finite(ejector["count"]);
  const on = finite(ejector["on"]);
  if (
    count === undefined ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    on === undefined ||
    on < 0
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

  for (const id of ejectableResourceIds(dependencies.controls)) {
    if (truthy(race["artifical"]) && id === "Food") continue;
    const resource = readProperty(resources, id);
    if (!isRecord(resource) || resource["display"] !== true) continue;

    const amount = nonNegative(resource["amount"]);
    const rawMaximum = finite(resource["max"]);
    const rate = finite(resource["diff"]);
    const storageRequired = finite(demand.storageRequired(id));
    const requestedQuantity = finite(demand.requestedQuantity(id));
    const allocation = nonNegative(ejector[id] ?? 0);
    if (
      amount === undefined ||
      rawMaximum === undefined ||
      rate === undefined ||
      storageRequired === undefined ||
      requestedQuantity === undefined ||
      allocation === undefined
    ) {
      return Object.freeze({ root, input: emptyInput() });
    }

    // `Resource.maxQuantity` turns an uncapped upstream max (-1) into the largest
    // safe integer before calculating storageRatio.
    const maximum = rawMaximum >= 0 ? rawMaximum : Number.MAX_SAFE_INTEGER;
    if (maximum <= 0) return Object.freeze({ root, input: emptyInput() });
    const enabled = settings[`res_eject${id}`] === true;
    const demanded = demand.isDemanded(id);
    const storageRatio = amount / maximum;
    const keepView = {
      storageRequired,
      requestedQuantity,
      maxQuantity: maximum,
      isFood: id === "Food",
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
        currentQuantity: amount,
        storageRatio,
        craftableMaximum: null,
        ratioMaximums: Object.freeze(ratioMaximums),
      }),
    );
    current.push(Object.freeze({ id, count: allocation }));
  }

  return Object.freeze({
    root,
    input: Object.freeze({
      initialised: true,
      useful: true,
      maximum: on * 1000,
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
    readProperty(readProperty(root, "interstellar"), "mass_ejector"),
    id,
  );
  return value === undefined ? 0 : nonNegative(value);
}

function executeDecision(
  dependencies: CapturedEjectorDependencies,
  session: EjectorSession,
  decision: Readonly<ConsumeDecision>,
): CommandExecutionOutcome {
  const adjustments = decision.adjustments.filter(
    (adjustment) => adjustment.delta !== 0,
  );
  if (adjustments.length === 0) return SUCCEEDED;

  for (const adjustment of adjustments) {
    if (!Number.isSafeInteger(adjustment.delta)) {
      return rejected(
        "captured-ejector-invalid-adjustment",
        "ejector adjustment must be a safe integer",
      );
    }
    const actual = currentAllocation(session.root, adjustment.resourceId);
    if (actual !== adjustment.expectedCurrent) {
      return stale(
        "captured-ejector-allocation-changed",
        `${adjustment.resourceId}: sampled allocation changed`,
      );
    }
  }

  for (const sign of [-1, 1] as const) {
    for (const adjustment of adjustments) {
      if (Math.sign(adjustment.delta) !== sign) continue;
      const handle = dependencies.controls.resolve(
        `eject${adjustment.resourceId}`,
      );
      const method = sign < 0 ? "ejectLess" : "ejectMore";
      if (handle === undefined || !handle.methods.includes(method)) {
        return rejected(
          "captured-ejector-control-missing",
          `captured eject${adjustment.resourceId} row lacks ${method}`,
        );
      }
      for (let index = 0; index < Math.abs(adjustment.delta); index += 1) {
        if (dependencies.rootState.readRoot() !== session.root) {
          return stale(
            "captured-ejector-root-changed",
            "captured game root changed",
          );
        }
        const expected = adjustment.expectedCurrent + sign * index;
        if (
          currentAllocation(session.root, adjustment.resourceId) !== expected
        ) {
          return stale(
            "captured-ejector-allocation-changed",
            `${adjustment.resourceId}: allocation changed during execution`,
          );
        }
        const result = dependencies.controls.invoke(handle, method, [
          adjustment.resourceId,
        ]);
        if (!result.ok) {
          return rejected(
            "captured-ejector-control-failed",
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
        "captured-ejector-allocation-unchanged",
        `${adjustment.resourceId}: expected ${adjustment.expectedCurrent + adjustment.delta}, actual ${actual}`,
      );
    }
  }
  return SUCCEEDED;
}

export function createCapturedEjectorAutomation(
  dependencies: CapturedEjectorDependencies,
): { readonly run: () => CommandExecutionOutcome } {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readInput(dependencies);
      return executeDecision(dependencies, session, planConsume(session.input));
    },
  });
}
