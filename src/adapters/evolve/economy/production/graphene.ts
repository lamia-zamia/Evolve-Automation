import type {
  GrapheneFuelView,
  GrapheneInput,
} from "../../../../domain/economy/production/graphene.ts";
import type { GrapheneFuelAdjustment } from "../../../../domain/economy/production/graphene.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import {
  callBoolean,
  callNumber,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../../validation.ts";

export interface GrapheneReaderDependencies {
  readonly getGrapheneManager: () => unknown;
  readonly getResources: () => unknown;
  readonly consumptionBalanceMin: number;
}

interface RawFuel {
  readonly index: number;
  readonly id: string;
  readonly fuel: UnknownRecord;
  readonly cost: UnknownRecord;
  readonly resource: UnknownRecord;
  readonly storageRatio: number;
  readonly rateOfChange: number;
}

function readFuels(
  manager: UnknownRecord,
  graphene: UnknownRecord,
  maxOperating: number,
): { readonly fuels: GrapheneFuelView[]; readonly grapheneUseful: boolean } {
  const fuels = requireRecord(manager["Fuels"], "GrapheneManager.Fuels");
  const rawFuels: RawFuel[] = Object.values(fuels).map((entry, index) => {
    const path = `GrapheneManager.Fuels[${index}]`;
    const fuel = requireRecord(entry, path);
    const id = fuel["id"];
    if (typeof id !== "string") {
      throw new TypeError(`${path}.id must be a string`);
    }
    const cost = requireRecord(fuel["cost"], `${path}.cost`);
    const resource = requireRecord(cost["resource"], `${path}.cost.resource`);
    return {
      index,
      id,
      storageRatio: requireNumber(
        resource["storageRatio"],
        `${path}.cost.resource.storageRatio`,
      ),
      rateOfChange: requireNumber(
        resource["rateOfChange"],
        `${path}.cost.resource.rateOfChange`,
      ),
      fuel,
      cost,
      resource,
    };
  });

  const result: GrapheneFuelView[] = rawFuels.map((fuel) =>
    Object.freeze({
      id: fuel.id,
      storageRatio: fuel.storageRatio,
      rateOfChange: fuel.rateOfChange,
      currentQuantity: 0,
      isUnlocked: false,
      costQuantity: 0,
      costMinRateOfChange: 0,
      currentFuelCount: 0,
    }),
  );
  let grapheneUseful = false;
  let usefulnessSampled = false;
  if (maxOperating !== 0) {
    const sorted = [...rawFuels].sort((a, b) =>
      b.storageRatio < 0.995 || a.storageRatio < 0.995
        ? b.storageRatio - a.storageRatio
        : b.rateOfChange - a.rateOfChange,
    );
    for (const raw of sorted) {
      const path = `GrapheneManager.Fuels[${raw.index}]`;
      const isUnlocked = callBoolean(
        raw.resource,
        "isUnlocked",
        `${path}.cost.resource`,
      );
      if (!isUnlocked) {
        continue;
      }
      if (!usefulnessSampled) {
        grapheneUseful = callBoolean(
          graphene,
          "isUseful",
          "resources.Graphene",
        );
        usefulnessSampled = true;
      }
      result[raw.index] = Object.freeze({
        id: raw.id,
        storageRatio: raw.storageRatio,
        rateOfChange: raw.rateOfChange,
        currentQuantity: requireNumber(
          raw.resource["currentQuantity"],
          `${path}.cost.resource.currentQuantity`,
        ),
        isUnlocked: true,
        costQuantity: requireNumber(
          raw.cost["quantity"],
          `${path}.cost.quantity`,
        ),
        costMinRateOfChange: requireNumber(
          raw.cost["minRateOfChange"],
          `${path}.cost.minRateOfChange`,
        ),
        currentFuelCount: callNumber(
          manager,
          "fueledCount",
          "GrapheneManager",
          raw.fuel,
        ),
      });
    }
  }
  return { fuels: result, grapheneUseful };
}

export function readGrapheneInput(
  dependencies: GrapheneReaderDependencies,
): GrapheneInput {
  const resourcesValue = dependencies.getResources();
  const manager = requireRecord(
    dependencies.getGrapheneManager(),
    "GrapheneManager",
  );
  // Legacy returns immediately when the industry is not initialised.
  if (!callBoolean(manager, "initIndustry", "GrapheneManager")) {
    return Object.freeze({
      initialised: false,
      maxOperating: 0,
      grapheneUseful: false,
      consumptionBalanceMin: dependencies.consumptionBalanceMin,
      fuels: Object.freeze([]),
    });
  }
  const resources = requireRecord(resourcesValue, "resources");
  const graphene = requireRecord(resources["Graphene"], "resources.Graphene");
  const maxOperating = callNumber(manager, "maxOperating", "GrapheneManager");
  const fuelSnapshot = readFuels(manager, graphene, maxOperating);

  return Object.freeze({
    initialised: true,
    maxOperating,
    grapheneUseful: fuelSnapshot.grapheneUseful,
    consumptionBalanceMin: dependencies.consumptionBalanceMin,
    fuels: Object.freeze(fuelSnapshot.fuels),
  });
}

export function createGrapheneCommandExecutor(
  getGrapheneManager: () => unknown,
): DecisionExecutor<readonly GrapheneFuelAdjustment[]> {
  function execute(adjustments: readonly Readonly<GrapheneFuelAdjustment>[]) {
    if (adjustments.length === 0) {
      return SUCCEEDED;
    }
    const manager = requireRecord(getGrapheneManager(), "GrapheneManager");
    const fuels = requireRecord(manager["Fuels"], "GrapheneManager.Fuels");
    const fueledCount = requireFunction(
      manager["fueledCount"],
      "GrapheneManager.fueledCount",
    );
    const decreaseFuel = requireFunction(
      manager["decreaseFuel"],
      "GrapheneManager.decreaseFuel",
    );
    const increaseFuel = requireFunction(
      manager["increaseFuel"],
      "GrapheneManager.increaseFuel",
    );
    const resolved: {
      readonly adjustment: Readonly<GrapheneFuelAdjustment>;
      readonly fuel: UnknownRecord;
    }[] = [];
    for (const adjustment of adjustments) {
      if (!Number.isSafeInteger(adjustment.delta)) {
        return rejected(
          "invalid-graphene-adjustment",
          "graphene fuel adjustment must be a safe integer",
        );
      }
      const fuel = requireRecord(
        fuels[adjustment.fuelId],
        `GrapheneManager.Fuels.${adjustment.fuelId}`,
      );
      const actual = requireNumber(
        Reflect.apply(fueledCount, manager, [fuel]),
        `GrapheneManager.fueledCount(${adjustment.fuelId})`,
      );
      if (actual !== adjustment.expectedCurrentFuelCount) {
        return stale("stale-graphene-fuel", "graphene fuel count changed", {
          fuelId: adjustment.fuelId,
          expected: adjustment.expectedCurrentFuelCount,
          actual,
        });
      }
      resolved.push({ adjustment, fuel });
    }
    for (const { adjustment, fuel } of resolved) {
      if (adjustment.delta < 0) {
        Reflect.apply(decreaseFuel, manager, [fuel, adjustment.delta * -1]);
      }
    }
    for (const { adjustment, fuel } of resolved) {
      if (adjustment.delta > 0) {
        Reflect.apply(increaseFuel, manager, [fuel, adjustment.delta]);
      }
    }
    return SUCCEEDED;
  }

  return Object.freeze({ execute });
}
