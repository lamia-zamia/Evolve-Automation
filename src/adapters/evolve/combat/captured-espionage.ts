/** Captured DeadSpace foreign espionage controls and postcondition checks. */

import {
  capturedEspionageOperationForPolicy,
  planCapturedEspionage,
  type CapturedEspionageInput,
  type CapturedEspionageOperation,
  type CapturedEspionagePlan,
} from "../../../domain/combat/captured-espionage.ts";
import type { SpyPurchaseReservation } from "../../../domain/combat/spy.ts";
import type {
  CapturedEspionageExecutor,
  CapturedEspionageOperationCapture,
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
  CAPTURED_FOREIGN_ESPIONAGE_TRIGGER_METHOD,
  CAPTURED_FOREIGN_GARRISON_CONTROLS,
  capturedForeignEspionageUseful,
  capturedForeignOperationMethod,
  readCapturedForeignGovernment,
  readCapturedForeignTargets,
  selectCapturedForeignStrategy,
  type CapturedForeignGovernment,
} from "./captured-foreign-state.ts";

const CAPTURED_ESPIONAGE_FOREIGN_METHODS = [
  "vis",
  "gvis",
  CAPTURED_FOREIGN_ESPIONAGE_TRIGGER_METHOD,
  "spy_disabled",
  "spy",
] as const;
const CAPTURED_ESPIONAGE_GOVERNOR_TASKS = ["combo_spy", "spyop"] as const;

interface CapturedEspionageSample {
  readonly root: unknown;
  readonly foreign: GameControlHandle;
  readonly target: CapturedForeignGovernment;
  readonly input: CapturedEspionageInput;
}

interface CapturedEspionagePending {
  readonly root: unknown;
  readonly foreign: GameControlHandle;
  readonly operation: CapturedEspionageOperation;
  readonly governmentId: number;
  readonly military: number;
  readonly hostility: number | undefined;
  readonly unrest: number | undefined;
  readonly annexed: boolean;
  readonly purchased: boolean;
}

export interface CapturedEspionageDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  /** Shared Purchase authority sampled alongside Money demand and spy training. */
  readonly readPurchaseReservation?: () =>
    Readonly<SpyPurchaseReservation> | undefined;
  /** The game's own espionage operations, captured per government on demand. */
  readonly operations: CapturedEspionageOperationCapture;
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

function capturedEspionageGovernorOwnsEspionage(root: unknown): boolean {
  const tasks = readProperty(
    readProperty(readProperty(root, "race"), "governor"),
    "tasks",
  );
  return (
    isRecord(tasks) &&
    Object.values(tasks).some((task) =>
      CAPTURED_ESPIONAGE_GOVERNOR_TASKS.some(
        (governorTask) => governorTask === task,
      ),
    )
  );
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

function capturedEspionageFirstControl(
  controls: GameControlRegistry,
  elementIds: readonly string[],
  methods: readonly string[],
): GameControlHandle | undefined {
  for (const elementId of elementIds) {
    const control = capturedEspionageControl(controls, elementId, methods);
    if (control !== undefined) return control;
  }
  return undefined;
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
      readonly occupied: boolean;
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
    occupied: Boolean(government["occ"]),
    annexed: Boolean(government["anx"]),
    purchased: Boolean(government["buy"]),
    action:
      typeof government["act"] === "string" ? government["act"] : undefined,
  });
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
  );
}

function capturedEspionageInput(
  root: unknown,
  target: CapturedForeignGovernment,
  influenceAllowed: boolean,
  readPurchaseReservation:
    (() => Readonly<SpyPurchaseReservation> | undefined) | undefined,
): CapturedEspionageInput {
  const elusive = Boolean(readProperty(readProperty(root, "race"), "elusive"));
  const purchaseReservation =
    target.policy === "Purchase" && target.spyCount < 3 && !elusive
      ? readPurchaseReservation?.()
      : undefined;
  const operation = capturedEspionageOperationForPolicy(
    target.policy,
    target.military,
    target.hostility,
  );
  const preparationFallback =
    target.policy === "Annex" || target.policy === "Purchase";
  return Object.freeze({
    enabled: true,
    governmentId: target.governmentId,
    policy: target.policy,
    spyCount: target.spyCount,
    sabotageProgress: target.sabotageProgress,
    military: target.military,
    hostility: target.hostility,
    unrest: target.unrest,
    occupied: target.occupied,
    annexed: target.annexed,
    purchased: target.purchased,
    purchaseMoney: purchaseReservation?.purchaseMoney,
    purchaseForeign: purchaseReservation?.purchaseGovernmentIds.includes(
      target.governmentId,
    ),
    elusive,
    requestedOperationUseful:
      operation !== null &&
      capturedForeignEspionageUseful(root, target, operation),
    influenceUseful:
      preparationFallback &&
      capturedForeignEspionageUseful(root, target, "influence"),
    inciteUseful:
      preparationFallback &&
      capturedForeignEspionageUseful(root, target, "incite"),
    influenceAllowed,
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
    purchaseMoney: undefined,
    purchaseForeign: undefined,
    elusive: false,
    requestedOperationUseful: false,
    influenceUseful: false,
    inciteUseful: false,
    influenceAllowed: true,
  });
}

function capturedEspionageDecisionMatchesInput(
  decision: Readonly<CapturedEspionagePlan>,
  input: Readonly<CapturedEspionageInput>,
): boolean {
  return (
    decision.governmentId === input.governmentId &&
    decision.expectedPolicy === input.policy &&
    decision.expectedSpyCount === input.spyCount &&
    decision.expectedSabotageProgress === input.sabotageProgress &&
    decision.expectedMilitary === input.military &&
    decision.expectedHostility === input.hostility &&
    decision.expectedUnrest === input.unrest &&
    decision.expectedOccupied === input.occupied &&
    decision.expectedAnnexed === input.annexed &&
    decision.expectedPurchased === input.purchased &&
    decision.expectedPurchaseMoney === input.purchaseMoney &&
    decision.expectedPurchaseForeign === input.purchaseForeign &&
    decision.expectedElusive === input.elusive &&
    decision.expectedRequestedOperationUseful ===
      input.requestedOperationUseful &&
    decision.expectedInfluenceUseful === input.influenceUseful &&
    decision.expectedInciteUseful === input.inciteUseful &&
    decision.expectedInfluenceAllowed === input.influenceAllowed
  );
}

function capturedEspionageInputsMatch(
  left: Readonly<CapturedEspionageInput>,
  right: Readonly<CapturedEspionageInput>,
): boolean {
  return (
    left.governmentId === right.governmentId &&
    left.policy === right.policy &&
    left.spyCount === right.spyCount &&
    left.sabotageProgress === right.sabotageProgress &&
    left.military === right.military &&
    left.hostility === right.hostility &&
    left.unrest === right.unrest &&
    left.occupied === right.occupied &&
    left.annexed === right.annexed &&
    left.purchased === right.purchased &&
    left.purchaseMoney === right.purchaseMoney &&
    left.purchaseForeign === right.purchaseForeign &&
    left.elusive === right.elusive &&
    left.requestedOperationUseful === right.requestedOperationUseful &&
    left.influenceUseful === right.influenceUseful &&
    left.inciteUseful === right.inciteUseful &&
    left.influenceAllowed === right.influenceAllowed
  );
}

function capturedEspionagePlansMatch(
  expected: Readonly<CapturedEspionagePlan>,
  actual: Readonly<CapturedEspionagePlan>,
): boolean {
  if (expected.kind !== actual.kind) return false;
  return (
    expected.kind === "release-foreign" ||
    (actual.kind === "captured-espionage" &&
      expected.operation === actual.operation)
  );
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
  readonly isGovernorEspionageOwned: () => boolean;
  readonly standDown: () => void;
} {
  const reportActivity = dependencies.onActivity ?? (() => {});
  const samples = new Map<number, CapturedEspionageSample>();
  const pending = new Map<number, CapturedEspionagePending>();

  function clearPending(governmentId?: number): void {
    if (governmentId !== undefined) {
      pending.delete(governmentId);
      return;
    }
    pending.clear();
  }

  function completePending(root: unknown): boolean {
    const currentForeign = dependencies.controls.resolve(
      CAPTURED_FOREIGN_CONTROL,
    );
    let completed = false;
    for (const active of pending.values()) {
      if (
        root !== active.root ||
        currentForeign === undefined ||
        currentForeign.generation !== active.foreign.generation
      ) {
        clearPending(active.governmentId);
        continue;
      }
      const state = capturedEspionageState(root, active.governmentId);
      if (state === undefined || state.sabotageProgress > 0) continue;
      // DeadSpace starts every espionage operation by setting sab/act and only applies its result
      // when the sab timer reaches zero. A foreign military change during that interval is not this
      // operation's completion.
      if (
        capturedEspionagePostconditionChanged(active.operation, active, state)
      ) {
        reportActivity(
          capturedEspionageActivity(active.operation, active.governmentId),
        );
        completed = true;
      }
      clearPending(active.governmentId);
    }
    return completed;
  }

  function discardCapturedEspionageSample(): void {
    samples.clear();
  }

  function standDown(): void {
    if (samples.size === 0 && pending.size === 0) return;
    discardCapturedEspionageSample();
    pending.clear();
  }

  function readSelectedInput(): CapturedEspionageInput {
    discardCapturedEspionageSample();
    const root = dependencies.rootState.readRoot();
    if (!isRecord(root)) return capturedEspionageEmptyInput();
    if (completePending(root)) return capturedEspionageEmptyInput();

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
    const targetGovernmentId =
      strategy.selectedTargetId ?? strategy.governments[0]?.governmentId;
    if (targetGovernmentId === null || targetGovernmentId === undefined) {
      return capturedEspionageEmptyInput();
    }
    const target = strategy.governments.find(
      (candidate) => candidate.governmentId === targetGovernmentId,
    );
    if (target === undefined) return capturedEspionageEmptyInput();
    const input = capturedEspionageInput(
      root,
      target,
      strategy.battleTargetId !== target.governmentId,
      dependencies.readPurchaseReservation,
    );
    samples.set(
      target.governmentId,
      Object.freeze({ root, foreign, target, input }),
    );
    return input;
  }

  const reader: CapturedEspionageReader = Object.freeze({
    read: readSelectedInput,
    readAll(): readonly CapturedEspionageInput[] {
      const selectedInput = readSelectedInput();
      const selected = samples.get(selectedInput.governmentId);
      if (selected === undefined || selectedInput.governmentId < 0) {
        return Object.freeze([]);
      }
      const settingsValue = dependencies.readSettings();
      const settings = isRecord(settingsValue) ? settingsValue : {};
      const targets = readCapturedForeignTargets(
        selected.root,
        dependencies.controls,
        selected.foreign,
        settings,
      );
      const strategy = selectCapturedForeignStrategy(
        selected.root,
        settings,
        targets,
      );
      const inputs: CapturedEspionageInput[] = [];
      for (const target of strategy.governments) {
        const existing = samples.get(target.governmentId);
        if (existing !== undefined) {
          inputs.push(existing.input);
          continue;
        }
        const input = capturedEspionageInput(
          selected.root,
          target,
          strategy.battleTargetId !== target.governmentId,
          dependencies.readPurchaseReservation,
        );
        samples.set(
          target.governmentId,
          Object.freeze({
            root: selected.root,
            foreign: selected.foreign,
            target,
            input,
          }),
        );
        inputs.push(input);
      }
      return Object.freeze(inputs);
    },
  });

  const executor: CapturedEspionageExecutor = Object.freeze({
    execute(decision: Readonly<CapturedEspionagePlan>) {
      const active = samples.get(decision.governmentId);
      if (active === undefined) {
        return stale(
          "captured-espionage-session-missing",
          "captured espionage session is missing",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        discardCapturedEspionageSample();
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
        discardCapturedEspionageSample();
        return stale(
          "captured-espionage-foreign-changed",
          "captured foreign control changed",
        );
      }
      if (!capturedEspionageDecisionMatchesInput(decision, active.input)) {
        discardCapturedEspionageSample();
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
        (candidate) => candidate.governmentId === active.target.governmentId,
      );
      const currentInput =
        currentStrategyTarget === undefined
          ? undefined
          : capturedEspionageInput(
              active.root,
              currentStrategyTarget,
              currentStrategy.battleTargetId !==
                currentStrategyTarget.governmentId,
              dependencies.readPurchaseReservation,
            );
      if (
        currentTarget === undefined ||
        currentState === undefined ||
        currentStrategyTarget === undefined ||
        currentInput === undefined ||
        currentStrategyTarget.governmentId !== active.target.governmentId ||
        currentTarget.governmentId !== active.target.governmentId ||
        currentTarget.policy !== active.target.policy ||
        !capturedEspionageInputsMatch(currentInput, active.input) ||
        currentState.spyCount !== active.input.spyCount ||
        currentState.sabotageProgress !== active.input.sabotageProgress ||
        currentState.military !== active.input.military ||
        currentState.hostility !== active.input.hostility ||
        currentState.unrest !== active.input.unrest ||
        currentState.occupied !== active.input.occupied ||
        currentState.annexed !== active.input.annexed ||
        currentState.purchased !== active.input.purchased
      ) {
        discardCapturedEspionageSample();
        return stale(
          "captured-espionage-state-changed",
          "captured foreign espionage state changed",
        );
      }
      const expected = planCapturedEspionage(currentInput);
      if (
        expected === null ||
        !capturedEspionagePlansMatch(expected, decision)
      ) {
        discardCapturedEspionageSample();
        return rejected(
          "invalid-captured-espionage-plan",
          "captured espionage plan no longer matches the sampled state",
        );
      }

      if (decision.kind === "release-foreign") {
        const garrison = capturedEspionageFirstControl(
          dependencies.controls,
          CAPTURED_FOREIGN_GARRISON_CONTROLS,
          ["campaign"],
        );
        if (garrison === undefined) {
          discardCapturedEspionageSample();
          return stale(
            "captured-espionage-campaign-control-missing",
            "the game-owned campaign control is not captured",
          );
        }
        const result = dependencies.controls.invoke(garrison, "campaign", [
          decision.governmentId,
        ]);
        if (!result.ok) {
          discardCapturedEspionageSample();
          return stale(
            "captured-espionage-campaign-failed",
            `campaign failed: ${result.reason}`,
          );
        }
        const after = capturedEspionageState(
          active.root,
          decision.governmentId,
        );
        if (
          after === undefined ||
          after.occupied ||
          after.annexed ||
          after.purchased
        ) {
          discardCapturedEspionageSample();
          return stale(
            "captured-espionage-release-not-applied",
            "the game did not release the foreign power",
          );
        }
        discardCapturedEspionageSample();
        reportActivity({
          message: `Released foreign power ${decision.governmentId + 1}`,
          color: "success",
          tags: Object.freeze(["combat"]),
        });
        return SUCCEEDED;
      }

      samples.delete(decision.governmentId);
      // The operation methods close themselves with a global `.modal-background` click and a
      // `clearPopper()`, so nothing runs while a modal the player owns is on screen.
      if (dependencies.operations.blockedByPlayerModal()) {
        return stale(
          "captured-espionage-modal-conflict",
          "another modal is active; espionage is deferred",
        );
      }
      // Captured here and invoked below rather than kept: the game's own closure is per government,
      // so a control held past this call would be scoped to a government it may no longer serve.
      const operation = dependencies.operations.capture(decision.governmentId);
      if (operation === undefined) {
        return stale(
          "captured-espionage-operation-capture-unavailable",
          "the game-owned espionage operations are not captured",
        );
      }
      if (
        operation.generation !==
        dependencies.controls.resolve(operation.elementId)?.generation
      ) {
        return stale(
          "captured-espionage-operation-control-changed",
          "the captured espionage operations were rebuilt",
        );
      }
      // The game binds the control to the government it was drawn for, and `annex()` reads that
      // same government from its closure, so a control bound elsewhere is not this one's.
      const government = capturedEspionageForeignGovernment(
        active.root,
        decision.governmentId,
      );
      if (government === undefined || operation.data !== government) {
        return stale(
          "captured-espionage-operation-scope-changed",
          "the captured espionage operations target a different government",
        );
      }
      const result = dependencies.controls.invoke(
        operation,
        capturedForeignOperationMethod(decision.operation),
        [decision.governmentId],
      );
      if (!result.ok) {
        return stale(
          "captured-espionage-operation-failed",
          `captured espionage operation failed: ${result.reason}`,
        );
      }
      const after = capturedEspionageState(active.root, decision.governmentId);
      if (after === undefined) {
        return stale(
          "captured-espionage-postcondition-unreadable",
          "the foreign espionage postcondition is unreadable",
        );
      }
      const baseline: CapturedEspionagePending = Object.freeze({
        root: active.root,
        foreign: active.foreign,
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
        return stale(
          "captured-espionage-not-applied",
          "the game did not apply the espionage operation",
        );
      }
      pending.set(decision.governmentId, baseline);
      return stale(
        "captured-espionage-postcondition-pending",
        "the game queued the espionage operation but its result is pending",
      );
    },
  });

  return Object.freeze({
    reader,
    executor,
    isGovernorEspionageOwned: () =>
      capturedEspionageGovernorOwnsEspionage(dependencies.rootState.readRoot()),
    standDown,
    isBusy: () => pending.size > 0,
  });
}
