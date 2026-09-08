/** Bounded DeadSpace alchemy allocation through captured resource-row controls. */

import {
  planAlchemy,
  type AlchemyInput,
  type AlchemyDecision,
} from "../../../../domain/economy/production/alchemy.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export const ALCHEMY_CONTROL_PREFIX = "alchemy";

export interface CapturedAlchemyDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
}

export interface CapturedAlchemyAutomation {
  run(): CommandExecutionOutcome;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function emptyInput(): AlchemyInput {
  return Object.freeze({
    unlocked: false,
    crystalDemanded: false,
    manaRateOfChange: 0,
    manaStorageRatio: 0,
    manaCurrentQuantity: 0,
    crystalCurrentQuantity: 0,
    crystalRateOfChange: 0,
    autoPylon: false,
    magicAlchemyManaUse: 0,
    magicFullmetalHelper: false,
    universeMagic: false,
    alchemyTech: 0,
    fullmetalStar: 0,
    achievementLevel: 0,
    resources: Object.freeze([]),
  });
}

function settingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number | undefined {
  const value = settings[key];
  if (value === undefined) return fallback;
  return finite(value);
}

function readAlchemyInput(dependencies: CapturedAlchemyDependencies): {
  readonly root: unknown;
  readonly input: AlchemyInput;
} {
  const root = dependencies.rootState.readRoot();
  if (root === undefined) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const tech = readProperty(root, "tech");
  const alchemyTech = finite(readProperty(tech, "alchemy"));
  const race = readProperty(root, "race");
  const alchemy = readProperty(race, "alchemy");
  const resources = readProperty(root, "resource");
  const mana = readProperty(resources, "Mana");
  const crystal = readProperty(resources, "Crystal");
  const settingsValue = dependencies.readSettings();
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const manaAmount = finite(readProperty(mana, "amount"));
  const manaMaximum = finite(readProperty(mana, "max"));
  const manaRateOfChange = finite(readProperty(mana, "diff"));
  const crystalAmount = finite(readProperty(crystal, "amount"));
  const crystalRateOfChange = finite(readProperty(crystal, "diff"));

  // DeadSpace exposes no demanded/useful resource method on the captured root. This bounded
  // slice only allocates into rows that are visibly below capacity; demand-aware allocation stays
  // on the compatibility path until upstream exposes that input or a separate validated source.
  if (
    alchemyTech === undefined ||
    alchemyTech < 1 ||
    !isRecord(alchemy) ||
    !isRecord(resources) ||
    manaAmount === undefined ||
    manaMaximum === undefined ||
    manaRateOfChange === undefined ||
    crystalAmount === undefined ||
    crystalRateOfChange === undefined ||
    dependencies.controls
      .capturedElementIds()
      .every((id) => !id.startsWith(ALCHEMY_CONTROL_PREFIX))
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const resourceViews = [];
  for (const controlId of dependencies.controls.capturedElementIds()) {
    if (!controlId.startsWith(ALCHEMY_CONTROL_PREFIX)) continue;
    const id = controlId.slice(ALCHEMY_CONTROL_PREFIX.length);
    if (
      id.length === 0 ||
      dependencies.controls.resolve(controlId) === undefined
    )
      continue;
    const resource = readProperty(resources, id);
    if (!isRecord(resource)) continue;
    const amount = finite(resource["amount"]);
    const maximum = finite(resource["max"]);
    const currentCount = finite(alchemy[id]);
    const display = resource["display"];
    const weighting = settingNumber(settings, `res_alchemy_w_${id}`, 0);
    if (
      amount === undefined ||
      maximum === undefined ||
      currentCount === undefined ||
      typeof display !== "boolean" ||
      weighting === undefined ||
      settings[`res_alchemy_${id}`] === false
    ) {
      continue;
    }
    resourceViews.push(
      Object.freeze({
        id,
        currentCount,
        weighting,
        isUseful: display && (maximum <= 0 || amount / maximum < 0.99),
        transmuteTier: 0,
        isBasic: false,
      }),
    );
  }

  const magicAlchemyManaUse = settingNumber(
    settings,
    "magicAlchemyManaUse",
    0.5,
  );
  if (magicAlchemyManaUse === undefined) {
    return Object.freeze({ root, input: emptyInput() });
  }
  return Object.freeze({
    root,
    input: Object.freeze({
      unlocked: true,
      crystalDemanded: false,
      manaRateOfChange,
      manaStorageRatio: manaMaximum > 0 ? manaAmount / manaMaximum : 0,
      manaCurrentQuantity: manaAmount,
      crystalCurrentQuantity: crystalAmount,
      crystalRateOfChange,
      autoPylon: settings["autoPylon"] === true,
      magicAlchemyManaUse,
      magicFullmetalHelper: false,
      universeMagic: true,
      alchemyTech,
      fullmetalStar: 0,
      achievementLevel: 0,
      resources: Object.freeze(resourceViews),
    }),
  });
}

function currentCount(root: unknown, id: string): number | undefined {
  const alchemy = readProperty(readProperty(root, "race"), "alchemy");
  return finite(readProperty(alchemy, id));
}

function manaRate(root: unknown): number | undefined {
  return finite(
    readProperty(readProperty(readProperty(root, "resource"), "Mana"), "diff"),
  );
}

function executeAdjustment(
  dependencies: CapturedAlchemyDependencies,
  root: unknown,
  id: string,
  expected: number,
  count: number,
  method: "addSpell" | "subSpell",
): CommandExecutionOutcome {
  const controlId = `${ALCHEMY_CONTROL_PREFIX}${id}`;
  const handle = dependencies.controls.resolve(controlId);
  if (handle === undefined) {
    return stale(
      "alchemy-control-missing",
      "captured alchemy control is unavailable",
    );
  }
  for (let index = 0; index < count; index++) {
    if (dependencies.rootState.readRoot() !== root) {
      return stale("alchemy-root-changed", "captured game root changed");
    }
    const actual = currentCount(root, id);
    if (actual !== expected + (method === "addSpell" ? index : -index)) {
      return stale("alchemy-count-changed", "alchemy count changed");
    }
    const result = dependencies.controls.invoke(handle, method, [id]);
    if (!result.ok) {
      return rejected("alchemy-control-failed", result.detail ?? result.reason);
    }
  }
  return SUCCEEDED;
}

function sameDecision(
  input: Readonly<AlchemyInput>,
  decision: Readonly<AlchemyDecision>,
): boolean {
  return JSON.stringify(planAlchemy(input)) === JSON.stringify(decision);
}

export function createCapturedAlchemyAutomation(
  dependencies: CapturedAlchemyDependencies,
): CapturedAlchemyAutomation {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readAlchemyInput(dependencies);
      const decision = planAlchemy(session.input);
      if (!session.input.unlocked) return SUCCEEDED;
      if (!sameDecision(session.input, decision)) {
        return rejected(
          "invalid-alchemy-decision",
          "alchemy decision changed during planning",
        );
      }
      const rate = manaRate(session.root);
      if (rate !== session.input.manaRateOfChange) {
        return stale("alchemy-mana-changed", "Mana rate-of-change changed");
      }
      for (const adjustment of decision.decrease) {
        const outcome = executeAdjustment(
          dependencies,
          session.root,
          adjustment.id,
          adjustment.expectedCurrentCount,
          adjustment.count,
          "subSpell",
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      for (const adjustment of decision.increase) {
        const outcome = executeAdjustment(
          dependencies,
          session.root,
          adjustment.id,
          adjustment.expectedCurrentCount,
          adjustment.count,
          "addSpell",
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      return SUCCEEDED;
    },
  });
}
