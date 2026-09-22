/** Captured current-design mech construction for the independent runtime. */

import type {
  CapturedMechBuildDecision,
  CapturedMechBuildInput,
} from "../../../domain/combat/captured-mech.ts";
import {
  readCapturedMechState,
  type CapturedMechDesign,
  type CapturedMechState,
} from "../../../domain/combat/mech-state.ts";
import type {
  CapturedMechExecutor,
  CapturedMechReader,
} from "../../../ports/captured-mech.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { GameKeyStateReader } from "../../../ports/game-key-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, isNonArrayRecord, readProperty } from "../../validation.ts";

export const CAPTURED_MECH_ASSEMBLY_CONTROL = "mechAssembly";

interface CapturedMechSample {
  readonly root: unknown;
  readonly control: GameControlHandle;
  readonly input: CapturedMechBuildInput;
  readonly design: CapturedMechDesign;
  readonly mechsLength: number;
  readonly occupied: number;
}

function readDesignStrings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    ),
  );
}

function tailMatchesDesign(tail: unknown, design: CapturedMechDesign): boolean {
  if (!isNonArrayRecord(tail)) return false;
  return (
    tail["size"] === design.size &&
    (tail["chassis"] ?? "") === design.chassis &&
    JSON.stringify(readDesignStrings(tail["hardpoint"])) ===
      JSON.stringify(design.hardpoint) &&
    JSON.stringify(readDesignStrings(tail["equip"])) ===
      JSON.stringify(design.equip) &&
    Boolean(tail["infernal"]) === design.infernal
  );
}

type CapturedMechSession = CapturedMechSample;

function capturedMechUnavailable(): CapturedMechBuildInput {
  return Object.freeze({
    available: false,
    enabled: false,
    buildMode: "none",
    queueKeyHeld: false,
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

function readCapturedMechQueueKeyHeld(
  gameSettings: unknown,
  keyState: GameKeyStateReader,
): boolean | undefined {
  if (readProperty(gameSettings, "qKey") !== true) return false;
  const mappedKey = readProperty(readProperty(gameSettings, "keyMap"), "q");
  if (!(
    (typeof mappedKey === "string" && mappedKey.length > 0) ||
    (typeof mappedKey === "number" && Number.isFinite(mappedKey))
  )) {
    // DeadSpace's module-local keyMap starts false until a configured mapping is observed.
    return false;
  }
  return keyState.readPressed(mappedKey);
}

function readCapturedMechSample(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  settingsValue: unknown,
  keyState: GameKeyStateReader,
): CapturedMechSample | undefined {
  const root = rootState.readRoot();
  if (!isNonArrayRecord(root)) return undefined;
  const settings = isNonArrayRecord(settingsValue) ? settingsValue : undefined;
  if (settings?.["autoMech"] !== true || settings["mechBuild"] !== "user") {
    return undefined;
  }

  const gameSettings = readProperty(root, "settings");
  // `build()` queues rather than builds only when qKey and the mapped key are both active.
  const queueKeyHeld = readCapturedMechQueueKeyHeld(gameSettings, keyState);
  if (queueKeyHeld === undefined) return undefined;

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
  const stored = Array.isArray(mechbay["mechs"]) ? mechbay["mechs"] : undefined;
  const chassis = blueprint["chassis"];
  if (
    maximum === undefined ||
    occupied === undefined ||
    purifierSupply === undefined ||
    soulGems === undefined ||
    designSpace === undefined ||
    designSupply === undefined ||
    designSoul === undefined ||
    maximum < occupied ||
    stored === undefined
  ) {
    return undefined;
  }

  const design: CapturedMechDesign = Object.freeze({
    size: designSize,
    chassis: typeof chassis === "string" ? chassis : "",
    hardpoint: readDesignStrings(blueprint["hardpoint"]),
    equip: readDesignStrings(blueprint["equip"]),
    infernal: Boolean(blueprint["infernal"]),
  });

  return Object.freeze({
    root,
    control,
    design,
    mechsLength: stored.length,
    occupied,
    input: Object.freeze({
      available: true,
      enabled: true,
      buildMode: "user",
      queueKeyHeld,
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
    left.queueKeyHeld === right.queueKeyHeld &&
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
  readonly keyState: GameKeyStateReader;
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
        dependencies.keyState,
      );
      if (sample === undefined) return capturedMechUnavailable();
      session = sample;
      return sample.input;
    },
    readState(): CapturedMechState {
      const root = dependencies.rootState.readRoot();
      const gameSettings = readProperty(root, "settings");
      return readCapturedMechState({
        root,
        settings: dependencies.readSettings(),
        queueKeyHeld: readCapturedMechQueueKeyHeld(
          gameSettings,
          dependencies.keyState,
        ),
      });
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
        dependencies.keyState,
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
        dependencies.keyState,
      );
      const afterMechs =
        after === undefined
          ? undefined
          : readProperty(readProperty(after.root, "portal"), "mechbay");
      const afterStored =
        isNonArrayRecord(afterMechs) && Array.isArray(afterMechs["mechs"])
          ? (afterMechs["mechs"] as readonly unknown[])
          : undefined;
      if (
        after === undefined ||
        afterStored === undefined ||
        after.input.baySpace !==
          active.input.baySpace - active.input.designSpace ||
        after.input.purifierSupply !==
          active.input.purifierSupply - active.input.designSupply ||
        after.input.soulGems !==
          active.input.soulGems - active.input.designSoul ||
        // A wrapper return is not success: the bay must hold one more mech
        // with the expected design.
        after.mechsLength !== active.mechsLength + 1 ||
        after.occupied !== active.occupied + active.input.designSpace ||
        !tailMatchesDesign(afterStored[afterStored.length - 1], active.design)
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
