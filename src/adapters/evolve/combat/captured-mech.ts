/** Captured current-design mech construction for the independent runtime. */

import type {
  CapturedMechBuildDecision,
  CapturedMechBuildInput,
} from "../../../domain/combat/captured-mech.ts";
import type {
  CapturedMechExecutor,
  CapturedMechReader,
} from "../../../ports/captured-mech.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, isNonArrayRecord, readProperty } from "../../validation.ts";

export const CAPTURED_MECH_ASSEMBLY_CONTROL = "mechAssembly";

interface CapturedMechSample {
  readonly root: unknown;
  readonly control: GameControlHandle;
  readonly input: CapturedMechBuildInput;
}

type CapturedMechSession = CapturedMechSample;

function capturedMechUnavailable(): CapturedMechBuildInput {
  return Object.freeze({
    available: false,
    enabled: false,
    buildMode: "none",
    queueKeyEnabled: false,
    infernal: false,
    designSize: "",
    designSpace: 0,
    designSupply: 0,
    designSoul: 0,
    baySpace: 0,
    purifierSupply: 0,
    soulGems: 0,
  });
}

function readControlNumber(
  controls: GameControlRegistry,
  control: GameControlHandle,
  method: string,
  args: readonly unknown[],
): number | undefined {
  const result = controls.invoke(control, method, args);
  return result.ok ? finite(result.value) : undefined;
}

function readCapturedMechSample(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  settingsValue: unknown,
): CapturedMechSample | undefined {
  const root = rootState.readRoot();
  if (!isNonArrayRecord(root)) return undefined;
  const settings = isNonArrayRecord(settingsValue) ? settingsValue : undefined;
  if (settings?.["autoMech"] !== true || settings["mechBuild"] !== "user") {
    return undefined;
  }

  const gameSettings = readProperty(root, "settings");
  // `build()` queues rather than builds when both qKey and the q key are active. The
  // independent runtime has no queue-admission transaction yet, so qKey is a safe stand-down.
  const queueKeyEnabled = readProperty(gameSettings, "qKey") === true;

  const portal = readProperty(root, "portal");
  const mechbay = readProperty(portal, "mechbay");
  const blueprint = readProperty(mechbay, "blueprint");
  const purifier = readProperty(portal, "purifier");
  const resources = readProperty(root, "resource");
  const soulGem = readProperty(resources, "Soul_Gem");
  if (
    !isNonArrayRecord(mechbay) ||
    !isNonArrayRecord(blueprint) ||
    !isNonArrayRecord(purifier) ||
    !isNonArrayRecord(soulGem)
  ) {
    return undefined;
  }

  const designSize = blueprint["size"];
  if (typeof designSize !== "string" || designSize.length === 0) {
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

  const maximum = finite(mechbay["max"]);
  const occupied = finite(mechbay["bay"]);
  const purifierSupply = finite(purifier["supply"]);
  const soulGems = finite(soulGem["amount"]);
  const designSpace = readControlNumber(controls, control, "bay", [designSize]);
  const designSupply = readControlNumber(controls, control, "price", [
    designSize,
  ]);
  const designSoul = readControlNumber(controls, control, "soul", [designSize]);
  if (
    maximum === undefined ||
    occupied === undefined ||
    purifierSupply === undefined ||
    soulGems === undefined ||
    designSpace === undefined ||
    designSupply === undefined ||
    designSoul === undefined ||
    maximum < occupied
  ) {
    return undefined;
  }

  return Object.freeze({
    root,
    control,
    input: Object.freeze({
      available: true,
      enabled: true,
      buildMode: "user",
      queueKeyEnabled,
      // The settings hint says infernal designs are never automatic. A missing legacy field is
      // falsy in the game's own `mechCost` call, so the capture keeps that lazy coercion.
      infernal: Boolean(blueprint["infernal"]),
      designSize,
      designSpace,
      designSupply,
      designSoul,
      baySpace: maximum - occupied,
      purifierSupply,
      soulGems,
    }),
  });
}

function sameCapturedMechInput(
  left: Readonly<CapturedMechBuildInput>,
  right: Readonly<CapturedMechBuildInput>,
): boolean {
  return (
    left.available === right.available &&
    left.enabled === right.enabled &&
    left.buildMode === right.buildMode &&
    left.queueKeyEnabled === right.queueKeyEnabled &&
    left.infernal === right.infernal &&
    left.designSize === right.designSize &&
    left.designSpace === right.designSpace &&
    left.designSupply === right.designSupply &&
    left.designSoul === right.designSoul &&
    left.baySpace === right.baySpace &&
    left.purifierSupply === right.purifierSupply &&
    left.soulGems === right.soulGems
  );
}

export interface CapturedMechDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
}

export function createCapturedMech(dependencies: CapturedMechDependencies): {
  readonly reader: CapturedMechReader;
  readonly executor: CapturedMechExecutor;
} {
  let session: CapturedMechSession | undefined;

  const reader: CapturedMechReader = Object.freeze({
    read(): CapturedMechBuildInput {
      session = undefined;
      const sample = readCapturedMechSample(
        dependencies.rootState,
        dependencies.controls,
        dependencies.readSettings(),
      );
      if (sample === undefined) return capturedMechUnavailable();
      session = sample;
      return sample.input;
    },
  });

  const executor: CapturedMechExecutor = Object.freeze({
    execute(
      decision: Readonly<CapturedMechBuildDecision>,
    ): ReturnType<CapturedMechExecutor["execute"]> {
      const active = session;
      if (active === undefined) {
        return stale(
          "captured-mech-session-missing",
          "captured mech session is missing",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        return stale(
          "captured-mech-root-changed",
          "captured game root changed",
        );
      }
      const currentControl = dependencies.controls.resolve(
        CAPTURED_MECH_ASSEMBLY_CONTROL,
      );
      if (
        currentControl === undefined ||
        currentControl.generation !== active.control.generation
      ) {
        return stale(
          "captured-mech-control-changed",
          "captured mech assembly control changed",
        );
      }
      if (
        decision.kind !== "build-captured-mech" ||
        decision.designSize !== active.input.designSize ||
        decision.expectedBaySpace !== active.input.baySpace ||
        decision.expectedPurifierSupply !== active.input.purifierSupply ||
        decision.expectedSoulGems !== active.input.soulGems
      ) {
        return rejected(
          "invalid-captured-mech-decision",
          "captured mech decision does not match the sample",
        );
      }

      const current = readCapturedMechSample(
        dependencies.rootState,
        dependencies.controls,
        dependencies.readSettings(),
      );
      if (
        current === undefined ||
        current.control.generation !== active.control.generation ||
        !sameCapturedMechInput(current.input, active.input)
      ) {
        return stale(
          "captured-mech-state-changed",
          "captured mech state changed",
        );
      }

      const result = dependencies.controls.invoke(active.control, "build");
      if (!result.ok) {
        return stale(
          "captured-mech-control-failed",
          `captured mech build failed: ${result.reason}`,
        );
      }
      const after = readCapturedMechSample(
        dependencies.rootState,
        dependencies.controls,
        dependencies.readSettings(),
      );
      if (
        after === undefined ||
        after.input.baySpace !==
          active.input.baySpace - active.input.designSpace ||
        after.input.purifierSupply !==
          active.input.purifierSupply - active.input.designSupply ||
        after.input.soulGems !== active.input.soulGems - active.input.designSoul
      ) {
        return stale(
          "captured-mech-not-built",
          "the game did not commit the captured mech build",
        );
      }
      session = undefined;
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
