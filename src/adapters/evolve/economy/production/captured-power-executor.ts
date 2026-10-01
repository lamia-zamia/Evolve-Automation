import type {
  PowerDecision,
  PowerOperation,
} from "../../../../domain/economy/production/power.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { CapturedGameMechanics } from "../../../../ports/captured-game-mechanics.ts";
import { readCapturedSemanticBuildingStates } from "../../progression/build/captured-building-availability.ts";

export interface CapturedPowerExecutorDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly mechanics: CapturedGameMechanics;
  readonly readMechSaveSupply: () => boolean;
  readonly setMechSaveSupply: (expected: boolean, value: boolean) => boolean;
  readonly log: (message: string) => void;
}

const capturedPowerExecutionSuccess: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});
function capturedPowerExecutionStale(message: string): CommandExecutionOutcome {
  return {
    status: "stale",
    failure: { code: "captured-power-stale", message },
  };
}

/** Adapter-owned switches; resource/model/description commands remain automation bookkeeping. */
export function createCapturedPowerExecutor(
  dependencies: CapturedPowerExecutorDependencies,
): {
  readonly executor: DecisionExecutor<PowerDecision>;
  readonly readDescription: (binding: string) => string | undefined;
} {
  const descriptions = new Map<string, string>();
  const resourceRates = new Map<string, number>();
  const powerModels = new Map<string, number>();
  let generation = 0;
  dependencies.rootState.subscribeRootReplaced(() => {
    generation++;
    descriptions.clear();
    resourceRates.clear();
    powerModels.clear();
  });
  const sample = () =>
    readCapturedSemanticBuildingStates(
      dependencies.rootState.readRoot(),
      dependencies.controls,
      dependencies.mechanics,
    );
  const executor: DecisionExecutor<PowerDecision> = Object.freeze({
    execute(decision: Readonly<PowerDecision>): CommandExecutionOutcome {
      const initialGeneration = generation;
      const root = dependencies.rootState.readRoot();
      const buildings = sample();
      if (buildings === undefined)
        return capturedPowerExecutionStale(
          "Building qualification unavailable",
        );
      const expectedBuildings =
        decision.kind === "apply-power-cycle"
          ? decision.expectedBuildings
          : [{ id: decision.buildingId, binding: decision.binding }];
      if (
        expectedBuildings.some(
          (expected) =>
            !buildings.some(
              (building) =>
                building.catalog.id === expected.id &&
                building.catalog.binding === expected.binding &&
                building.available &&
                building.hasState,
            ),
        )
      )
        return capturedPowerExecutionStale("Building binding changed");
      const operations: readonly PowerOperation[] =
        decision.kind === "apply-power-cycle"
          ? decision.operations
          : [
              {
                kind: "adjust-building",
                buildingId: decision.buildingId,
                binding: decision.binding,
                expectedStateOn: decision.expectedStateOn,
                amount: -1,
              },
            ];
      // Validate every planned adjustment before issuing the first effect, including repeated bindings.
      const plannedOn = new Map(
        buildings.map((building) => [
          building.catalog.binding,
          building.stateOn,
        ]),
      );
      let plannedMechSaveSupply = dependencies.readMechSaveSupply();
      for (const operation of operations) {
        if (operation.kind === "set-mech-save-supply") {
          if (plannedMechSaveSupply !== operation.expected)
            return capturedPowerExecutionStale(
              "Planned Mech supply state changed",
            );
          plannedMechSaveSupply = operation.value;
        }
        if (operation.kind !== "adjust-building") continue;
        const building = buildings.find(
          (candidate) =>
            candidate.catalog.binding === operation.binding &&
            candidate.catalog.id === operation.buildingId,
        );
        if (
          building === undefined ||
          !building.available ||
          !building.hasState ||
          plannedOn.get(operation.binding) !== operation.expectedStateOn ||
          !Number.isSafeInteger(operation.amount) ||
          operation.expectedStateOn + operation.amount < 0
        )
          return capturedPowerExecutionStale("Planned switch state changed");
        plannedOn.set(
          operation.binding,
          operation.expectedStateOn + operation.amount,
        );
        if (building.structure === undefined)
          return capturedPowerExecutionStale("Switch definition unavailable");
        const ready = dependencies.mechanics.adjustPower(
          root,
          building.structure.entryKey,
          operation.expectedStateOn,
          operation.expectedStateOn + operation.amount,
          () =>
            generation === initialGeneration &&
            dependencies.rootState.readRoot() === root,
          true,
        );
        if (ready.kind !== "value" || !ready.value)
          return capturedPowerExecutionStale("Switch mechanics unavailable");
      }
      for (const operation of operations) {
        if (
          generation !== initialGeneration ||
          dependencies.rootState.readRoot() !== root
        )
          return capturedPowerExecutionStale("Game generation changed");
        if (operation.kind === "adjust-building") {
          const current = sample()?.find(
            (candidate) =>
              candidate.catalog.binding === operation.binding &&
              candidate.catalog.id === operation.buildingId,
          );
          if (
            current === undefined ||
            !current.available ||
            !current.hasState ||
            current.stateOn !== operation.expectedStateOn ||
            current.structure === undefined
          )
            return capturedPowerExecutionStale("Switch state changed");
          const target = operation.expectedStateOn + operation.amount;
          const outcome = dependencies.mechanics.adjustPower(
            root,
            current.structure.entryKey,
            operation.expectedStateOn,
            target,
            () =>
              generation === initialGeneration &&
              dependencies.rootState.readRoot() === root,
          );
          const after = sample()?.find(
            (candidate) =>
              candidate.catalog.binding === operation.binding &&
              candidate.catalog.id === operation.buildingId,
          );
          if (
            outcome.kind !== "value" ||
            !outcome.value ||
            generation !== initialGeneration ||
            dependencies.rootState.readRoot() !== root ||
            after === undefined ||
            !after.available ||
            !after.hasState ||
            after.stateOn !== target
          )
            return capturedPowerExecutionStale(
              "Switch did not reach planned state",
            );
        } else if (operation.kind === "set-mech-save-supply") {
          if (dependencies.readMechSaveSupply() !== operation.expected)
            return capturedPowerExecutionStale("Mech supply state changed");
          if (
            !dependencies.setMechSaveSupply(operation.expected, operation.value)
          )
            return capturedPowerExecutionStale(
              "Mech supply reservation changed",
            );
        } else if (operation.kind === "set-description")
          descriptions.set(operation.binding, operation.value);
        else if (operation.kind === "set-resource-rate")
          resourceRates.set(operation.resourceId, operation.value);
        else if (operation.kind === "set-power-model")
          powerModels.set(operation.resourceId, operation.value);
        else dependencies.log(operation.message);
      }
      return capturedPowerExecutionSuccess;
    },
  });
  return Object.freeze({
    executor,
    readDescription: (binding: string) => descriptions.get(binding),
  });
}
