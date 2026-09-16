/** Captured DeadSpace foreign espionage controls and postcondition checks. */

import {
  capturedEspionageOperationForPolicy,
  type CapturedEspionageInput,
  type CapturedEspionageOperation,
} from "../../../domain/combat/captured-espionage.ts";
import type {
  CapturedEspionageExecutor,
  CapturedEspionageReader,
} from "../../../ports/captured-espionage.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameActivitySink } from "../../../ports/game-message-log.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";
import {
  CAPTURED_FOREIGN_CONTROL,
  CAPTURED_FOREIGN_MAX_INDEX,
  capturedForeignEspionageTriggerSelector,
  capturedForeignEspionageUseful,
  capturedForeignOperationMethod,
  readCapturedForeignGovernment,
  readCapturedForeignTargets,
  selectCapturedForeignStrategy,
  type CapturedForeignGovernment,
} from "./captured-foreign-state.ts";
import type { CapturedEspionageDecision } from "../../../domain/combat/captured-espionage.ts";

const CAPTURED_ESPIONAGE_MODAL = "espModal";
const CAPTURED_ESPIONAGE_FOREIGN_METHODS = [
  "vis",
  "gvis",
  "trigModal",
  "spy_disabled",
  "spy",
] as const;
const CAPTURED_ESPIONAGE_MODAL_METHODS = [
  "influence",
  "sabotage",
  "incite",
  "annex",
  "purchase",
] as const;
// Buefy's trigger polls for #modalBox asynchronously; bound missed captures so a hidden modal
// cannot keep autoFight busy forever.
const CAPTURED_ESPIONAGE_MODAL_OPENING_MAX_CYCLES = 3;
const CAPTURED_ESPIONAGE_ACTIVE_MODAL_SELECTOR = ".modal.is-active";
const CAPTURED_ESPIONAGE_MODAL_BACKGROUND_SELECTOR = ".modal-background";

interface CapturedEspionageModalLifecycle {
  readonly cleanup: () => void;
}

interface CapturedEspionageSample {
  readonly root: unknown;
  readonly foreign: GameControlHandle;
  readonly modal: GameControlHandle | undefined;
  readonly modalLifecycle: CapturedEspionageModalLifecycle | undefined;
  readonly modalGovernmentId: number | undefined;
  readonly modalToReplace: GameControlHandle | undefined;
  readonly target: CapturedForeignGovernment;
  readonly input: CapturedEspionageInput;
}

interface CapturedEspionagePending {
  readonly root: unknown;
  readonly foreign: GameControlHandle;
  readonly target: CapturedForeignGovernment;
  readonly operation: CapturedEspionageOperation;
  readonly governmentId: number;
  readonly military: number;
  readonly hostility: number | undefined;
  readonly unrest: number | undefined;
  readonly annexed: boolean;
  readonly purchased: boolean;
}

interface CapturedEspionageModalOpening {
  readonly root: unknown;
  readonly foreign: GameControlHandle;
  readonly governmentId: number;
  readonly previousModal: GameControlHandle | undefined;
  readonly modalLifecycle: CapturedEspionageModalLifecycle | undefined;
  readonly waitedCycles: number;
}

export interface CapturedEspionageDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  /** The page document is used only to click the game-owned modal trigger. */
  readonly getDocument?: () => unknown;
  /** Opens the modal through a genuinely mounted Foreign component when its panel is off-tab. */
  readonly ensureForeignModal?: (governmentId: number) => boolean;
  readonly onActivity?: GameActivitySink;
}

function capturedEspionageForeignGovernment(
  root: unknown,
  governmentId: number,
): Record<string, unknown> | undefined {
  const value = readProperty(
    readProperty(readProperty(root, "civic"), "foreign"),
    `gov${governmentId}`,
  );
  return isRecord(value) && !Array.isArray(value) ? value : undefined;
}

function capturedEspionageControl(
  controls: GameControlRegistry,
  elementId: string,
  methods: readonly string[],
): GameControlHandle | undefined {
  const control = controls.resolve(elementId);
  return control !== undefined &&
    methods.every((method) => control.methods.includes(method))
    ? control
    : undefined;
}

function capturedEspionageState(
  root: unknown,
  governmentId: number,
):
  | {
      readonly military: number | undefined;
      readonly spyCount: number;
      readonly sabotageProgress: number;
      readonly hostility: number | undefined;
      readonly unrest: number | undefined;
      readonly annexed: boolean;
      readonly purchased: boolean;
      readonly action: string | undefined;
    }
  | undefined {
  const government = capturedEspionageForeignGovernment(root, governmentId);
  if (government === undefined) return undefined;
  return Object.freeze({
    military: finite(government["mil"]),
    spyCount: finite(government["spy"]) ?? 0,
    sabotageProgress: finite(government["sab"]) ?? 0,
    hostility: finite(government["hstl"]),
    unrest: finite(government["unrest"]),
    annexed: Boolean(government["anx"]),
    purchased: Boolean(government["buy"]),
    action:
      typeof government["act"] === "string" ? government["act"] : undefined,
  });
}

function capturedEspionageModalGovernmentId(
  root: unknown,
  modal: GameControlHandle,
): number | undefined {
  const data = modal.data;
  if (data === undefined) return undefined;
  for (
    let governmentId = 0;
    governmentId <= CAPTURED_FOREIGN_MAX_INDEX;
    governmentId += 1
  ) {
    if (data === capturedEspionageForeignGovernment(root, governmentId)) {
      return governmentId;
    }
  }
  return undefined;
}

function capturedEspionageTarget(
  root: unknown,
  target: CapturedForeignGovernment,
): CapturedForeignGovernment | undefined {
  return readCapturedForeignGovernment(
    root,
    target.governmentId,
    target.policy,
    target.rank,
    target.espionagePolicy,
  );
}

function capturedEspionageInput(
  root: unknown,
  target: CapturedForeignGovernment,
): CapturedEspionageInput {
  const operation = capturedEspionageOperationForPolicy(
    target.espionagePolicy,
    target.military,
    target.hostility,
  );
  return Object.freeze({
    enabled: true,
    governmentId: target.governmentId,
    policy: target.espionagePolicy,
    spyCount: target.spyCount,
    sabotageProgress: target.sabotageProgress,
    military: target.military,
    hostility: target.hostility,
    unrest: target.unrest,
    occupied: target.occupied,
    annexed: target.annexed,
    purchased: target.purchased,
    useful:
      operation !== null &&
      capturedForeignEspionageUseful(root, target, operation),
  });
}

function capturedEspionageEmptyInput(): CapturedEspionageInput {
  return Object.freeze({
    enabled: false,
    governmentId: -1,
    policy: "Ignore",
    spyCount: 0,
    sabotageProgress: 0,
    military: 0,
    hostility: undefined,
    unrest: undefined,
    occupied: false,
    annexed: false,
    purchased: false,
    useful: false,
  });
}

function capturedEspionageActiveModals(
  document: unknown,
): readonly unknown[] | undefined {
  const querySelectorAll = readProperty(document, "querySelectorAll");
  if (typeof querySelectorAll !== "function") return undefined;
  let result: unknown;
  try {
    result = Reflect.apply(querySelectorAll, document, [
      CAPTURED_ESPIONAGE_ACTIVE_MODAL_SELECTOR,
    ]);
  } catch {
    return undefined;
  }
  const length = finite(readProperty(result, "length"));
  if (length === undefined || !Number.isSafeInteger(length) || length < 0) {
    return undefined;
  }
  const modals: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const modal = readProperty(result, String(index));
    if (modal !== undefined && modal !== null) modals.push(modal);
  }
  return Object.freeze(modals);
}

function capturedEspionageNewModalLifecycle(
  document: unknown,
  previousModals: readonly unknown[] | undefined,
): CapturedEspionageModalLifecycle | undefined {
  if (previousModals === undefined) return undefined;
  const activeModals = capturedEspionageActiveModals(document);
  if (activeModals === undefined) return undefined;
  const previous = new Set(previousModals);
  const modal = activeModals.find((candidate) => !previous.has(candidate));
  if (modal === undefined) return undefined;
  const style = readProperty(modal, "style");
  if (!isRecord(style)) return undefined;
  try {
    Reflect.set(style, "visibility", "hidden");
  } catch {
    return undefined;
  }

  let cleaned = false;
  return Object.freeze({
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      const querySelector = readProperty(modal, "querySelector");
      if (typeof querySelector === "function") {
        try {
          const background = Reflect.apply(querySelector, modal, [
            CAPTURED_ESPIONAGE_MODAL_BACKGROUND_SELECTOR,
          ]);
          const click = readProperty(background, "click");
          if (typeof click === "function") {
            Reflect.apply(click, background, []);
            return;
          }
        } catch {
          // Fall through to removing a modal that could not close itself.
        }
      }
      const remove = readProperty(modal, "remove");
      if (typeof remove === "function") {
        try {
          Reflect.apply(remove, modal, []);
        } catch {
          // The modal is already gone or its owner rejected the removal.
        }
      }
    },
  });
}

function capturedEspionagePostconditionChanged(
  operation: CapturedEspionageOperation,
  before: CapturedEspionagePending,
  after: NonNullable<ReturnType<typeof capturedEspionageState>>,
): boolean {
  switch (operation) {
    case "influence":
      return (
        after.hostility !== undefined &&
        before.hostility !== undefined &&
        after.hostility < before.hostility
      );
    case "sabotage":
      return after.military !== undefined && after.military < before.military;
    case "incite":
      return (
        after.unrest !== undefined &&
        before.unrest !== undefined &&
        after.unrest > before.unrest
      );
    case "annex":
      return !before.annexed && after.annexed;
    case "purchase":
      return !before.purchased && after.purchased;
  }
}

function capturedEspionageActivity(
  operation: CapturedEspionageOperation,
  governmentId: number,
): Readonly<Parameters<GameActivitySink>[0]> {
  return Object.freeze({
    message: `Performed ${operation} against foreign power ${governmentId + 1}`,
    color: "success",
    tags: Object.freeze(["combat"]),
  });
}

export function createCapturedEspionage(
  dependencies: CapturedEspionageDependencies,
): {
  readonly reader: CapturedEspionageReader;
  readonly executor: CapturedEspionageExecutor;
  readonly isBusy: () => boolean;
} {
  const reportActivity = dependencies.onActivity ?? (() => {});
  let sample: CapturedEspionageSample | undefined;
  let pending: CapturedEspionagePending | undefined;
  let opening: CapturedEspionageModalOpening | undefined;
  let cycleAction = false;

  function completePending(root: unknown): boolean {
    const active = pending;
    if (active === undefined) return false;
    if (root !== active.root) {
      pending = undefined;
      return false;
    }
    const currentForeign = dependencies.controls.resolve(
      CAPTURED_FOREIGN_CONTROL,
    );
    if (
      currentForeign === undefined ||
      currentForeign.generation !== active.foreign.generation
    ) {
      pending = undefined;
      return false;
    }
    const state = capturedEspionageState(root, active.governmentId);
    if (state === undefined) return false;
    // DeadSpace starts every espionage operation by setting sab/act and only applies its result
    // when the sab timer reaches zero. A foreign military change during that interval is not this
    // operation's completion.
    if (state.sabotageProgress > 0) return false;
    if (
      capturedEspionagePostconditionChanged(active.operation, active, state)
    ) {
      pending = undefined;
      reportActivity(
        capturedEspionageActivity(active.operation, active.governmentId),
      );
      return true;
    }
    pending = undefined;
    return false;
  }

  function discardCapturedEspionageSample(): void {
    const activeSample = sample;
    sample = undefined;
    activeSample?.modalLifecycle?.cleanup();
  }

  const reader: CapturedEspionageReader = Object.freeze({
    read(): CapturedEspionageInput {
      discardCapturedEspionageSample();
      cycleAction = false;
      const root = dependencies.rootState.readRoot();
      if (!isRecord(root)) return capturedEspionageEmptyInput();
      const pendingCompleted = completePending(root);
      if (pending !== undefined || pendingCompleted) {
        return capturedEspionageEmptyInput();
      }

      let modalFromOpening: GameControlHandle | undefined;
      let modalLifecycleFromOpening:
        CapturedEspionageModalLifecycle | undefined;
      let modalGovernmentId: number | undefined;
      let lifecycleTransferred = false;
      try {
        if (opening !== undefined) {
          const activeOpening = opening;
          if (
            activeOpening.root !== root ||
            dependencies.controls.resolve(CAPTURED_FOREIGN_CONTROL)
              ?.generation !== activeOpening.foreign.generation
          ) {
            activeOpening.modalLifecycle?.cleanup();
            opening = undefined;
            cycleAction = true;
            return capturedEspionageEmptyInput();
          } else {
            const currentModal = capturedEspionageControl(
              dependencies.controls,
              CAPTURED_ESPIONAGE_MODAL,
              CAPTURED_ESPIONAGE_MODAL_METHODS,
            );
            if (
              currentModal === undefined ||
              (activeOpening.previousModal !== undefined &&
                currentModal.generation ===
                  activeOpening.previousModal.generation)
            ) {
              const waitedCycles = activeOpening.waitedCycles + 1;
              if (waitedCycles >= CAPTURED_ESPIONAGE_MODAL_OPENING_MAX_CYCLES) {
                activeOpening.modalLifecycle?.cleanup();
                opening = undefined;
                cycleAction = true;
                return capturedEspionageEmptyInput();
              }
              opening = Object.freeze({ ...activeOpening, waitedCycles });
              return capturedEspionageEmptyInput();
            }
            modalFromOpening = currentModal;
            modalLifecycleFromOpening = activeOpening.modalLifecycle;
            modalGovernmentId = activeOpening.governmentId;
            opening = undefined;
          }
        }

        const settingsValue = dependencies.readSettings();
        const settings = isRecord(settingsValue) ? settingsValue : {};
        const foreign = capturedEspionageControl(
          dependencies.controls,
          CAPTURED_FOREIGN_CONTROL,
          CAPTURED_ESPIONAGE_FOREIGN_METHODS,
        );
        if (foreign === undefined) return capturedEspionageEmptyInput();
        const visible = dependencies.controls.invoke(foreign, "vis");
        const tech = finite(
          readProperty(root, "tech") &&
            readProperty(readProperty(root, "tech"), "spy"),
        );
        if (!visible.ok || visible.value !== true || (tech ?? 0) < 2) {
          return capturedEspionageEmptyInput();
        }
        const targets = readCapturedForeignTargets(
          root,
          dependencies.controls,
          foreign,
          settings,
        );
        const strategy = selectCapturedForeignStrategy(root, settings, targets);
        if (strategy.selectedTargetId === null)
          return capturedEspionageEmptyInput();
        const target = strategy.governments.find(
          (candidate) => candidate.governmentId === strategy.selectedTargetId,
        );
        if (target === undefined) return capturedEspionageEmptyInput();
        let modal =
          modalFromOpening ??
          capturedEspionageControl(
            dependencies.controls,
            CAPTURED_ESPIONAGE_MODAL,
            CAPTURED_ESPIONAGE_MODAL_METHODS,
          );
        let modalToReplace: GameControlHandle | undefined;
        const capturedModalGovernmentId =
          modal === undefined
            ? undefined
            : capturedEspionageModalGovernmentId(root, modal);
        if (
          modal !== undefined &&
          ((capturedModalGovernmentId !== undefined &&
            capturedModalGovernmentId !== target.governmentId) ||
            (capturedModalGovernmentId === undefined &&
              modalFromOpening === undefined) ||
            (modalFromOpening !== undefined &&
              modalGovernmentId !== target.governmentId))
        ) {
          if (modalFromOpening !== undefined) {
            modalLifecycleFromOpening?.cleanup();
            modalLifecycleFromOpening = undefined;
          }
          modalToReplace = modal;
          modal = undefined;
          modalGovernmentId = undefined;
        } else if (modal !== undefined) {
          modalGovernmentId =
            capturedModalGovernmentId ??
            modalGovernmentId ??
            target.governmentId;
        }
        const input = capturedEspionageInput(root, target);
        sample = Object.freeze({
          root,
          foreign,
          modal,
          modalLifecycle: modalLifecycleFromOpening,
          modalGovernmentId,
          modalToReplace,
          target,
          input,
        });
        lifecycleTransferred = true;
        return input;
      } finally {
        if (!lifecycleTransferred) modalLifecycleFromOpening?.cleanup();
      }
    },
  });

  const executor: CapturedEspionageExecutor = Object.freeze({
    execute(decision: Readonly<CapturedEspionageDecision>) {
      const active = sample;
      if (active === undefined) {
        return stale(
          "captured-espionage-session-missing",
          "captured espionage session is missing",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        return stale(
          "captured-espionage-root-changed",
          "captured game root changed",
        );
      }
      const currentForeign = dependencies.controls.resolve(
        CAPTURED_FOREIGN_CONTROL,
      );
      if (
        currentForeign === undefined ||
        currentForeign.generation !== active.foreign.generation
      ) {
        return stale(
          "captured-espionage-foreign-changed",
          "captured foreign control changed",
        );
      }
      if (
        active.modal !== undefined &&
        active.modalGovernmentId !== decision.governmentId
      ) {
        return stale(
          "captured-espionage-modal-target-changed",
          "captured espionage modal targets a different government",
        );
      }
      if (
        decision.kind !== "captured-espionage" ||
        decision.governmentId !== active.input.governmentId ||
        decision.expectedSpyCount !== active.input.spyCount ||
        decision.expectedSabotageProgress !== active.input.sabotageProgress ||
        decision.expectedMilitary !== active.input.military ||
        decision.expectedHostility !== active.input.hostility ||
        decision.expectedUnrest !== active.input.unrest ||
        decision.expectedOccupied !== active.input.occupied ||
        decision.expectedAnnexed !== active.input.annexed ||
        decision.expectedPurchased !== active.input.purchased
      ) {
        return rejected(
          "invalid-captured-espionage-decision",
          "captured espionage decision does not match the sample",
        );
      }
      const currentTarget = capturedEspionageTarget(active.root, active.target);
      const currentState = capturedEspionageState(
        active.root,
        decision.governmentId,
      );
      const settingsValue = dependencies.readSettings();
      const settings = isRecord(settingsValue) ? settingsValue : {};
      const currentTargets = readCapturedForeignTargets(
        active.root,
        dependencies.controls,
        currentForeign,
        settings,
      );
      const currentStrategy = selectCapturedForeignStrategy(
        active.root,
        settings,
        currentTargets,
      );
      const currentStrategyTarget = currentStrategy.governments.find(
        (candidate) =>
          candidate.governmentId === currentStrategy.selectedTargetId,
      );
      const currentInput =
        currentStrategyTarget === undefined
          ? undefined
          : capturedEspionageInput(active.root, currentStrategyTarget);
      if (
        currentTarget === undefined ||
        currentState === undefined ||
        currentStrategyTarget === undefined ||
        currentInput === undefined ||
        currentStrategy.selectedTargetId !== active.target.governmentId ||
        currentStrategyTarget.governmentId !== active.target.governmentId ||
        currentTarget.governmentId !== active.target.governmentId ||
        currentTarget.policy !== active.target.policy ||
        currentTarget.espionagePolicy !== active.target.espionagePolicy ||
        currentInput.policy !== active.input.policy ||
        currentInput.useful !== active.input.useful ||
        currentState.spyCount !== active.input.spyCount ||
        currentState.sabotageProgress !== active.input.sabotageProgress ||
        currentState.military !== active.input.military ||
        currentState.hostility !== active.input.hostility ||
        currentState.unrest !== active.input.unrest ||
        currentState.annexed !== active.input.annexed ||
        currentState.purchased !== active.input.purchased
      ) {
        return stale(
          "captured-espionage-state-changed",
          "captured foreign espionage state changed",
        );
      }
      const expected = capturedEspionageOperationForPolicy(
        active.input.policy,
        active.input.military,
        active.input.hostility,
      );
      if (expected !== decision.operation || !active.input.useful) {
        return rejected(
          "invalid-captured-espionage-plan",
          "captured espionage plan is no longer useful",
        );
      }

      sample = undefined;
      const modal = active.modal;
      if (modal === undefined) {
        let opened = false;
        const document = dependencies.getDocument?.();
        const previousModals = capturedEspionageActiveModals(document);
        // DeadSpace closes `.modal-background` globally after espionage actions, so never coexist
        // with a player-owned modal.
        if (previousModals !== undefined && previousModals.length > 0) {
          cycleAction = true;
          return stale(
            "captured-espionage-modal-conflict",
            "another modal is active; espionage is deferred",
          );
        }
        const trigger =
          isRecord(document) && typeof document["querySelector"] === "function"
            ? document["querySelector"](
                capturedForeignEspionageTriggerSelector(decision.governmentId),
              )
            : undefined;
        if (isRecord(trigger) && typeof trigger["click"] === "function") {
          Reflect.apply(
            trigger["click"] as (...args: unknown[]) => unknown,
            trigger,
            [],
          );
          opened = true;
        } else if (dependencies.ensureForeignModal?.(decision.governmentId)) {
          opened = true;
        }
        if (!opened) {
          return stale(
            "captured-espionage-modal-trigger-missing",
            "the game-owned espionage modal trigger is not mounted",
          );
        }
        const modalLifecycle = capturedEspionageNewModalLifecycle(
          document,
          previousModals,
        );
        cycleAction = true;
        const openingForeign =
          dependencies.controls.resolve(CAPTURED_FOREIGN_CONTROL) ??
          active.foreign;
        opening = Object.freeze({
          root: active.root,
          foreign: openingForeign,
          governmentId: decision.governmentId,
          previousModal: active.modalToReplace,
          modalLifecycle,
          waitedCycles: 0,
        });
        return stale(
          "captured-espionage-modal-pending",
          "the game is still opening the espionage modal",
        );
      }

      if (
        modal.generation !==
        dependencies.controls.resolve(modal.elementId)?.generation
      ) {
        return stale(
          "captured-espionage-modal-changed",
          "captured espionage modal changed",
        );
      }
      const result = dependencies.controls.invoke(
        modal,
        capturedForeignOperationMethod(decision.operation),
        [decision.governmentId],
      );
      cycleAction = true;
      if (!result.ok) {
        active.modalLifecycle?.cleanup();
        return stale(
          "captured-espionage-operation-failed",
          `captured espionage operation failed: ${result.reason}`,
        );
      }
      const after = capturedEspionageState(active.root, decision.governmentId);
      if (after === undefined) {
        active.modalLifecycle?.cleanup();
        return stale(
          "captured-espionage-postcondition-unreadable",
          "the foreign espionage postcondition is unreadable",
        );
      }
      const baseline: CapturedEspionagePending = Object.freeze({
        root: active.root,
        foreign: active.foreign,
        target: active.target,
        operation: decision.operation,
        governmentId: decision.governmentId,
        military: active.input.military,
        hostility: active.input.hostility,
        unrest: active.input.unrest,
        annexed: active.input.annexed,
        purchased: active.input.purchased,
      });
      if (
        capturedEspionagePostconditionChanged(
          decision.operation,
          baseline,
          after,
        )
      ) {
        reportActivity(
          capturedEspionageActivity(decision.operation, decision.governmentId),
        );
        return SUCCEEDED;
      }
      if (after.sabotageProgress <= 0 || after.action !== decision.operation) {
        active.modalLifecycle?.cleanup();
        return stale(
          "captured-espionage-not-applied",
          "the game did not apply the espionage operation",
        );
      }
      pending = baseline;
      return stale(
        "captured-espionage-postcondition-pending",
        "the game queued the espionage operation but its result is pending",
      );
    },
  });

  return Object.freeze({
    reader,
    executor,
    isBusy: () =>
      cycleAction ||
      pending !== undefined ||
      opening !== undefined ||
      sample?.modalLifecycle !== undefined,
  });
}
