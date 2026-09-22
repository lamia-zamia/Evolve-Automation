/** Captured current-design mech construction for the independent runtime. */

import type {
  CapturedMechAutoPlan,
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

const AUTO_DESIGN_METHODS = Object.freeze([
  "setSize",
  "setType",
  "setWep",
  "setEquip",
  "build",
  "bay",
  "price",
  "soul",
]);

function resolveAutoAssembly(
  registry: GameControlRegistry,
): GameControlHandle | undefined {
  const control = registry.resolve(CAPTURED_MECH_ASSEMBLY_CONTROL);
  if (control === undefined) return undefined;
  for (const method of AUTO_DESIGN_METHODS) {
    if (!control.methods.includes(method)) return undefined;
  }
  return control;
}

function readBlueprintDesign(root: unknown): CapturedMechDesign | null {
  if (!isNonArrayRecord(root)) return null;
  const mechbay = readProperty(readProperty(root, "portal"), "mechbay");
  if (!isNonArrayRecord(mechbay)) return null;
  const blueprint = mechbay["blueprint"];
  if (!isNonArrayRecord(blueprint)) return null;
  const size = blueprint["size"];
  if (typeof size !== "string" || size.length === 0) return null;
  const chassis = blueprint["chassis"];
  return Object.freeze({
    size,
    chassis: typeof chassis === "string" ? chassis : "",
    hardpoint: readDesignStrings(blueprint["hardpoint"]),
    equip: readDesignStrings(blueprint["equip"]),
    infernal: Boolean(blueprint["infernal"]),
  });
}

function designsEqual(
  left: CapturedMechDesign,
  right: CapturedMechDesign,
): boolean {
  return (
    left.size === right.size &&
    left.chassis === right.chassis &&
    JSON.stringify(left.hardpoint) === JSON.stringify(right.hardpoint) &&
    JSON.stringify(left.equip) === JSON.stringify(right.equip) &&
    left.infernal === right.infernal
  );
}

function tailMatchesDesign(tail: unknown, wanted: CapturedMechDesign): boolean {
  if (!isNonArrayRecord(tail)) return false;
  return (
    tail["size"] === wanted.size &&
    (tail["chassis"] ?? "") === wanted.chassis &&
    JSON.stringify(readDesignStrings(tail["hardpoint"])) ===
      JSON.stringify(wanted.hardpoint) &&
    JSON.stringify(readDesignStrings(tail["equip"])) ===
      JSON.stringify(wanted.equip) &&
    Boolean(tail["infernal"]) === wanted.infernal
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

    executeAutoBuild(
      decision: Readonly<CapturedMechAutoPlan>,
    ): ReturnType<CapturedMechExecutor["executeAutoBuild"]> {
      if (decision.kind !== "build-captured-mech-auto") {
        return rejected(
          "invalid-captured-mech-decision",
          "captured mech decision does not match the sample",
        );
      }
      // One working tick is one session: the root must stay identical while
      // the design setters redraw the lab (each redraw bumps the control
      // generation, so every step re-resolves and revalidates by content).
      const rootRef = dependencies.rootState.readRoot();
      const unchanged = (): boolean =>
        dependencies.rootState.readRoot() === rootRef;
      const gameSettings = readProperty(rootRef, "settings");
      const queueKeyHeld = readCapturedMechQueueKeyHeld(
        gameSettings,
        dependencies.keyState,
      );
      if (!unchanged() || queueKeyHeld !== false) {
        return stale(
          "captured-mech-auto-state-changed",
          "captured mech state changed",
        );
      }
      const fundsOf = (
        root: unknown,
      ):
        | {
            bay: number;
            max: number;
            supply: number;
            gems: number;
            stored: readonly unknown[];
          }
        | undefined => {
        if (!isNonArrayRecord(root)) return undefined;
        const mechbay = readProperty(readProperty(root, "portal"), "mechbay");
        const purifier = readProperty(readProperty(root, "portal"), "purifier");
        const soulGem = readProperty(
          readProperty(root, "resource"),
          "Soul_Gem",
        );
        if (
          !isNonArrayRecord(mechbay) ||
          !isNonArrayRecord(purifier) ||
          !isNonArrayRecord(soulGem) ||
          !Array.isArray(mechbay["mechs"])
        ) {
          return undefined;
        }
        const bay = finite(mechbay["bay"]);
        const max = finite(mechbay["max"]);
        const supply = finite(purifier["supply"]);
        const gems = finite(soulGem["amount"]);
        if (
          bay === undefined ||
          max === undefined ||
          supply === undefined ||
          gems === undefined
        ) {
          return undefined;
        }
        return { bay, max, supply, gems, stored: mechbay["mechs"] };
      };
      const before = fundsOf(rootRef);
      if (
        before === undefined ||
        before.stored.length !== decision.expectedMechsLength ||
        before.bay !== decision.expectedOccupied ||
        before.supply !== decision.expectedPurifierSupply ||
        before.gems !== decision.expectedSoulGems
      ) {
        return stale(
          "captured-mech-auto-state-changed",
          "captured mech state changed",
        );
      }
      if (
        before.max - before.bay < decision.space ||
        before.supply < decision.supply ||
        before.gems < decision.gems
      ) {
        return stale(
          "captured-mech-auto-unaffordable",
          "captured mech design is no longer affordable",
        );
      }
      const applySetStep = (
        method: string,
        args: readonly unknown[],
        expect: (candidate: CapturedMechDesign) => boolean,
      ): ReturnType<CapturedMechExecutor["executeAutoBuild"]> | null => {
        const stepHandle = resolveAutoAssembly(dependencies.controls);
        if (stepHandle === undefined || !unchanged()) {
          return stale(
            "captured-mech-auto-state-changed",
            "captured mech state changed",
          );
        }
        const result = dependencies.controls.invoke(stepHandle, method, args);
        if (!result.ok) {
          return stale(
            "captured-mech-auto-control-failed",
            `captured mech design step failed: ${result.reason}`,
          );
        }
        const steppedDesign = readBlueprintDesign(rootRef);
        if (steppedDesign === null || !expect(steppedDesign)) {
          return stale(
            "captured-mech-design-not-set",
            "the game did not take the captured mech design",
          );
        }
        return null;
      };
      let blueprintDesign = readBlueprintDesign(rootRef);
      if (blueprintDesign === null || blueprintDesign.infernal) {
        return stale(
          "captured-mech-auto-state-changed",
          "captured mech state changed",
        );
      }
      if (blueprintDesign.size !== decision.design.size) {
        const stepped = applySetStep(
          "setSize",
          [decision.design.size],
          (next) => next.size === decision.design.size,
        );
        if (stepped !== null) return stepped;
        blueprintDesign = readBlueprintDesign(rootRef);
        if (blueprintDesign === null) {
          return stale(
            "captured-mech-design-not-set",
            "the game did not take the captured mech design",
          );
        }
      }
      if (blueprintDesign.chassis !== decision.design.chassis) {
        const stepped = applySetStep(
          "setType",
          [decision.design.chassis],
          (next) => next.chassis === decision.design.chassis,
        );
        if (stepped !== null) return stepped;
        blueprintDesign = readBlueprintDesign(rootRef);
        if (blueprintDesign === null) {
          return stale(
            "captured-mech-design-not-set",
            "the game did not take the captured mech design",
          );
        }
      }
      for (let index = 0; index < decision.design.hardpoint.length; index++) {
        const weapon = decision.design.hardpoint[index] as string;
        if (blueprintDesign.hardpoint[index] !== weapon) {
          const stepped = applySetStep(
            "setWep",
            [weapon, index],
            (next) => next.hardpoint[index] === weapon,
          );
          if (stepped !== null) return stepped;
          blueprintDesign = readBlueprintDesign(rootRef);
          if (blueprintDesign === null) {
            return stale(
              "captured-mech-design-not-set",
              "the game did not take the captured mech design",
            );
          }
        }
      }
      for (let index = 0; index < decision.design.equip.length; index++) {
        const equip = decision.design.equip[index] as string;
        if (blueprintDesign.equip[index] !== equip) {
          const stepped = applySetStep(
            "setEquip",
            [equip, index],
            (next) => next.equip[index] === equip,
          );
          if (stepped !== null) return stepped;
          blueprintDesign = readBlueprintDesign(rootRef);
          if (blueprintDesign === null) {
            return stale(
              "captured-mech-design-not-set",
              "the game did not take the captured mech design",
            );
          }
        }
      }
      if (!designsEqual(blueprintDesign, decision.design)) {
        return stale(
          "captured-mech-design-not-set",
          "the game did not take the captured mech design",
        );
      }
      const autoHandle = resolveAutoAssembly(dependencies.controls);
      if (autoHandle === undefined || !unchanged()) {
        return stale(
          "captured-mech-auto-state-changed",
          "captured mech state changed",
        );
      }
      const rereadQueueKey = readCapturedMechQueueKeyHeld(
        readProperty(rootRef, "settings"),
        dependencies.keyState,
      );
      const designSpace = readControlNumber(
        dependencies.controls,
        autoHandle,
        "bay",
        [decision.design.size],
      );
      const designSupply = readControlNumber(
        dependencies.controls,
        autoHandle,
        "price",
        [decision.design.size],
      );
      const designSoul = readControlNumber(
        dependencies.controls,
        autoHandle,
        "soul",
        [decision.design.size],
      );
      if (
        rereadQueueKey !== false ||
        designSpace !== decision.space ||
        designSupply !== decision.supply ||
        designSoul !== decision.gems
      ) {
        return stale(
          "captured-mech-auto-state-changed",
          "captured mech state changed",
        );
      }
      const buildResult = dependencies.controls.invoke(autoHandle, "build");
      if (!buildResult.ok) {
        return stale(
          "captured-mech-auto-control-failed",
          `captured mech build failed: ${buildResult.reason}`,
        );
      }
      const after = fundsOf(rootRef);
      if (
        after === undefined ||
        after.stored.length !== decision.expectedMechsLength + 1 ||
        after.bay !== decision.expectedOccupied + decision.space ||
        after.supply !== decision.expectedPurifierSupply - decision.supply ||
        after.gems !== decision.expectedSoulGems - decision.gems ||
        !tailMatchesDesign(
          after.stored[after.stored.length - 1],
          decision.design,
        )
      ) {
        return stale(
          "captured-mech-not-built",
          "the game did not commit the captured mech build",
        );
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
