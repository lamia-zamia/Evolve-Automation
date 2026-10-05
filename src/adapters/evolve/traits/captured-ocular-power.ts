import type {
  OcularPowerDecision,
  OcularPowerInput,
  OcularPowerSetting,
} from "../../../domain/traits/ocular-power.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type {
  OcularPowerControls,
  OcularPowerReader,
} from "../../../ports/ocular-power.ts";
import { CAPTURED_TRAIT_OCULAR } from "./captured-trait-settings-catalog.ts";
import { readCapturedTraitRecessive } from "./captured-trait-recessive.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, readProperty } from "../../validation.ts";

export const CAPTURED_OCULAR_POWER_CONTROL = "ocularPower";
const CAPTURED_OCULAR_POWER_ID_PREFIX = "#ocular";

export interface CapturedOcularPowerDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
  readonly ensureControls: () => boolean;
}

function capturedOcularRace(rootState: GameRootStateSource): unknown {
  return readProperty(rootState.readRoot(), "race");
}

function capturedOcularAvailable(rootState: GameRootStateSource): boolean {
  const race = capturedOcularRace(rootState);
  return Boolean(
    readProperty(race, "ocular_power") &&
    readProperty(race, "ocularPowerConfig"),
  );
}

function capturedOcularCheckbox(document: unknown, powerId: string): unknown {
  const querySelector = readProperty(document, "querySelector");
  if (typeof querySelector !== "function") return undefined;
  try {
    return Reflect.apply(querySelector, document, [
      `${CAPTURED_OCULAR_POWER_ID_PREFIX}${powerId} input[type='checkbox']`,
    ]);
  } catch {
    return undefined;
  }
}

function capturedOcularRankIsSupported(rank: number): boolean {
  return rank >= 0.1 && rank <= 2;
}

function capturedOcularMajorEmpoweredBonus(rank: number): number | undefined {
  if (!capturedOcularRankIsSupported(rank)) return undefined;
  // DeadSpace src/races.js traits.empowered.vars() uses traitScale() with the major-trait
  // endpoints [0.01], [0.2], [0.4], capped at Empowered rank 2.
  const cappedRank = Math.min(2, rank);
  const fraction = cappedRank < 1 ? (cappedRank - 0.1) / 0.9 : cappedRank - 1;
  const start = cappedRank < 1 ? 0.01 : 0.2;
  const end = cappedRank < 1 ? 0.2 : 0.4;
  return finite(Number((start + (end - start) * fraction).toFixed(6)));
}

function capturedOcularCapacityAtRank(rank: number): number {
  // Mirrors traits.ocular_power.vars()'s rankStep(rank, [[0, 1], [1, 2], [1.67, 3]]).
  return rank >= 1.67 ? 3 : rank >= 1 ? 2 : 1;
}

export function readCapturedOcularEffectiveRank(
  root: unknown,
): number | undefined {
  const race = readProperty(root, "race");
  const rawRank = finite(readProperty(race, "ocular_power"));
  if (rawRank === undefined || !capturedOcularRankIsSupported(rawRank))
    return undefined;
  const rawEmpoweredRank = readProperty(race, "empowered");
  if (!rawEmpoweredRank) return rawRank;

  const empoweredRank = finite(rawEmpoweredRank);
  if (empoweredRank === undefined) return undefined;
  const bonus = capturedOcularMajorEmpoweredBonus(empoweredRank);
  if (bonus === undefined) return undefined;
  const recessive = readCapturedTraitRecessive(root, "ocular_power");
  if (recessive === undefined) return undefined;
  if (recessive) return rawRank;
  const effectiveRank = Number((rawRank + bonus).toFixed(6));
  return finite(effectiveRank);
}

function capturedOcularCapacityFromRoot(root: unknown): number {
  const effectiveRank = readCapturedOcularEffectiveRank(root);
  return effectiveRank === undefined
    ? 0
    : capturedOcularCapacityAtRank(effectiveRank);
}

export function createCapturedOcularPowerAutomation(
  dependencies: CapturedOcularPowerDependencies,
): {
  readonly reader: OcularPowerReader;
  readonly controls: OcularPowerControls;
  readonly executor: DecisionExecutor<OcularPowerDecision>;
} {
  const controls: OcularPowerControls = Object.freeze({
    capture(): boolean {
      if (!capturedOcularAvailable(dependencies.rootState)) return false;
      if (!dependencies.ensureControls()) return false;
      const handle = dependencies.controls.resolve(
        CAPTURED_OCULAR_POWER_CONTROL,
      );
      return handle !== undefined && handle.methods.includes("pow");
    },
    current(key: string): boolean | null {
      const power = CAPTURED_TRAIT_OCULAR.find(
        (candidate) => candidate.stateKey === key,
      );
      if (power === undefined) return null;
      const config = readProperty(
        capturedOcularRace(dependencies.rootState),
        "ocularPowerConfig",
      );
      const value = readProperty(config, power.stateKey);
      return typeof value === "boolean" ? value : null;
    },
    toggle(powerId: string): boolean {
      const power = CAPTURED_TRAIT_OCULAR.find(
        (candidate) => candidate.id === powerId,
      );
      if (
        power === undefined ||
        !capturedOcularAvailable(dependencies.rootState) ||
        !dependencies.ensureControls()
      ) {
        return false;
      }
      const handle = dependencies.controls.resolve(
        CAPTURED_OCULAR_POWER_CONTROL,
      );
      if (handle === undefined || !handle.methods.includes("pow")) return false;
      const checkbox = capturedOcularCheckbox(
        dependencies.getDocument(),
        power.id,
      );
      const click = readProperty(checkbox, "click");
      if (typeof click !== "function") return false;
      try {
        Reflect.apply(click, checkbox, []);
      } catch {
        return false;
      }
      // pow() may redraw the panel when it enforces the game's cap. The executor checks the
      // authoritative config after this click, and each later decision resolves the handle again.
      return true;
    },
  });

  const reader: OcularPowerReader = Object.freeze({
    readGate() {
      if (!capturedOcularAvailable(dependencies.rootState)) {
        return Object.freeze({ unlocked: false });
      }
      const ocularSettings = dependencies.readSettings();
      const config = readProperty(
        capturedOcularRace(dependencies.rootState),
        "ocularPowerConfig",
      );
      const hasEnabledPower = CAPTURED_TRAIT_OCULAR.some(
        (power) =>
          readProperty(ocularSettings, `ocularPower_${power.id}`) === true,
      );
      const hasActivePower = CAPTURED_TRAIT_OCULAR.some(
        (power) => readProperty(config, power.stateKey) === true,
      );
      return Object.freeze({
        // With every setting off and no active power, the current state is already reconciled.
        unlocked: hasEnabledPower || hasActivePower,
      });
    },
    readPlan(): OcularPowerInput {
      const root = dependencies.rootState.readRoot();
      const race = readProperty(root, "race");
      if (
        !readProperty(race, "ocular_power") ||
        !readProperty(race, "ocularPowerConfig")
      ) {
        return Object.freeze({ capacity: 0, powers: Object.freeze([]) });
      }
      const rawSettings = dependencies.readSettings();
      const powers: OcularPowerSetting[] = CAPTURED_TRAIT_OCULAR.map(
        (power) => {
          const rawPriority = readProperty(
            rawSettings,
            `ocularPower_p_${power.id}`,
          );
          const priority = finite(Number(rawPriority)) ?? 0;
          return Object.freeze({
            key: power.stateKey,
            id: power.id,
            enabled:
              readProperty(rawSettings, `ocularPower_${power.id}`) === true,
            priority,
          });
        },
      );
      return Object.freeze({
        capacity: capturedOcularCapacityFromRoot(root),
        powers: Object.freeze(powers),
      });
    },
  });

  const executor: DecisionExecutor<OcularPowerDecision> = Object.freeze({
    execute(ocularPowerDecision: Readonly<OcularPowerDecision>) {
      const power = CAPTURED_TRAIT_OCULAR.find(
        (candidate) =>
          candidate.stateKey === ocularPowerDecision.key &&
          candidate.id === ocularPowerDecision.id,
      );
      if (
        power === undefined ||
        typeof ocularPowerDecision.enabled !== "boolean"
      ) {
        return stale(
          "ocular-decision-invalid",
          "ocular power decision is invalid",
        );
      }
      if (!capturedOcularAvailable(dependencies.rootState)) {
        return stale("ocular-power-locked", "ocular powers became unavailable");
      }
      const current = controls.current(power.stateKey);
      if (current === ocularPowerDecision.enabled) return SUCCEEDED;
      if (current === null || !controls.toggle(power.id)) {
        return stale(
          "ocular-controls-unavailable",
          `ocular power ${power.id} control is unavailable`,
        );
      }
      return controls.current(power.stateKey) === ocularPowerDecision.enabled
        ? SUCCEEDED
        : stale(
            "ocular-postcondition-failed",
            `the game did not set ocular power ${power.id}`,
          );
    },
  });

  return Object.freeze({ reader, controls, executor });
}
