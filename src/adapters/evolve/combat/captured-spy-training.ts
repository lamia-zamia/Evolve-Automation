/** Captured training through DeadSpace's own foreign-panel component. */

import type {
  CapturedSpyTrainingDecision,
  CapturedSpyTrainingInput,
} from "../../../domain/combat/captured-spy-training.ts";
import type {
  CapturedSpyTrainingCycle,
  CapturedSpyTrainingExecutor,
  CapturedSpyTrainingReader,
} from "../../../ports/captured-spy-training.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";
import {
  CAPTURED_FOREIGN_CONTROL,
  CAPTURED_FOREIGN_MAX_INDEX,
  capturedForeignGovernmentPrice,
  readCapturedForeignTargets,
  selectCapturedForeignStrategy,
  type CapturedForeignGovernment,
} from "./captured-foreign-state.ts";

interface CapturedSpyTrainingSession {
  readonly root: unknown;
  readonly control: GameControlHandle;
  readonly spyMaximumSetting: number;
  readonly purchaseMoney: number | undefined;
  readonly moneyMaximum: number;
  readonly governments: readonly CapturedForeignGovernment[];
  readonly governmentCount: number;
}

function emptyCapturedSpyTrainingInput(
  index: number,
): CapturedSpyTrainingInput {
  return Object.freeze({
    enabled: false,
    spyMaximumSetting: 0,
    governmentIndex: index,
    visible: false,
    disabled: true,
    policy: "Ignore",
    spyCount: 0,
    training: 0,
    purchaseMoney: undefined,
    moneyMaximum: 0,
    purchasePrice: null,
    occupied: false,
    annexed: false,
    purchased: false,
  });
}

function readBooleanControl(
  controls: GameControlRegistry,
  control: GameControlHandle,
  method: string,
  args: readonly unknown[],
): boolean | undefined {
  const result = controls.invoke(control, method, args);
  return result.ok && typeof result.value === "boolean"
    ? result.value
    : undefined;
}

function readForeignGovernment(
  root: unknown,
  index: number,
): Record<string, unknown> | undefined {
  const civic = readProperty(root, "civic");
  const foreign = readProperty(civic, "foreign");
  const value = readProperty(foreign, `gov${index}`);
  return isRecord(value) && !Array.isArray(value) ? value : undefined;
}

function readTrainingValue(
  government: Record<string, unknown>,
  key: string,
): number {
  // DeadSpace initializes foreign government counters with zero, but old saves can reach the
  // panel before a counter is materialized. The game's own falsy read treats that as zero.
  return finite(government[key]) ?? 0;
}

function readCycleInput(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  settingsValue: unknown,
  readPurchaseMoney: () => number | undefined,
):
  | {
      readonly root: unknown;
      readonly control: GameControlHandle;
      readonly spyMaximumSetting: number;
      readonly purchaseMoney: number | undefined;
      readonly moneyMaximum: number;
      readonly governments: readonly CapturedForeignGovernment[];
      readonly governmentCount: number;
    }
  | undefined {
  const root = rootState.readRoot();
  if (!isRecord(root)) return undefined;
  const control = controls.resolve(CAPTURED_FOREIGN_CONTROL);
  if (control === undefined) return undefined;
  if (
    !control.methods.includes("vis") ||
    !control.methods.includes("gvis") ||
    !control.methods.includes("spy_disabled") ||
    !control.methods.includes("spy")
  ) {
    return undefined;
  }
  if (readBooleanControl(controls, control, "vis", []) !== true) {
    return undefined;
  }
  const tech = readProperty(root, "tech");
  if ((finite(readProperty(tech, "spy")) ?? 0) < 1) return undefined;
  const settings = isRecord(settingsValue) ? settingsValue : {};
  if (settings["foreignTrainSpy"] !== true) return undefined;
  const spyMaximumSetting = finite(settings["foreignSpyMax"]);
  if (spyMaximumSetting === undefined) return undefined;

  let governmentCount = 0;
  for (let index = 0; index <= CAPTURED_FOREIGN_MAX_INDEX; index += 1) {
    const visible = readBooleanControl(controls, control, "gvis", [index]);
    if (visible === undefined) return undefined;
    if (visible) governmentCount = index + 1;
  }
  const targets = readCapturedForeignTargets(root, controls, control, settings);
  const strategy = selectCapturedForeignStrategy(
    root,
    settings,
    targets,
    "spy-manager",
  );
  const needsPurchaseReservation =
    settings["autoFight"] === true &&
    readProperty(tech, "unify") === 1 &&
    strategy.governments.some(
      (government) =>
        government.policy !== "Purchase" && government.spyCount > 0,
    );
  const purchaseMoney = needsPurchaseReservation
    ? finite(readPurchaseMoney())
    : 0;
  const moneyMaximum =
    finite(
      readProperty(
        readProperty(readProperty(root, "resource"), "Money"),
        "max",
      ),
    ) ?? 0;
  return Object.freeze({
    root,
    control,
    spyMaximumSetting,
    purchaseMoney,
    moneyMaximum,
    governments: strategy.governments,
    governmentCount,
  });
}

export interface CapturedSpyTrainingDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readPurchaseMoney: () => number | undefined;
}

export function createCapturedSpyTraining(
  dependencies: CapturedSpyTrainingDependencies,
): {
  readonly reader: CapturedSpyTrainingReader;
  readonly executor: CapturedSpyTrainingExecutor;
} {
  let session: CapturedSpyTrainingSession | undefined;
  let lastInput: CapturedSpyTrainingInput | undefined;

  function readGovernment(
    active: CapturedSpyTrainingSession,
    index: number,
  ): CapturedSpyTrainingInput {
    if (
      index < 0 ||
      index >= active.governmentCount ||
      !Number.isSafeInteger(index)
    ) {
      return emptyCapturedSpyTrainingInput(index);
    }
    const government = readForeignGovernment(active.root, index);
    if (government === undefined) return emptyCapturedSpyTrainingInput(index);
    const policyGovernment = active.governments.find(
      (candidate) => candidate.governmentId === index,
    );
    if (policyGovernment === undefined) {
      return emptyCapturedSpyTrainingInput(index);
    }
    const visible = readBooleanControl(
      dependencies.controls,
      active.control,
      "gvis",
      [index],
    );
    const disabled =
      visible === true
        ? readBooleanControl(
            dependencies.controls,
            active.control,
            "spy_disabled",
            [index],
          )
        : true;
    if (visible === undefined || disabled === undefined) {
      return emptyCapturedSpyTrainingInput(index);
    }
    // Old SpyManager training read the final `foreign.policy`; the shared strategy's policy
    // carries its achievement and target adjustments without re-deriving them here.
    const purchasePrice =
      policyGovernment.policy === "Purchase"
        ? (capturedForeignGovernmentPrice(policyGovernment) ?? null)
        : null;
    return Object.freeze({
      enabled: true,
      spyMaximumSetting: active.spyMaximumSetting,
      governmentIndex: index,
      visible,
      disabled,
      policy: policyGovernment.policy,
      spyCount: readTrainingValue(government, "spy"),
      training: readTrainingValue(government, "trn"),
      purchaseMoney: active.purchaseMoney,
      moneyMaximum: purchasePrice === null ? 0 : active.moneyMaximum,
      purchasePrice,
      occupied: Boolean(government["occ"]),
      annexed: Boolean(government["anx"]),
      purchased: Boolean(government["buy"]),
    });
  }

  const reader: CapturedSpyTrainingReader = Object.freeze({
    readCycle(): CapturedSpyTrainingCycle {
      session = undefined;
      lastInput = undefined;
      const sample = readCycleInput(
        dependencies.rootState,
        dependencies.controls,
        dependencies.readSettings(),
        dependencies.readPurchaseMoney,
      );
      if (sample === undefined)
        return Object.freeze({ available: false, governmentCount: 0 });
      session = Object.freeze(sample);
      return Object.freeze({
        available: true,
        governmentCount: sample.governmentCount,
      });
    },

    readGovernment(index: number): CapturedSpyTrainingInput {
      if (session === undefined) {
        const input = emptyCapturedSpyTrainingInput(index);
        lastInput = input;
        return input;
      }
      const input = readGovernment(session, index);
      lastInput = input;
      return input;
    },
  });

  const executor: CapturedSpyTrainingExecutor = Object.freeze({
    execute(
      decision: Readonly<CapturedSpyTrainingDecision>,
    ): ReturnType<CapturedSpyTrainingExecutor["execute"]> {
      const active = session;
      const sampled = lastInput;
      if (active === undefined || sampled === undefined) {
        return stale(
          "captured-spy-training-session-missing",
          "captured spy-training session is missing",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        return stale(
          "captured-spy-training-root-changed",
          "captured game root changed",
        );
      }
      const currentControl = dependencies.controls.resolve(
        CAPTURED_FOREIGN_CONTROL,
      );
      if (
        currentControl === undefined ||
        currentControl.generation !== active.control.generation
      ) {
        return stale(
          "captured-spy-training-control-changed",
          "captured foreign control changed",
        );
      }
      if (
        decision.kind !== "train-spy" ||
        decision.governmentIndex !== sampled.governmentIndex ||
        decision.expectedSpyCount !== sampled.spyCount ||
        decision.expectedTraining !== sampled.training
      ) {
        return rejected(
          "invalid-captured-spy-training-decision",
          "captured spy-training decision does not match the sample",
        );
      }
      const current = readGovernment(active, decision.governmentIndex);
      if (
        current.governmentIndex !== sampled.governmentIndex ||
        current.visible !== sampled.visible ||
        current.disabled !== sampled.disabled ||
        current.policy !== sampled.policy ||
        current.spyCount !== sampled.spyCount ||
        current.training !== sampled.training ||
        current.spyMaximumSetting !== sampled.spyMaximumSetting ||
        current.purchaseMoney !== sampled.purchaseMoney ||
        current.moneyMaximum !== sampled.moneyMaximum ||
        current.purchasePrice !== sampled.purchasePrice ||
        current.occupied !== sampled.occupied ||
        current.annexed !== sampled.annexed ||
        current.purchased !== sampled.purchased
      ) {
        return stale(
          "captured-spy-training-state-changed",
          "captured foreign government state changed",
        );
      }
      const result = dependencies.controls.invoke(active.control, "spy", [
        decision.governmentIndex,
      ]);
      if (!result.ok) {
        return stale(
          "captured-spy-training-control-failed",
          `captured spy training failed: ${result.reason}`,
        );
      }
      const after = readForeignGovernment(
        dependencies.rootState.readRoot(),
        decision.governmentIndex,
      );
      if ((finite(readProperty(after, "trn")) ?? 0) <= sampled.training) {
        return stale(
          "captured-spy-training-not-started",
          "the game did not start spy training",
        );
      }
      lastInput = undefined;
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
