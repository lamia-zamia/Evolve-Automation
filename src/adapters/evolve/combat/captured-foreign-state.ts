/** Shared captured foreign state and policy selection for battle and espionage. */

import {
  planForeignAchievementGoal,
  type ForeignAchievementGoal,
  type ForeignAchievementState,
} from "../../../domain/combat/foreign-achievements.ts";
import { readCapturedAchievementStar } from "../captured-achievements.ts";
import {
  calculateAchievementStarLevel,
  isAchievementGuardActive,
} from "../../../domain/progression/prestige/achievement-guards.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";

export const CAPTURED_FOREIGN_CONTROL = "foreign";
export const CAPTURED_FOREIGN_PANEL_SELECTOR = "#foreign";
export const CAPTURED_FOREIGN_MAX_INDEX = 4;

export type CapturedForeignRank = "Inferior" | "Superior" | "Rival";
export type CapturedForeignEspionage =
  "influence" | "sabotage" | "incite" | "annex" | "purchase";

export interface CapturedForeignGovernment {
  readonly governmentId: number;
  readonly rank: CapturedForeignRank;
  /** The policy selected for the foreign action, before battle-only suppression. */
  readonly espionagePolicy: string;
  readonly policy: string;
  readonly military: number;
  readonly spyCount: number;
  readonly sabotageProgress: number;
  /** The running espionage operation (`gov.act`: an operation id or `'none'`), if named. */
  readonly activeEspionage: string | undefined;
  readonly hostility: number | undefined;
  readonly unrest: number | undefined;
  readonly economy: number | undefined;
  readonly occupied: boolean;
  readonly annexed: boolean;
  readonly purchased: boolean;
}

export interface CapturedForeignStrategy {
  readonly governments: readonly CapturedForeignGovernment[];
  /** The selected target before battle-only stop conditions are applied. */
  readonly selectedTargetId: number | null;
  /** The selected target if the battle planner is allowed to act this cycle. */
  readonly battleTargetId: number | null;
  /** Whether unification is wanted: the `foreignUnification` setting or an achievement goal. */
  readonly unificationRequested: boolean;
}

function capturedForeignSettingBoolean(
  settings: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  return typeof settings[key] === "boolean"
    ? (settings[key] as boolean)
    : fallback;
}

function capturedForeignSettingNumber(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return finite(settings[key]) ?? fallback;
}

function capturedForeignSettingString(
  settings: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  return typeof settings[key] === "string"
    ? (settings[key] as string)
    : fallback;
}

function capturedForeignInvokeBoolean(
  controls: GameControlRegistry,
  control: GameControlHandle,
  method: string,
  args: readonly unknown[] = [],
): boolean | undefined {
  const result = controls.invoke(control, method, args);
  return result.ok && typeof result.value === "boolean"
    ? result.value
    : undefined;
}

export function capturedForeignPolicy(
  settings: Record<string, unknown>,
  index: number,
  military: number,
): { readonly rank: CapturedForeignRank; readonly policy: string } {
  const threshold = capturedForeignSettingNumber(
    settings,
    "foreignPowerRequired",
    75,
  );
  const rank: CapturedForeignRank =
    index === 3 ? "Rival" : military <= threshold ? "Inferior" : "Superior";
  return Object.freeze({
    rank,
    policy: capturedForeignSettingString(
      settings,
      `foreignPolicy${rank}`,
      "Ignore",
    ),
  });
}

export function readCapturedForeignGovernment(
  root: unknown,
  index: number,
  policy: string,
  rank: CapturedForeignRank,
  espionagePolicy = policy,
): CapturedForeignGovernment | undefined {
  const government = readProperty(
    readProperty(readProperty(root, "civic"), "foreign"),
    `gov${index}`,
  );
  if (!isRecord(government) || Array.isArray(government)) return undefined;
  const military = finite(government["mil"]);
  if (military === undefined) return undefined;
  return Object.freeze({
    governmentId: index,
    rank,
    espionagePolicy,
    policy,
    military,
    spyCount: finite(government["spy"]) ?? 0,
    sabotageProgress: finite(government["sab"]) ?? 0,
    activeEspionage:
      typeof government["act"] === "string" ? government["act"] : undefined,
    hostility: finite(government["hstl"]),
    unrest: finite(government["unrest"]),
    economy: finite(government["eco"]),
    occupied: Boolean(government["occ"]),
    annexed: Boolean(government["anx"]),
    purchased: Boolean(government["buy"]),
  });
}

export function readCapturedForeignTargets(
  root: unknown,
  controls: GameControlRegistry,
  foreign: GameControlHandle,
  settings: Record<string, unknown>,
): readonly CapturedForeignGovernment[] {
  const governments: CapturedForeignGovernment[] = [];
  for (let index = 0; index <= CAPTURED_FOREIGN_MAX_INDEX; index += 1) {
    const rawGovernment = readProperty(
      readProperty(readProperty(root, "civic"), "foreign"),
      `gov${index}`,
    );
    const military = isRecord(rawGovernment)
      ? finite(rawGovernment["mil"])
      : undefined;
    if (military === undefined) continue;
    if (
      capturedForeignInvokeBoolean(controls, foreign, "gvis", [index]) !== true
    ) {
      continue;
    }
    const policy = capturedForeignPolicy(settings, index, military);
    const target = readCapturedForeignGovernment(
      root,
      index,
      policy.policy,
      policy.rank,
    );
    if (target !== undefined) governments.push(target);
  }
  return Object.freeze(governments);
}

export function capturedForeignGovernmentWithPolicy(
  target: CapturedForeignGovernment,
  policy: string,
  espionagePolicy = policy === "Ignore" ? target.espionagePolicy : policy,
): CapturedForeignGovernment {
  if (target.policy === policy && target.espionagePolicy === espionagePolicy)
    return target;
  return Object.freeze({ ...target, policy, espionagePolicy });
}

export function capturedForeignPacifistGuardActive(
  root: unknown,
  settings: Record<string, unknown>,
): boolean {
  if (
    settings["achievementGuards"] !== true ||
    settings["guardPacifist"] === false
  ) {
    return false;
  }
  const attacks = finite(readProperty(readProperty(root, "stats"), "attacks"));
  const earnedStar = readCapturedAchievementStar(root, "pacifist");
  const race = readProperty(root, "race");
  const targetStar = calculateAchievementStarLevel({
    challengePlasmid: Boolean(readProperty(race, "no_plasmid")),
    challengeTrade: Boolean(readProperty(race, "no_trade")),
    challengeCraft: Boolean(readProperty(race, "no_craft")),
    challengeCrispr: Boolean(readProperty(race, "no_crispr")),
  });
  if (attacks === undefined || earnedStar === undefined) return true;
  return isAchievementGuardActive({
    guard: "guardPacifist",
    enabled: true,
    earnedStar,
    targetStar,
    attacks,
  });
}

function capturedForeignAchievementGoal(
  root: unknown,
  settings: Record<string, unknown>,
  governments: readonly CapturedForeignGovernment[],
): ForeignAchievementGoal | null {
  const states: ForeignAchievementState[] = [];
  for (let index = 0; index < 3; index += 1) {
    const target = governments.find(
      (candidate) => candidate.governmentId === index,
    );
    if (target === undefined) return null;
    states.push({
      occupied: target.occupied,
      annexed: target.annexed,
      purchased: target.purchased,
    });
  }
  return planCapturedForeignAchievementGoal(root, settings, states);
}

function planCapturedForeignAchievementGoal(
  root: unknown,
  settings: Record<string, unknown>,
  states: readonly ForeignAchievementState[],
): ForeignAchievementGoal | null {
  if (settings["achievementGuards"] !== true) return null;
  const guardWorldDomination = capturedForeignSettingBoolean(
    settings,
    "guardWorldDomination",
    true,
  );
  const guardSyndicate = capturedForeignSettingBoolean(
    settings,
    "guardSyndicate",
    true,
  );
  if (!guardWorldDomination && !guardSyndicate) return null;
  const worldDominationUnlocked = guardWorldDomination
    ? readCapturedAchievementStar(root, "world_domination")
    : 0;
  const syndicateUnlocked = guardSyndicate
    ? readCapturedAchievementStar(root, "syndicate")
    : 0;
  if (
    (guardWorldDomination && worldDominationUnlocked === undefined) ||
    (guardSyndicate && syndicateUnlocked === undefined)
  ) {
    return null;
  }
  return planForeignAchievementGoal({
    guardWorldDomination,
    guardSyndicate,
    worldDominationUnlocked:
      guardWorldDomination && worldDominationUnlocked !== undefined
        ? worldDominationUnlocked >= 1
        : false,
    syndicateUnlocked:
      guardSyndicate && syndicateUnlocked !== undefined
        ? syndicateUnlocked >= 1
        : false,
    pacifistGuardActive: capturedForeignPacifistGuardActive(root, settings),
    foreignStates: states,
  });
}

export function capturedForeignResourceAmount(
  root: unknown,
  resourceId: string,
): number | undefined {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  return (
    finite(readProperty(resource, "amount")) ??
    finite(readProperty(resource, "currentQuantity"))
  );
}

/**
 * Mirrors upstream `spyActive()` (DeadSpace `civics.js`): espionage ends with cataclysm or
 * isolation, with unification off the standard path, and with the rival collapse
 * (`tech.shadow >= 3`) on True Path.
 */
export function capturedForeignSpyActive(root: unknown): boolean {
  const race = readProperty(root, "race");
  if (!isRecord(race)) return false;
  if (readProperty(race, "cataclysm")) return false;
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return false;
  if (readProperty(tech, "isolation")) return false;
  if (!readProperty(tech, "world_control")) return true;
  if (!readProperty(race, "truepath")) return false;
  return (finite(readProperty(tech, "shadow")) ?? 0) < 3;
}

/**
 * Whether the game's Foreign panel can exist now. Upstream `vis()` is
 * `garrison.display && spyActive()`, so this is the answer where no captured control can
 * give it; prefer invoking the control's own `vis` once it exists.
 */
export function capturedForeignPanelAvailable(root: unknown): boolean {
  const garrison = readProperty(readProperty(root, "civic"), "garrison");
  return (
    isRecord(garrison) &&
    readProperty(garrison, "display") === true &&
    capturedForeignSpyActive(root)
  );
}

/**
 * Whether a Purchase reservation could be wanted: the `foreignUnification` setting, an
 * achievement goal forcing Purchase, or the pacifist guard — the compatibility
 * `(unificationRequested || guardActive("guardPacifist"))` gate, read from the root and
 * settings alone so the prerequisite phase can use it without a control.
 */
export function readCapturedForeignUnificationWanted(
  root: unknown,
  settings: Record<string, unknown>,
): boolean {
  if (capturedForeignSettingBoolean(settings, "foreignUnification", true)) {
    return true;
  }
  const states: ForeignAchievementState[] = [];
  for (let index = 0; index < 3; index += 1) {
    const government = readProperty(
      readProperty(readProperty(root, "civic"), "foreign"),
      `gov${index}`,
    );
    if (!isRecord(government)) return false;
    states.push({
      occupied: Boolean(government["occ"]),
      annexed: Boolean(government["anx"]),
      purchased: Boolean(government["buy"]),
    });
  }
  if (planCapturedForeignAchievementGoal(root, settings, states) !== null) {
    return true;
  }
  return capturedForeignPacifistGuardActive(root, settings);
}

export function capturedForeignGovernmentPrice(
  target: CapturedForeignGovernment,
): number | undefined {
  if (
    target.economy === undefined ||
    target.hostility === undefined ||
    target.unrest === undefined
  ) {
    return undefined;
  }
  // Mirrors the upstream module-lexical govPrice(gov); no captured price
  // closure is exposed by the foreign component.
  const price =
    target.economy *
    15384 *
    (1 + (target.hostility * 1.6) / 100) *
    (1 - (target.unrest * 0.25) / 100);
  return Number.isFinite(price) ? Math.round(price) : undefined;
}

export function capturedForeignEspionageUseful(
  root: unknown,
  target: CapturedForeignGovernment,
  espionage: CapturedForeignEspionage,
): boolean {
  const spies = target.spyCount;
  switch (espionage) {
    case "influence":
      return (
        target.hostility !== undefined &&
        target.hostility > (spies > 0 ? 0 : 10)
      );
    case "sabotage":
      return (
        target.sabotageProgress === 0 && target.military > (spies > 1 ? 50 : 74)
      );
    case "incite":
      return (
        target.governmentId < 3 &&
        target.unrest !== undefined &&
        target.unrest < 100
      );
    case "annex": {
      const morale = finite(
        readProperty(
          readProperty(readProperty(root, "city"), "morale"),
          "current",
        ),
      );
      return (
        target.governmentId < 3 &&
        target.hostility !== undefined &&
        target.unrest !== undefined &&
        target.hostility <= 50 &&
        target.unrest >= 50 &&
        morale !== undefined &&
        morale >= 200 + target.hostility - target.unrest
      );
    }
    case "purchase": {
      const price = capturedForeignGovernmentPrice(target);
      const money = capturedForeignResourceAmount(root, "Money");
      return (
        target.governmentId < 3 &&
        spies >= 3 &&
        price !== undefined &&
        money !== undefined &&
        money >= price
      );
    }
  }
}

export function selectCapturedForeignStrategy(
  root: unknown,
  settings: Record<string, unknown>,
  governments: readonly CapturedForeignGovernment[],
): CapturedForeignStrategy {
  const achievementGoal = capturedForeignAchievementGoal(
    root,
    settings,
    governments,
  );
  const achievementPolicy =
    achievementGoal === "world-domination"
      ? "Occupy"
      : achievementGoal === "syndicate"
        ? "Purchase"
        : null;
  const active = governments.map((target) =>
    target.governmentId < 3 && achievementPolicy !== null
      ? capturedForeignGovernmentWithPolicy(target, achievementPolicy)
      : target,
  );
  const unificationRequested =
    capturedForeignSettingBoolean(settings, "foreignUnification", true) ||
    achievementGoal !== null;
  const controlledForeigns = active.filter(
    (target) =>
      (target.annexed && target.policy === "Annex") ||
      (target.purchased && target.policy === "Purchase") ||
      (target.occupied && target.policy === "Occupy"),
  ).length;
  let currentTarget = active.find(
    (target) =>
      target.rank === "Inferior" && !target.annexed && !target.purchased,
  );
  currentTarget =
    currentTarget ?? active.find((target) => target.occupied) ?? active[0];
  if (currentTarget === undefined) {
    return Object.freeze({
      governments: Object.freeze(active),
      selectedTargetId: null,
      battleTargetId: null,
      unificationRequested,
    });
  }

  const readyToUnify =
    unificationRequested &&
    controlledForeigns >= 2 &&
    readProperty(readProperty(root, "tech"), "unify") === 1;
  if (
    !readyToUnify &&
    (currentTarget.policy === "Annex" || currentTarget.policy === "Purchase") &&
    capturedForeignEspionageUseful(
      root,
      currentTarget,
      currentTarget.policy === "Annex" ? "annex" : "purchase",
    )
  ) {
    const replacement = capturedForeignGovernmentWithPolicy(
      currentTarget,
      "Ignore",
    );
    active.splice(
      active.findIndex(
        (candidate) => candidate.governmentId === replacement.governmentId,
      ),
      1,
      replacement,
    );
    currentTarget = replacement;
  }
  if (
    !readyToUnify &&
    capturedForeignSettingBoolean(settings, "foreignForceSabotage", true) &&
    currentTarget.governmentId !== 3 &&
    capturedForeignEspionageUseful(root, currentTarget, "sabotage")
  ) {
    const replacement = capturedForeignGovernmentWithPolicy(
      currentTarget,
      "Sabotage",
    );
    active.splice(
      active.findIndex(
        (candidate) => candidate.governmentId === replacement.governmentId,
      ),
      1,
      replacement,
    );
    currentTarget = replacement;
  }
  if (
    unificationRequested &&
    capturedForeignSettingBoolean(settings, "foreignOccupyLast", true) &&
    !readProperty(readProperty(root, "tech"), "world_control")
  ) {
    const superiorPolicy = capturedForeignSettingString(
      settings,
      "foreignPolicySuperior",
      "Ignore",
    );
    const lastTargetId = ["Occupy", "Sabotage"].includes(superiorPolicy)
      ? 2
      : currentTarget.governmentId;
    const lastTargetIndex = active.findIndex(
      (candidate) => candidate.governmentId === lastTargetId,
    );
    if (lastTargetIndex >= 0) {
      active.splice(
        lastTargetIndex,
        1,
        capturedForeignGovernmentWithPolicy(
          active[lastTargetIndex]!,
          readyToUnify ? (achievementPolicy ?? "Occupy") : "Sabotage",
        ),
      );
    }
  }
  const refreshedTarget = active.find(
    (candidate) => candidate.governmentId === currentTarget!.governmentId,
  );
  if (refreshedTarget === undefined) {
    return Object.freeze({
      governments: Object.freeze(active),
      selectedTargetId: null,
      battleTargetId: null,
      unificationRequested,
    });
  }
  const stopBattle =
    refreshedTarget.policy === "Influence" ||
    (readyToUnify && refreshedTarget.policy !== "Occupy") ||
    (refreshedTarget.policy === "Betrayal" && refreshedTarget.military > 75);
  return Object.freeze({
    governments: Object.freeze(active),
    selectedTargetId: refreshedTarget.governmentId,
    battleTargetId: stopBattle ? null : refreshedTarget.governmentId,
    unificationRequested,
  });
}

export function capturedForeignEspionageTriggerSelector(
  governmentId: number,
): string {
  return `#gov${governmentId} div span:nth-child(3) button`;
}

export function capturedForeignOperationMethod(
  operation: CapturedForeignEspionage,
): string {
  return operation;
}
