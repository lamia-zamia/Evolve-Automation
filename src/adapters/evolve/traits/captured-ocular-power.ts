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

function capturedOcularCapacity(controls: GameControlRegistry): number {
  const handle = controls.resolve(CAPTURED_OCULAR_POWER_CONTROL);
  if (handle === undefined || !handle.methods.includes("max")) return 0;
  const result = controls.invoke(handle, "max");
  if (!result.ok || typeof result.value !== "string") return 0;
  // `ocularPower.max()` is the game's computed display value and passes active count and capacity
  // to localization. Accept the current localized text only when those are its sole numbers.
  const counts = result.value.match(/\d+/g);
  if (counts === null || counts.length !== 2) return 0;
  const capacity = Number(counts[1]);
  return Number.isSafeInteger(capacity) && capacity >= 0 ? capacity : 0;
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
      return handle !== undefined && handle.methods.includes("max");
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
      if (handle === undefined || !handle.methods.includes("max")) return false;
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
      if (!capturedOcularAvailable(dependencies.rootState)) {
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
        capacity: capturedOcularCapacity(dependencies.controls),
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
