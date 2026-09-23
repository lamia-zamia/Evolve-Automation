/** Captures the next Mech resource target, including the game's current user blueprint price. */

import { planCapturedMechScrap } from "../../../domain/combat/captured-mech.ts";
import { planMechDemandCosts } from "../../../domain/combat/mech-auto-choice.ts";
import {
  readCapturedMechState,
  withCapturedMechReservations,
  type CapturedMechReservedResources,
} from "../../../domain/combat/mech-state.ts";
import type { CapturedMechDemandSource } from "../../../ports/captured-mech.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { CAPTURED_MECH_ASSEMBLY_CONTROL } from "./captured-mech-control-ids.ts";
import { finite } from "../../validation.ts";

export interface CapturedMechDemandDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readCanExpandBay?: () => boolean | undefined;
}

function readCapturedUserMechCost(
  state: ReturnType<typeof readCapturedMechState>,
  controls: GameControlRegistry,
): Readonly<{ supply: number; gems: number; space: number }> | undefined {
  const blueprint = state.blueprint;
  if (
    !state.available ||
    !state.settings.autoMech ||
    state.settings.buildMode !== "user" ||
    blueprint === null ||
    blueprint.infernal
  ) {
    return undefined;
  }
  const control = controls.resolve(CAPTURED_MECH_ASSEMBLY_CONTROL);
  if (
    control === undefined ||
    !control.methods.includes("build") ||
    !control.methods.includes("bay") ||
    !control.methods.includes("price") ||
    !control.methods.includes("soul")
  ) {
    return undefined;
  }
  const readCostPart = (method: string): number | undefined => {
    const result = controls.invoke(control, method, [blueprint.size]);
    return result.ok ? finite(result.value) : undefined;
  };
  const space = readCostPart("bay");
  const supply = readCostPart("price");
  const gems = readCostPart("soul");
  if (
    space === undefined ||
    space <= 0 ||
    supply === undefined ||
    supply < 0 ||
    gems === undefined ||
    gems < 0
  ) {
    return undefined;
  }
  return Object.freeze({ space, supply, gems });
}

export function createCapturedMechDemandSource(
  dependencies: CapturedMechDemandDependencies,
): CapturedMechDemandSource {
  const { rootState, controls, readSettings } = dependencies;
  return Object.freeze({
    read(
      reserved: Readonly<CapturedMechReservedResources> = {
        supply: 0,
        soulGems: 0,
      },
    ) {
      const root = rootState.readRoot();
      const settings = readSettings();
      // The queued-build reservation covers a build admitted with the queue key held. This target
      // describes the next automatic build regardless of that transient, matching the old demand
      // sample's explicit unheld queue-key assumption.
      const state = withCapturedMechReservations(
        readCapturedMechState({
          root,
          settings,
          queueKeyHeld: false,
        }),
        reserved,
      );
      const userBuildCost = readCapturedUserMechCost(state, controls);
      const candidatePlan = planMechDemandCosts({
        state,
        ...(userBuildCost === undefined ? {} : { userBuildCost }),
      });
      const headroom = state.bay.maximum - state.bay.occupied;
      const immediatePlan =
        candidatePlan.status === "ready" && candidatePlan.cost.space <= headroom
          ? candidatePlan
          : Object.freeze({ status: "none" as const });
      let plan = candidatePlan;
      if (
        candidatePlan.status === "ready" &&
        candidatePlan.cost.space > headroom
      ) {
        const canExpandBay = dependencies.readCanExpandBay?.();
        const replacement =
          state.settings.buildMode === "random" && canExpandBay === false
            ? planCapturedMechScrap(state, () => 0, canExpandBay)
            : null;
        if (replacement === null) {
          plan = Object.freeze({ status: "none" });
        }
      }
      return Object.freeze({
        buildingMechsFirst: state.settings.buildingsFirst,
        plan,
        immediatePlan,
      });
    },
  });
}
