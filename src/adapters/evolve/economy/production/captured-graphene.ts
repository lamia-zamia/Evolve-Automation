/** Bounded standard-route graphene fuel allocation through the captured industry panel. */

import { CONSUMPTION_BALANCE_MIN } from "../../../../config.ts";
import {
  planGraphene,
  type GrapheneFuelAdjustment,
  type GrapheneInput,
} from "../../../../domain/economy/production/graphene.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export const GRAPHENE_CONTROL = "iGraphene";

const FUELS = Object.freeze([
  Object.freeze({
    id: "Lumber",
    add: "addWood",
    sub: "subWood",
    costQuantity: 350,
    costMinRateOfChange: 100,
  }),
  Object.freeze({
    id: "Coal",
    add: "addCoal",
    sub: "subCoal",
    costQuantity: 25,
    costMinRateOfChange: 10,
  }),
  Object.freeze({
    id: "Oil",
    add: "addOil",
    sub: "subOil",
    costQuantity: 15,
    costMinRateOfChange: 10,
  }),
]);

export interface CapturedGrapheneDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

export interface CapturedGrapheneAutomation {
  run(): CommandExecutionOutcome;
}

function emptyInput(): GrapheneInput {
  return Object.freeze({
    initialised: false,
    maxOperating: 0,
    grapheneUseful: false,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    fuels: Object.freeze([]),
  });
}

function readInput(dependencies: CapturedGrapheneDependencies): {
  readonly root: unknown;
  readonly input: GrapheneInput;
} {
  const root = dependencies.rootState.readRoot();
  const race = readProperty(root, "race");
  const interstellar = readProperty(root, "interstellar");
  const plant = readProperty(interstellar, "g_factory");
  const resources = readProperty(root, "resource");
  const graphene = readProperty(resources, "Graphene");
  if (
    !isRecord(race) ||
    Boolean(readProperty(race, "truepath")) ||
    Boolean(readProperty(race, "warlord")) ||
    !isRecord(plant) ||
    !isRecord(resources) ||
    !isRecord(graphene) ||
    dependencies.controls.resolve(GRAPHENE_CONTROL) === undefined
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const count = finite(readProperty(plant, "count"));
  const maxOperating = finite(readProperty(plant, "on"));
  const grapheneAmount = finite(readProperty(graphene, "amount"));
  const grapheneMaximum = finite(readProperty(graphene, "max"));
  const grapheneDisplay = readProperty(graphene, "display");
  if (
    count === undefined ||
    count < 1 ||
    maxOperating === undefined ||
    maxOperating < 0 ||
    grapheneAmount === undefined ||
    grapheneMaximum === undefined ||
    typeof grapheneDisplay !== "boolean"
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const fuels = [];
  for (const fuel of FUELS) {
    const resource = readProperty(resources, fuel.id);
    const amount = finite(readProperty(resource, "amount"));
    const maximum = finite(readProperty(resource, "max"));
    const rateOfChange = finite(readProperty(resource, "diff"));
    const currentFuelCount = finite(readProperty(plant, fuel.id));
    const display = readProperty(resource, "display");
    const disabledByRace =
      fuel.id === "Lumber" &&
      (Boolean(readProperty(race, "kindling_kindred")) ||
        Boolean(readProperty(race, "smoldering")));
    if (
      amount === undefined ||
      maximum === undefined ||
      rateOfChange === undefined ||
      currentFuelCount === undefined ||
      typeof display !== "boolean"
    ) {
      return Object.freeze({ root, input: emptyInput() });
    }
    fuels.push(
      Object.freeze({
        id: fuel.id,
        storageRatio: maximum > 0 ? amount / maximum : 0,
        rateOfChange,
        currentQuantity: amount,
        isUnlocked: !disabledByRace && display,
        costQuantity: fuel.costQuantity,
        costMinRateOfChange: fuel.costMinRateOfChange,
        currentFuelCount,
      }),
    );
  }

  return Object.freeze({
    root,
    input: Object.freeze({
      initialised: true,
      maxOperating,
      grapheneUseful:
        grapheneDisplay &&
        (grapheneMaximum <= 0 || grapheneAmount / grapheneMaximum < 0.99),
      consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
      fuels: Object.freeze(fuels),
    }),
  });
}

function currentFuelCount(root: unknown, id: string): number | undefined {
  return finite(
    readProperty(
      readProperty(readProperty(root, "interstellar"), "g_factory"),
      id,
    ),
  );
}

function fuelMethod(id: string, direction: "add" | "sub"): string | undefined {
  const fuel = FUELS.find((entry) => entry.id === id);
  return fuel?.[direction];
}

function executeAdjustment(
  dependencies: CapturedGrapheneDependencies,
  root: unknown,
  adjustment: Readonly<GrapheneFuelAdjustment>,
): CommandExecutionOutcome {
  const method = fuelMethod(
    adjustment.fuelId,
    adjustment.delta > 0 ? "add" : "sub",
  );
  const handle = dependencies.controls.resolve(GRAPHENE_CONTROL);
  if (method === undefined || handle === undefined) {
    return stale(
      "graphene-control-missing",
      "captured graphene control is unavailable",
    );
  }
  const count = Math.abs(adjustment.delta);
  for (let index = 0; index < count; index++) {
    if (dependencies.rootState.readRoot() !== root) {
      return stale("graphene-root-changed", "captured game root changed");
    }
    const actual = currentFuelCount(root, adjustment.fuelId);
    if (
      actual !==
      adjustment.expectedCurrentFuelCount +
        (adjustment.delta > 0 ? index : -index)
    ) {
      return stale("graphene-fuel-changed", "graphene fuel allocation changed");
    }
    const result = dependencies.controls.invoke(handle, method);
    if (!result.ok) {
      return rejected(
        "graphene-control-failed",
        result.detail ?? result.reason,
      );
    }
  }
  return SUCCEEDED;
}

export function createCapturedGrapheneAutomation(
  dependencies: CapturedGrapheneDependencies,
): CapturedGrapheneAutomation {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readInput(dependencies);
      const decision = planGraphene(session.input);
      if (!session.input.initialised || decision.length === 0) return SUCCEEDED;
      if (
        JSON.stringify(planGraphene(session.input)) !== JSON.stringify(decision)
      ) {
        return rejected(
          "invalid-graphene-decision",
          "graphene decision changed during planning",
        );
      }
      for (const adjustment of decision.filter((entry) => entry.delta < 0)) {
        const outcome = executeAdjustment(
          dependencies,
          session.root,
          adjustment,
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      for (const adjustment of decision.filter((entry) => entry.delta > 0)) {
        const outcome = executeAdjustment(
          dependencies,
          session.root,
          adjustment,
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      return SUCCEEDED;
    },
  });
}
