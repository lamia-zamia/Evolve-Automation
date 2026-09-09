/** Captured DeadSpace city-factory allocation. */

import {
  planFactory,
  type FactoryInput,
  type FactoryMaterialInput,
  type FactoryProductionInput,
} from "../../../../domain/economy/production/factory.ts";
import type { CapturedDemandSample } from "../resources/captured-resource-demand.ts";
import { CONSUMPTION_BALANCE_MIN } from "../../../../config.ts";

import {
  CAPTURED_FACTORY_LINES,
  planCapturedFactoryTrim,
  type CapturedFactoryInput,
} from "../../../../domain/economy/production/captured-factory.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import { readCapturedFactoryCapacity } from "./captured-factory-capacity.ts";

export const FACTORY_CONTROL = "iFactory";

export interface CapturedFactoryDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand: () => CapturedDemandSample;
}

interface FactorySession {
  readonly root: unknown;
  readonly input: Readonly<CapturedFactoryInput>;
  readonly fullInput: Readonly<FactoryInput> | undefined;
}

interface RawResource {
  readonly amount: number;
  readonly max: number;
  readonly diff: number;
  readonly storageRatio: number;
  readonly name: string;
  readonly unlocked: boolean;
}

interface ProductSpec {
  readonly id: (typeof CAPTURED_FACTORY_LINES)[number];
  readonly outputResourceId: string;
  readonly unlockTech?: string;
  readonly isNanoTube?: boolean;
  readonly costs: readonly Readonly<{
    readonly resourceId: string;
    readonly rates: readonly number[];
    readonly minRateOfChange: number;
  }>[];
}

const PRODUCT_SPECS: readonly ProductSpec[] = Object.freeze([
  Object.freeze({
    id: "Lux",
    outputResourceId: "Money",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Furs",
        rates: Object.freeze([2, 3, 4, 5, 6]),
        minRateOfChange: 5,
      }),
    ]),
  }),
  Object.freeze({
    id: "Furs",
    outputResourceId: "Furs",
    unlockTech: "synthetic_fur",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Money",
        rates: Object.freeze([10, 15, 20, 25, 30]),
        minRateOfChange: 1000,
      }),
      Object.freeze({
        resourceId: "Polymer",
        rates: Object.freeze([1.5, 2.25, 3, 3.75, 4.5]),
        minRateOfChange: 10,
      }),
    ]),
  }),
  Object.freeze({
    id: "Alloy",
    outputResourceId: "Alloy",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Copper",
        rates: Object.freeze([0.75, 1.12, 1.49, 1.86, 2.23]),
        minRateOfChange: 5,
      }),
      Object.freeze({
        resourceId: "Aluminium",
        rates: Object.freeze([1, 1.5, 2, 2.5, 3]),
        minRateOfChange: 5,
      }),
    ]),
  }),
  Object.freeze({
    id: "Polymer",
    outputResourceId: "Polymer",
    unlockTech: "polymer",
    costs: Object.freeze([]),
  }),
  Object.freeze({
    id: "Nano",
    outputResourceId: "Nano_Tube",
    unlockTech: "nano",
    isNanoTube: true,
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Coal",
        rates: Object.freeze([8, 12, 16, 20, 24]),
        minRateOfChange: 15,
      }),
      Object.freeze({
        resourceId: "Neutronium",
        rates: Object.freeze([0.05, 0.075, 0.1, 0.125, 0.15]),
        minRateOfChange: 0.2,
      }),
    ]),
  }),
  Object.freeze({
    id: "Stanene",
    outputResourceId: "Stanene",
    unlockTech: "stanene",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Aluminium",
        rates: Object.freeze([30, 45, 60, 75, 90]),
        minRateOfChange: 50,
      }),
      Object.freeze({
        resourceId: "Nano_Tube",
        rates: Object.freeze([0.02, 0.03, 0.04, 0.05, 0.06]),
        minRateOfChange: 5,
      }),
    ]),
  }),
]);

const DEFAULT_WEIGHTINGS = Object.freeze({
  Lux: 1,
  Furs: 1,
  Alloy: 1,
  Polymer: 1,
  Nano: 4,
  Stanene: 4,
});

const DEFAULT_PRIORITIES = Object.freeze({
  Lux: 2,
  Furs: 1,
  Alloy: 3,
  Polymer: 3,
  Nano: 3,
  Stanene: 3,
});

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readResource(root: unknown, id: string): RawResource | undefined {
  const resource = readProperty(readProperty(root, "resource"), id);
  if (!isRecord(resource)) return undefined;
  const amount = finiteNonNegative(resource["amount"]);
  const max = finite(resource["max"]);
  const diff = finite(resource["diff"]);
  if (amount === undefined || max === undefined || diff === undefined) {
    return undefined;
  }
  return Object.freeze({
    amount,
    max,
    diff,
    storageRatio: max > 0 ? amount / max : 0,
    name: typeof resource["name"] === "string" ? resource["name"] : id,
    unlocked: Boolean(resource["display"]),
  });
}

function readTechLevel(root: unknown, id: string): number {
  const value = finite(readProperty(readProperty(root, "tech"), id));
  return value !== undefined && value >= 0 ? value : 0;
}

function readFactoryRateLevel(root: unknown): number | undefined {
  const value = finite(readProperty(readProperty(root, "tech"), "factory"));
  if (
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 4
  ) {
    return value === undefined ? 0 : undefined;
  }
  return value;
}

function readSettingRecord(value: unknown): Record<PropertyKey, unknown> {
  return isRecord(value) ? value : {};
}

function readBooleanSetting(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: boolean,
): boolean | undefined {
  const value = settings[key];
  return value === undefined
    ? fallback
    : typeof value === "boolean"
      ? value
      : undefined;
}

function readNumberSetting(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number | undefined {
  const value = settings[key];
  if (value === undefined) return fallback;
  const number = finite(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function readPrioritySetting(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number | undefined {
  const value = settings[key];
  if (value === undefined) return fallback;
  const number = finite(value);
  return number;
}

function readCityFactory(
  root: unknown,
): Record<PropertyKey, unknown> | undefined {
  const city = readProperty(root, "city");
  const factory = readProperty(city, "factory");
  return isRecord(factory) ? factory : undefined;
}

function readPolymerCosts(
  root: unknown,
): readonly ProductSpec["costs"][number][] {
  const race = readProperty(root, "race");
  const coalSpecies =
    Boolean(readProperty(race, "kindling_kindred")) ||
    Boolean(readProperty(race, "smoldering")) ||
    Boolean(readProperty(race, "iceage"));
  return coalSpecies
    ? Object.freeze([
        Object.freeze({
          resourceId: "Oil",
          rates: Object.freeze([0.22, 0.33, 0.44, 0.55, 0.66]),
          minRateOfChange: 2,
        }),
      ])
    : Object.freeze([
        Object.freeze({
          resourceId: "Oil",
          rates: Object.freeze([0.18, 0.27, 0.36, 0.45, 0.54]),
          minRateOfChange: 2,
        }),
        Object.freeze({
          resourceId: "Lumber",
          rates: Object.freeze([15, 22, 29, 36, 43]),
          minRateOfChange: 50,
        }),
      ]);
}

function readProductCosts(
  root: unknown,
  spec: ProductSpec,
): readonly ProductSpec["costs"][number][] {
  return spec.id === "Polymer" ? readPolymerCosts(root) : spec.costs;
}

function readFullInput(
  root: unknown,
  captured: Readonly<CapturedFactoryInput>,
  settingsValue: unknown,
  demand: CapturedDemandSample,
): Readonly<FactoryInput> | undefined {
  const rateLevel = readFactoryRateLevel(root);
  if (rateLevel === undefined) return undefined;
  const settings = readSettingRecord(settingsValue);
  const weightingValue = settings["productionFactoryWeighting"];
  const weightingMode = weightingValue === undefined ? "none" : weightingValue;
  if (
    typeof weightingMode !== "string" ||
    (weightingMode !== "none" && weightingMode !== "demanded")
  ) {
    // Building weights require the full unlocked-building catalog, which is not captured yet.
    return undefined;
  }
  const cityFactory = readCityFactory(root);
  if (cityFactory === undefined) return undefined;
  const currentById = new Map(
    captured.lines.map((line) => [line.id, line.current]),
  );
  const partial: FactoryProductionInput[] = [];
  let maximum = captured.maximum;
  let activeNano = false;
  for (const spec of PRODUCT_SPECS) {
    const currentProduction = currentById.get(spec.id);
    if (currentProduction === undefined) return undefined;
    const unlocked =
      spec.unlockTech === undefined || readTechLevel(root, spec.unlockTech) > 0;
    const enabled = readBooleanSetting(settings, `production_${spec.id}`, true);
    const weighting = readNumberSetting(
      settings,
      `production_w_${spec.id}`,
      DEFAULT_WEIGHTINGS[spec.id],
    );
    const priority = readPrioritySetting(
      settings,
      `production_p_${spec.id}`,
      DEFAULT_PRIORITIES[spec.id],
    );
    if (
      enabled === undefined ||
      weighting === undefined ||
      priority === undefined
    ) {
      return undefined;
    }
    if (unlocked && !enabled) maximum -= currentProduction;

    const output = unlocked
      ? readResource(root, spec.outputResourceId)
      : undefined;
    if (unlocked && output === undefined) return undefined;
    const outputValue =
      output ??
      Object.freeze({
        amount: 0,
        max: 0,
        diff: 0,
        storageRatio: 0,
        name: spec.outputResourceId,
        unlocked: false,
      });
    const demanded = unlocked
      ? demand.isDemanded(spec.outputResourceId)
      : false;
    const storageRequired = unlocked
      ? demand.storageRequired(spec.outputResourceId)
      : 1;
    if (!Number.isFinite(storageRequired) || storageRequired < 0) {
      return undefined;
    }
    const effectivePriority = demanded ? Math.max(priority, 100) : priority;
    const active =
      maximum > 0 &&
      unlocked &&
      enabled &&
      weighting > 0 &&
      effectivePriority !== 0;
    if (active && spec.isNanoTube) activeNano = true;
    const costs: FactoryMaterialInput[] = [];
    if (active) {
      for (const costSpec of readProductCosts(root, spec)) {
        const material = readResource(root, costSpec.resourceId);
        const quantity = costSpec.rates[rateLevel];
        if (quantity === undefined) return undefined;
        costs.push(
          Object.freeze({
            resourceId: costSpec.resourceId,
            name: material?.name ?? costSpec.resourceId,
            unlocked: material?.unlocked === true,
            demanded:
              material?.unlocked === true
                ? demand.isDemanded(costSpec.resourceId)
                : false,
            currentQuantity: material?.amount ?? 0,
            rateOfChange: material?.diff ?? 0,
            storageRatio: material?.storageRatio ?? 0,
            quantity,
            minRateOfChange: costSpec.minRateOfChange,
          }),
        );
      }
    }
    partial.push(
      Object.freeze({
        id: spec.id,
        outputResourceId: spec.outputResourceId,
        unlocked,
        enabled,
        weighting,
        priority,
        demanded,
        useful: outputValue.storageRatio < 0.99 || demanded,
        currentQuantity: outputValue.amount,
        storageRequired,
        buildingWeight: 100,
        currentProduction: unlocked && enabled ? currentProduction : 0,
        isNanoTube: spec.isNanoTube === true,
        costs: Object.freeze(costs),
      }),
    );
  }
  if (!Number.isSafeInteger(maximum) || maximum < 0) return undefined;

  const bioseedConstruct =
    settings["prestigeType"] === "bioseed" &&
    settings["prestigeBioseedConstruct"] === true;
  let truepath = false;
  let neutroniumCurrent = 0;
  let neutroniumName = "Neutronium";
  if (bioseedConstruct && activeNano) {
    truepath = Boolean(readProperty(readProperty(root, "race"), "truepath"));
    const neutronium = readResource(root, "Neutronium");
    if (neutronium === undefined) return undefined;
    neutroniumCurrent = neutronium.amount;
    neutroniumName = neutronium.name;
  }
  const minimumIngredientRatio = partial.some(
    (production) =>
      production.unlocked &&
      production.enabled &&
      production.weighting > 0 &&
      production.priority !== 0,
  )
    ? readNumberSetting(settings, "productionFactoryMinIngredients", 0)
    : 0;
  if (minimumIngredientRatio === undefined) return undefined;
  const useDemandedMaterials = readBooleanSetting(
    settings,
    "useDemanded",
    true,
  );
  if (useDemandedMaterials === undefined) return undefined;
  return Object.freeze({
    initialized: true,
    maximum,
    weightingMode,
    hasUnlockedBuildings: false,
    useDemandedMaterials,
    minimumIngredientRatio,
    consumptionBalanceMinimum: CONSUMPTION_BALANCE_MIN,
    bioseedConstruct,
    truepath,
    neutroniumCurrent,
    neutroniumName,
    productions: Object.freeze(partial),
  });
}

function readInput(root: unknown): Readonly<CapturedFactoryInput> | undefined {
  const city = readProperty(root, "city");
  if (!isRecord(city)) return undefined;
  const factory = readProperty(city, "factory");
  if (!isRecord(factory)) return undefined;
  const maximum = readCapturedFactoryCapacity(root);
  if (maximum === undefined) return undefined;

  const lines = [];
  for (const id of CAPTURED_FACTORY_LINES) {
    const current = finiteNonNegative(factory[id]);
    if (current === undefined || !Number.isSafeInteger(current))
      return undefined;
    lines.push(Object.freeze({ id, current }));
  }
  return Object.freeze({ maximum, lines: Object.freeze(lines) });
}

function totalAssigned(root: unknown): number | undefined {
  const factory = readProperty(readProperty(root, "city"), "factory");
  if (!isRecord(factory)) return undefined;
  let total = 0;
  for (const id of CAPTURED_FACTORY_LINES) {
    const value = finiteNonNegative(factory[id]);
    if (value === undefined) return undefined;
    total += value;
  }
  return total;
}

export function createCapturedFactoryAutomation({
  rootState,
  controls,
  readSettings,
  readDemand,
}: CapturedFactoryDependencies): {
  readonly run: () => CommandExecutionOutcome;
} {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const root = rootState.readRoot();
      const input = readInput(root);
      if (root === undefined || input === undefined) return SUCCEEDED;
      const fullInput = readFullInput(
        root,
        input,
        readSettings(),
        readDemand(),
      );
      const session: FactorySession = Object.freeze({ root, input, fullInput });
      const decision =
        fullInput === undefined ? undefined : planFactory(fullInput);
      const adjustments =
        decision?.adjustments.filter((adjustment) => adjustment.delta !== 0) ??
        planCapturedFactoryTrim(session.input).map((adjustment) =>
          Object.freeze({
            productionId: adjustment.id,
            outputResourceId: adjustment.id,
            expectedCurrent:
              session.input.lines.find((line) => line.id === adjustment.id)
                ?.current ?? 0,
            delta: adjustment.delta,
          }),
        );
      if (adjustments.length === 0) return SUCCEEDED;
      const handle = controls.resolve(FACTORY_CONTROL);
      const needsDecrease = adjustments.some(
        (adjustment) => adjustment.delta < 0,
      );
      const needsIncrease = adjustments.some(
        (adjustment) => adjustment.delta > 0,
      );
      if (
        handle === undefined ||
        (needsDecrease && !handle.methods.includes("subItem")) ||
        (needsIncrease && !handle.methods.includes("addItem"))
      ) {
        return rejected(
          "captured-factory-control-missing",
          "captured iFactory control lacks the required allocation method",
        );
      }
      const invoke = (
        method: "addItem" | "subItem",
        adjustment: Readonly<(typeof adjustments)[number]>,
        count: number,
      ): CommandExecutionOutcome | undefined => {
        for (let index = 0; index < count; index += 1) {
          if (rootState.readRoot() !== session.root) {
            return stale(
              "captured-factory-root-changed",
              "captured game root changed",
            );
          }
          const current = readInput(session.root);
          const actual = current?.lines.find(
            (line) => line.id === adjustment.productionId,
          )?.current;
          const expected =
            adjustment.expectedCurrent +
            (method === "addItem" ? index : -index);
          if (
            current === undefined ||
            current.maximum !== session.input.maximum ||
            actual !== expected
          ) {
            return stale(
              "captured-factory-allocation-changed",
              "factory allocation changed",
            );
          }
          const result = controls.invoke(handle, method, [
            adjustment.productionId,
          ]);
          if (!result.ok) {
            return rejected(
              "captured-factory-control-failed",
              result.detail ?? result.reason,
            );
          }
        }
        return undefined;
      };
      for (const adjustment of adjustments) {
        if (adjustment.delta >= 0) continue;
        const outcome = invoke("subItem", adjustment, -adjustment.delta);
        if (outcome !== undefined) return outcome;
      }
      for (const adjustment of adjustments) {
        if (adjustment.delta <= 0) continue;
        const outcome = invoke("addItem", adjustment, adjustment.delta);
        if (outcome !== undefined) return outcome;
      }
      if (fullInput !== undefined) {
        const after = readInput(session.root);
        if (after === undefined || after.maximum !== fullInput.maximum) {
          return stale(
            "captured-factory-allocation-unchanged",
            "factory allocation did not reach the planned capacity",
          );
        }
        for (const adjustment of adjustments) {
          const actual = after.lines.find(
            (line) => line.id === adjustment.productionId,
          )?.current;
          if (actual !== adjustment.expectedCurrent + adjustment.delta) {
            return stale(
              "captured-factory-allocation-unchanged",
              "factory allocation did not reach the planned allocation",
            );
          }
        }
        return SUCCEEDED;
      }
      const remaining = totalAssigned(session.root);
      if (remaining === undefined || remaining > session.input.maximum) {
        return stale(
          "captured-factory-allocation-unchanged",
          "factory allocation did not reach captured capacity",
        );
      }
      return SUCCEEDED;
    },
  });
}
