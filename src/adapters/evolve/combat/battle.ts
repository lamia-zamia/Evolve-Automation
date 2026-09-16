/** Captured DeadSpace battle control: read the live garrison/foreign state and drive game methods. */

import type {
  BattleCycleInput,
  BattleOccupationTargetInput,
  BattleParameters,
  BattlePlunderTargetInput,
  BattleTactic,
  BattleTacticValues,
  BattlefieldInput,
  LaunchBattleDecision,
} from "../../../domain/combat/battle.ts";
import { planBattle } from "../../../domain/combat/battle.ts";
import {
  planForeignAchievementGoal,
  type ForeignAchievementGoal,
  type ForeignAchievementState,
} from "../../../domain/combat/foreign-achievements.ts";
import {
  calculateAchievementStarLevel,
  isAchievementGuardActive,
} from "../../../domain/progression/prestige/achievement-guards.ts";
import type { BattleExecutor, BattleReader } from "../../../ports/battle.ts";
import type { GameActivitySink } from "../../../ports/game-message-log.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameKeyStateReader } from "../../../ports/game-key-state.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";
import {
  HELL_GARRISON_CONTROLS,
  readCapturedHellGarrison,
} from "./captured-hell-garrison.ts";

const CAPTURED_BATTLE_FOREIGN_CONTROL = "foreign";
const CAPTURED_BATTLE_GARRISON_CONTROLS = ["garrison", "c_garrison"] as const;
const CAPTURED_BATTLE_MAX_FOREIGN_INDEX = 4;
const CAPTURED_BATTLE_ENEMY_FACTORS: BattleTacticValues = Object.freeze([
  5, 27.5, 62.5, 125, 300,
]);
const CAPTURED_BATTLE_EMPTY_TACTICS: BattleTacticValues = Object.freeze([
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
]);
const CAPTURED_BATTLE_MAX_ADJUSTMENT_STEPS = 100_000;

type CapturedBattleForeignRank = "Inferior" | "Superior" | "Rival";

interface CapturedBattleGovernment {
  readonly input: BattlePlunderTargetInput;
  readonly government: Record<string, unknown>;
  readonly rank: CapturedBattleForeignRank;
  readonly hostility: number | undefined;
  readonly unrest: number | undefined;
  readonly economy: number | undefined;
}

interface CapturedBattleCycle {
  readonly root: unknown;
  readonly garrison: GameControlHandle;
  readonly foreign: GameControlHandle;
  readonly hell: GameControlHandle | undefined;
  readonly input: Readonly<BattleCycleInput>;
  readonly currentTactic: number;
  readonly raid: number;
  readonly attacks: number;
  readonly occupationSupported: boolean;
}

interface CapturedBattleSession {
  readonly root: unknown;
  readonly garrison: GameControlHandle;
  readonly foreign: GameControlHandle;
  readonly hell: GameControlHandle | undefined;
  readonly input: Readonly<BattleCycleInput>;
  readonly parameters: Readonly<BattleParameters>;
  readonly battlefield: Readonly<BattlefieldInput>;
  readonly governments: ReadonlyMap<number, CapturedBattleGovernment>;
  readonly currentTactic: number;
  readonly raid: number;
  readonly attacks: number;
  readonly occupationSupported: boolean;
}

export interface CapturedBattleDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  /** Optional only for tests; production uses it to pause while a modifier is held. */
  readonly keyState?: GameKeyStateReader;
  readonly readSettings: () => unknown;
  /** Reports a successful attack or release after its game-owned postcondition changed. */
  readonly onActivity?: GameActivitySink;
}

function capturedBattleSettingNumber(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return finite(settings[key]) ?? fallback;
}

function capturedBattleSettingBoolean(
  settings: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  return typeof settings[key] === "boolean"
    ? (settings[key] as boolean)
    : fallback;
}

function capturedBattleSettingString(
  settings: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  return typeof settings[key] === "string"
    ? (settings[key] as string)
    : fallback;
}

function capturedBattleHasMethods(
  control: GameControlHandle | undefined,
  methods: readonly string[],
): control is GameControlHandle {
  return (
    control !== undefined &&
    methods.every((method) => control.methods.includes(method))
  );
}

function capturedBattleResolveControl(
  controls: GameControlRegistry,
  elementIds: readonly string[],
  methods: readonly string[],
): GameControlHandle | undefined {
  for (const elementId of elementIds) {
    const control = controls.resolve(elementId);
    if (capturedBattleHasMethods(control, methods)) return control;
  }
  return undefined;
}

function capturedBattleInvokeNumber(
  controls: GameControlRegistry,
  control: GameControlHandle,
  method: string,
  args: readonly unknown[] = [],
): number | undefined {
  const result = controls.invoke(control, method, args);
  return result.ok ? finite(result.value) : undefined;
}

function capturedBattleInvokeBoolean(
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

function capturedBattleReadGovernment(
  root: unknown,
  index: number,
  policy: string,
  rank: CapturedBattleForeignRank,
): CapturedBattleGovernment | undefined {
  const government = readProperty(
    readProperty(readProperty(root, "civic"), "foreign"),
    `gov${index}`,
  );
  if (!isRecord(government) || Array.isArray(government)) return undefined;
  const military = finite(government["mil"]);
  if (military === undefined) return undefined;
  const spyCount = finite(government["spy"]) ?? 0;
  const input: BattlePlunderTargetInput = Object.freeze({
    governmentId: index,
    policy,
    // Upstream has no `released` field. A controlled foreign power is released by
    // the same campaign closure that clears occ/anx/buy, so this is a per-cycle
    // action marker rather than a copied manager state field.
    released: false,
    occupied: Boolean(government["occ"]),
    annexed: Boolean(government["anx"]),
    purchased: Boolean(government["buy"]),
    spyCount,
    minimumSoldiers: CAPTURED_BATTLE_EMPTY_TACTICS,
    maximumSoldiers: CAPTURED_BATTLE_EMPTY_TACTICS,
  });
  return Object.freeze({
    input,
    government,
    rank,
    hostility: finite(government["hstl"]),
    unrest: finite(government["unrest"]),
    economy: finite(government["eco"]),
  });
}

// DeadSpace exposes `battleAssessment(gov)` as localized prose rather than a numeric
// closure result. This is the sole numeric boundary mirrored here; soldier sizing
// remains delegated to the captured garrison `rating()` oracle below.
function capturedBattleEnemyRating(
  root: unknown,
  government: CapturedBattleGovernment,
  tactic: BattleTactic,
): number | undefined {
  const factor = CAPTURED_BATTLE_ENEMY_FACTORS[tactic];
  const military = finite(government.government["mil"]);
  if (factor === undefined || military === undefined || military < 0)
    return undefined;
  let rating = (factor * military) / 100;
  const race = readProperty(root, "race");
  const city = readProperty(root, "city");
  if (readProperty(race, "banana")) rating *= 2;
  if (readProperty(city, "biome") === "swamp") rating *= 1.4;
  return Number.isFinite(rating) && rating >= 0 ? rating : undefined;
}

function capturedBattleOwnRating(
  controls: GameControlRegistry,
  control: GameControlHandle,
  soldiers: number,
): number | undefined {
  if (!Number.isSafeInteger(soldiers) || soldiers < 0) return undefined;
  return capturedBattleInvokeNumber(controls, control, "rating", [
    soldiers,
    false,
  ]);
}

/** Invert the game's own rounded rating display without reproducing armyRating or race traits. */
function capturedBattleSoldiersForRating(
  controls: GameControlRegistry,
  control: GameControlHandle,
  targetRating: number,
  capacity: number,
): number | undefined {
  if (!Number.isFinite(targetRating) || targetRating <= 0) return 0;
  const upper = Math.floor(capacity);
  if (!Number.isSafeInteger(upper) || upper < 1) return undefined;
  const upperRating = capturedBattleOwnRating(controls, control, upper);
  if (upperRating === undefined) return undefined;
  if (upperRating < targetRating) return upper + 1;

  let low = 1;
  let high = upper;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const rating = capturedBattleOwnRating(controls, control, middle);
    if (rating === undefined) return undefined;
    if (rating >= targetRating) high = middle;
    else low = middle + 1;
  }
  return low;
}

function capturedBattlePolicy(
  settings: Record<string, unknown>,
  index: number,
  military: number,
): { readonly rank: CapturedBattleForeignRank; readonly policy: string } {
  const threshold = capturedBattleSettingNumber(
    settings,
    "foreignPowerRequired",
    75,
  );
  const rank: CapturedBattleForeignRank =
    index === 3 ? "Rival" : military <= threshold ? "Inferior" : "Superior";
  return Object.freeze({
    rank,
    policy: capturedBattleSettingString(
      settings,
      `foreignPolicy${rank}`,
      "Ignore",
    ),
  });
}

function capturedBattleOccupationCost(root: unknown): number | undefined {
  const race = readProperty(root, "race");
  // DeadSpace applies jobScale() inside jobStack(). Its high_pop multiplier is
  // not exposed by the captured garrison, so an Occupy plan is unsafe here.
  if (readProperty(race, "high_pop")) return undefined;
  const government = readProperty(readProperty(root, "civic"), "govern");
  return readProperty(government, "type") === "federation" ? 15 : 20;
}

function capturedBattleAchievementAffix(root: unknown): string | undefined {
  const universe = readProperty(readProperty(root, "race"), "universe");
  if (typeof universe !== "string") return undefined;
  switch (universe) {
    case "evil":
      return "e";
    case "antimatter":
      return "a";
    case "heavy":
      return "h";
    case "micro":
      return "m";
    case "magic":
      return "mg";
    default:
      return "l";
  }
}

function capturedBattleAchievementStar(
  root: unknown,
  achievementId: string,
): number | undefined {
  const stats = readProperty(root, "stats");
  const achievements = readProperty(stats, "achieve");
  const affix = capturedBattleAchievementAffix(root);
  if (!isRecord(achievements) || affix === undefined) return undefined;
  const achievement = readProperty(achievements, achievementId);
  if (achievement === undefined || achievement === null) return 0;
  if (!isRecord(achievement)) return undefined;
  const star = readProperty(achievement, affix);
  return star === undefined || star === null ? 0 : finite(star);
}

function capturedBattlePacifistGuardActive(
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
  const earnedStar = capturedBattleAchievementStar(root, "pacifist");
  const race = readProperty(root, "race");
  const targetStar = calculateAchievementStarLevel({
    challengePlasmid: Boolean(readProperty(race, "no_plasmid")),
    challengeTrade: Boolean(readProperty(race, "no_trade")),
    challengeCraft: Boolean(readProperty(race, "no_craft")),
    challengeCrispr: Boolean(readProperty(race, "no_crispr")),
  });
  // An enabled achievement guard with an incomplete capture must not be
  // treated as inactive before an automatic campaign is launched.
  if (attacks === undefined || earnedStar === undefined) return true;
  return isAchievementGuardActive({
    guard: "guardPacifist",
    enabled: true,
    earnedStar,
    targetStar,
    attacks,
  });
}

function capturedBattleAchievementGoal(
  root: unknown,
  settings: Record<string, unknown>,
  governments: readonly CapturedBattleGovernment[],
): ForeignAchievementGoal | null {
  if (settings["achievementGuards"] !== true) return null;
  const guardWorldDomination = capturedBattleSettingBoolean(
    settings,
    "guardWorldDomination",
    true,
  );
  const guardSyndicate = capturedBattleSettingBoolean(
    settings,
    "guardSyndicate",
    true,
  );
  if (!guardWorldDomination && !guardSyndicate) return null;
  const states: ForeignAchievementState[] = [];
  for (let index = 0; index < 3; index += 1) {
    const target = governments.find(
      (candidate) => candidate.input.governmentId === index,
    );
    if (target === undefined) return null;
    states.push({
      occupied: target.input.occupied,
      annexed: target.input.annexed,
      purchased: target.input.purchased,
    });
  }
  const worldDominationUnlocked = guardWorldDomination
    ? capturedBattleAchievementStar(root, "world_domination")
    : 0;
  const syndicateUnlocked = guardSyndicate
    ? capturedBattleAchievementStar(root, "syndicate")
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
    pacifistGuardActive: capturedBattlePacifistGuardActive(root, settings),
    foreignStates: states,
  });
}

function capturedBattleResourceAmount(
  root: unknown,
  resourceId: string,
): number | undefined {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  return (
    finite(readProperty(resource, "amount")) ??
    finite(readProperty(resource, "currentQuantity"))
  );
}

function capturedBattleGovernmentPrice(
  target: CapturedBattleGovernment,
): number | undefined {
  const military = finite(target.government["mil"]);
  if (
    target.economy === undefined ||
    target.hostility === undefined ||
    target.unrest === undefined ||
    military === undefined
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

function capturedBattleEspionageUseful(
  root: unknown,
  target: CapturedBattleGovernment,
  espionage: "influence" | "sabotage" | "annex" | "purchase",
): boolean {
  const military = finite(target.government["mil"]);
  const spies = target.input.spyCount;
  if (military === undefined) return false;
  switch (espionage) {
    case "influence":
      return (
        target.hostility !== undefined &&
        target.hostility > (spies > 0 ? 0 : 10)
      );
    case "sabotage":
      return spies < 1 || military > (spies > 1 ? 50 : 74);
    case "annex": {
      const morale = finite(
        readProperty(readProperty(root, "city"), "morale") &&
          readProperty(
            readProperty(readProperty(root, "city"), "morale"),
            "current",
          ),
      );
      return (
        target.hostility !== undefined &&
        target.unrest !== undefined &&
        target.hostility <= 50 &&
        target.unrest >= 50 &&
        morale !== undefined &&
        morale >= 200 + target.hostility - target.unrest
      );
    }
    case "purchase": {
      const price = capturedBattleGovernmentPrice(target);
      const money = capturedBattleResourceAmount(root, "Money");
      return (
        spies >= 3 &&
        price !== undefined &&
        money !== undefined &&
        money >= price
      );
    }
  }
}

function capturedBattleWithPolicy(
  target: CapturedBattleGovernment,
  policy: string,
): CapturedBattleGovernment {
  if (target.input.policy === policy) return target;
  return Object.freeze({
    ...target,
    input: Object.freeze({ ...target.input, policy }),
  });
}

interface CapturedBattleForeignStrategy {
  readonly governments: readonly CapturedBattleGovernment[];
  readonly currentTargetId: number | null;
}

function capturedBattleForeignStrategy(
  root: unknown,
  settings: Record<string, unknown>,
  governments: readonly CapturedBattleGovernment[],
): CapturedBattleForeignStrategy {
  const achievementGoal = capturedBattleAchievementGoal(
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
    target.input.governmentId < 3 && achievementPolicy !== null
      ? capturedBattleWithPolicy(target, achievementPolicy)
      : target,
  );
  const unificationRequested =
    capturedBattleSettingBoolean(settings, "foreignUnification", true) ||
    achievementGoal !== null;
  const controlledForeigns = active.filter(
    (target) =>
      (target.input.annexed && target.input.policy === "Annex") ||
      (target.input.purchased && target.input.policy === "Purchase") ||
      (target.input.occupied && target.input.policy === "Occupy"),
  ).length;
  let currentTarget = active.find(
    (target) =>
      target.rank === "Inferior" &&
      !target.input.annexed &&
      !target.input.purchased,
  );
  currentTarget =
    currentTarget ??
    active.find((target) => target.input.occupied) ??
    active[0];
  if (currentTarget === undefined) {
    return Object.freeze({
      governments: Object.freeze(active),
      currentTargetId: null,
    });
  }

  const readyToUnify =
    unificationRequested &&
    controlledForeigns >= 2 &&
    readProperty(readProperty(root, "tech"), "unify") === 1;
  if (
    !readyToUnify &&
    (currentTarget.input.policy === "Annex" ||
      currentTarget.input.policy === "Purchase") &&
    capturedBattleEspionageUseful(
      root,
      currentTarget,
      currentTarget.input.policy === "Annex" ? "annex" : "purchase",
    )
  ) {
    const replacement = capturedBattleWithPolicy(currentTarget, "Ignore");
    active.splice(
      active.findIndex(
        (candidate) =>
          candidate.input.governmentId === replacement.input.governmentId,
      ),
      1,
      replacement,
    );
    currentTarget = replacement;
  }
  if (
    !readyToUnify &&
    capturedBattleSettingBoolean(settings, "foreignForceSabotage", true) &&
    currentTarget.input.governmentId !== 3 &&
    capturedBattleEspionageUseful(root, currentTarget, "sabotage")
  ) {
    const replacement = capturedBattleWithPolicy(currentTarget, "Sabotage");
    active.splice(
      active.findIndex(
        (candidate) =>
          candidate.input.governmentId === replacement.input.governmentId,
      ),
      1,
      replacement,
    );
    currentTarget = replacement;
  }
  if (
    unificationRequested &&
    capturedBattleSettingBoolean(settings, "foreignOccupyLast", true) &&
    !readProperty(readProperty(root, "tech"), "world_control")
  ) {
    const superiorPolicy = capturedBattleSettingString(
      settings,
      "foreignPolicySuperior",
      "Ignore",
    );
    const lastTargetId = ["Occupy", "Sabotage"].includes(superiorPolicy)
      ? 2
      : currentTarget.input.governmentId;
    const lastTargetIndex = active.findIndex(
      (candidate) => candidate.input.governmentId === lastTargetId,
    );
    if (lastTargetIndex >= 0) {
      active.splice(
        lastTargetIndex,
        1,
        capturedBattleWithPolicy(
          active[lastTargetIndex]!,
          readyToUnify ? (achievementPolicy ?? "Occupy") : "Sabotage",
        ),
      );
    }
  }
  const refreshedTarget = active.find(
    (candidate) =>
      candidate.input.governmentId === currentTarget!.input.governmentId,
  );
  const stopTarget =
    refreshedTarget === undefined ||
    refreshedTarget.input.policy === "Influence" ||
    (readyToUnify && refreshedTarget.input.policy !== "Occupy") ||
    (refreshedTarget.input.policy === "Betrayal" &&
      finite(refreshedTarget.government["mil"])! > 75);
  return Object.freeze({
    governments: Object.freeze(active),
    currentTargetId: stopTarget ? null : refreshedTarget!.input.governmentId,
  });
}

function capturedBattleHellReserveKnown(
  root: unknown,
  settings: Record<string, unknown>,
): boolean {
  const portal = readProperty(root, "portal");
  const soulForge = readProperty(portal, "soul_forge");
  if (isRecord(soulForge) && (finite(soulForge["count"]) ?? 0) > 0)
    return false;
  const guardPost = readProperty(portal, "guard_post");
  if (isRecord(guardPost) && (finite(guardPost["count"]) ?? 0) > 0)
    return false;
  const assaultForge = readProperty(portal, "assault_forge");
  const hellPit = finite(readProperty(readProperty(root, "tech"), "hell_pit"));
  if (
    capturedBattleSettingBoolean(settings, "autoBuild", false) &&
    capturedBattleSettingBoolean(settings, "hellAssaultReserve", true) &&
    (hellPit === 2 ||
      (isRecord(assaultForge) && (finite(assaultForge["count"]) ?? 0) === 0))
  ) {
    // The captured root cannot answer isAutoBuildable() or the live forge
    // costs, so Hell is not available while a future reserve may be due.
    return false;
  }
  return true;
}

function capturedBattleEmptyCycle(): BattleCycleInput {
  return Object.freeze({
    available: false,
    wounded: 0,
    deadSoldiers: 0,
    currentCityGarrison: 0,
    maxCityGarrison: 0,
    availableGarrison: 0,
    healthySoldiersPercent: 0,
    livingSoldiersPercent: 0,
    protectMode: "never",
    minimumAdvantage: 0,
    maximumAdvantage: 0,
    maximumSiegeBattalion: 0,
    recruitmentProgress: 0,
    recruitmentRate: 1,
    healingRate: 1,
    scalesArmor: 0,
    armorTechnology: 0,
    armoredDivisor: 1,
    frailPenalty: 0,
    highPopulationMultiplier: 1,
    ragePlanet: false,
    autoHell: false,
    hellAvailable: false,
    maximumSoldiers: 0,
    hellReservedSoldiers: 0,
    hellSoldiers: 0,
    hellGarrison: 0,
    hellPatrolSize: 1,
    occupationCost: 0,
    portalVisible: false,
    unificationEnabled: false,
    occupyLast: false,
  });
}

function capturedBattleModifierHeld(
  root: unknown,
  keyState: GameKeyStateReader | undefined,
): boolean {
  if (keyState === undefined) return false;
  const settings = readProperty(root, "settings");
  if (readProperty(settings, "mKeys") !== true) return false;
  const keyMap = readProperty(settings, "keyMap");
  for (const key of ["x10", "x25", "x100"] as const) {
    const mapped = readProperty(keyMap, key);
    if (
      (typeof mapped === "string" || typeof mapped === "number") &&
      keyState.readPressed(mapped) === true
    ) {
      return true;
    }
  }
  return false;
}

function capturedBattleReadCycle(
  dependencies: CapturedBattleDependencies,
): CapturedBattleCycle | undefined {
  const root = dependencies.rootState.readRoot();
  if (!isRecord(root)) return undefined;
  if (capturedBattleModifierHeld(root, dependencies.keyState)) return undefined;

  const settingsValue = dependencies.readSettings();
  const settings = isRecord(settingsValue) ? settingsValue : {};
  if (
    capturedBattleSettingBoolean(settings, "foreignPacifist", false) ||
    capturedBattlePacifistGuardActive(root, settings)
  ) {
    return undefined;
  }
  const foreign = capturedBattleResolveControl(
    dependencies.controls,
    [CAPTURED_BATTLE_FOREIGN_CONTROL],
    ["vis", "gvis"],
  );
  const garrison = capturedBattleResolveControl(
    dependencies.controls,
    CAPTURED_BATTLE_GARRISON_CONTROLS,
    ["campaign", "next", "last", "aNext", "aLast", "rating", "hell", "s_max"],
  );
  if (foreign === undefined || garrison === undefined) return undefined;
  if (
    capturedBattleInvokeBoolean(dependencies.controls, foreign, "vis") !== true
  ) {
    return undefined;
  }

  const civic = readProperty(root, "civic");
  const rawGarrison = readProperty(civic, "garrison");
  if (!isRecord(rawGarrison) || Array.isArray(rawGarrison)) return undefined;
  const workers = finite(rawGarrison["workers"]);
  const maximumWorkers = finite(rawGarrison["max"]);
  const crew = finite(rawGarrison["crew"]);
  const wounded = finite(rawGarrison["wounded"]);
  const raid = finite(rawGarrison["raid"]);
  const currentTactic = finite(rawGarrison["tactic"]);
  const currentCityGarrison = capturedBattleInvokeNumber(
    dependencies.controls,
    garrison,
    "hell",
  );
  const maxCityGarrison = capturedBattleInvokeNumber(
    dependencies.controls,
    garrison,
    "s_max",
  );
  const attacks = finite(readProperty(readProperty(root, "stats"), "attacks"));
  if (
    workers === undefined ||
    maximumWorkers === undefined ||
    crew === undefined ||
    wounded === undefined ||
    raid === undefined ||
    currentTactic === undefined ||
    currentCityGarrison === undefined ||
    maxCityGarrison === undefined ||
    attacks === undefined ||
    maxCityGarrison <= 0
  ) {
    return undefined;
  }

  const protectMode = capturedBattleSettingString(
    settings,
    "foreignProtect",
    "auto",
  );
  // DeadSpace does not expose soldier healing as a component method. Auto protection is
  // intentionally paused while wounded soldiers exist instead of guessing that rate.
  if (protectMode === "auto" && wounded > 0) return undefined;

  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const city = readProperty(root, "city");
  const planetTraits = readProperty(city, "ptrait");
  if (
    protectMode !== "never" &&
    (Boolean(readProperty(race, "frail")) ||
      Boolean(readProperty(race, "high_pop")))
  ) {
    // The fallback trait values below are not safe for protected planning.
    return undefined;
  }
  const occupationCost = capturedBattleOccupationCost(root);
  const occupationSupported = occupationCost !== undefined;
  const autoHell = capturedBattleSettingBoolean(settings, "autoHell", false);
  let hell: GameControlHandle | undefined;
  let hellSoldiers = 0;
  let hellGarrison = 0;
  let hellPatrolSize = 1;
  let hellAvailable = false;
  const hellReserveKnown = capturedBattleHellReserveKnown(root, settings);
  const fortress = readProperty(readProperty(root, "portal"), "fortress");
  if (
    autoHell &&
    isRecord(fortress) &&
    !Array.isArray(fortress) &&
    readProperty(race, "warlord") !== true
  ) {
    const fortressGarrison = finite(fortress["garrison"]);
    const patrolSize = finite(fortress["patrol_size"]);
    hell = capturedBattleResolveControl(
      dependencies.controls,
      HELL_GARRISON_CONTROLS,
      ["aLast", "patDec", "patrolling"],
    );
    const stationed =
      hell === undefined
        ? undefined
        : readCapturedHellGarrison(
            dependencies.rootState,
            dependencies.controls,
          );
    if (
      fortressGarrison !== undefined &&
      patrolSize !== undefined &&
      patrolSize > 0 &&
      stationed !== undefined
    ) {
      hellSoldiers = fortressGarrison;
      hellPatrolSize = patrolSize;
      hellGarrison = stationed;
      hellAvailable = true;
    } else {
      hell = undefined;
    }
  }
  if (!hellReserveKnown) {
    // `patrolling()` answers current defenders, not future automation reserves.
    // Do not expose Hell as withdrawable until those planned reserves are captured.
    hell = undefined;
    hellAvailable = false;
    hellSoldiers = 0;
    hellGarrison = 0;
    hellPatrolSize = 1;
  }

  const input: BattleCycleInput = Object.freeze({
    available: true,
    wounded,
    deadSoldiers: Math.max(0, maximumWorkers - workers),
    currentCityGarrison,
    maxCityGarrison,
    availableGarrison: readProperty(race, "rage")
      ? currentCityGarrison
      : currentCityGarrison - wounded,
    healthySoldiersPercent: capturedBattleSettingNumber(
      settings,
      "foreignAttackHealthySoldiersPercent",
      90,
    ),
    livingSoldiersPercent: capturedBattleSettingNumber(
      settings,
      "foreignAttackLivingSoldiersPercent",
      90,
    ),
    protectMode,
    minimumAdvantage: capturedBattleSettingNumber(
      settings,
      "foreignMinAdvantage",
      40,
    ),
    maximumAdvantage: capturedBattleSettingNumber(
      settings,
      "foreignMaxAdvantage",
      80,
    ),
    maximumSiegeBattalion: capturedBattleSettingNumber(
      settings,
      "foreignMaxSiegeBattalion",
      10,
    ),
    // These are lazily absent only on a not-yet-started garrison; the game treats the missing
    // values as zero/progressing at one for arithmetic in the same phase.
    recruitmentProgress: finite(rawGarrison["progress"]) ?? 0,
    recruitmentRate: finite(rawGarrison["rate"]) ?? 1,
    healingRate: 1,
    // Trait vars are module-lexical and not exposed by the captured garrison. Zero/one keeps
    // protected planning conservative without copying the compatibility trait evaluator.
    scalesArmor: 0,
    armorTechnology: finite(readProperty(tech, "armor")) ?? 0,
    armoredDivisor: 1,
    frailPenalty: 0,
    highPopulationMultiplier: 1,
    ragePlanet: Array.isArray(planetTraits) && planetTraits.includes("rage"),
    autoHell,
    hellAvailable,
    maximumSoldiers: hellAvailable ? maxCityGarrison + hellSoldiers : 0,
    hellReservedSoldiers: 0,
    hellSoldiers,
    hellGarrison,
    hellPatrolSize,
    occupationCost: occupationCost ?? 0,
    portalVisible:
      readProperty(readProperty(root, "settings"), "showPortal") === true,
    unificationEnabled: capturedBattleSettingBoolean(
      settings,
      "foreignUnification",
      true,
    ),
    occupyLast: capturedBattleSettingBoolean(
      settings,
      "foreignOccupyLast",
      true,
    ),
  });
  return Object.freeze({
    root,
    garrison,
    foreign,
    hell: hellAvailable ? hell : undefined,
    input,
    currentTactic,
    raid,
    attacks,
    occupationSupported,
  });
}

function capturedBattleReadTarget(
  root: unknown,
  controls: GameControlRegistry,
  foreign: GameControlHandle,
  index: number,
  settings: Record<string, unknown>,
): CapturedBattleGovernment | undefined {
  const military = finite(
    readProperty(
      readProperty(
        readProperty(readProperty(root, "civic"), "foreign"),
        `gov${index}`,
      ),
      "mil",
    ),
  );
  if (military === undefined) return undefined;
  const policy = capturedBattlePolicy(settings, index, military);
  const visible = capturedBattleInvokeBoolean(controls, foreign, "gvis", [
    index,
  ]);
  return visible === true
    ? capturedBattleReadGovernment(root, index, policy.policy, policy.rank)
    : undefined;
}

function capturedBattleReadPlunderTarget(
  root: unknown,
  controls: GameControlRegistry,
  garrison: GameControlHandle,
  parameters: Readonly<BattleParameters>,
  target: CapturedBattleGovernment,
): BattlePlunderTargetInput | undefined {
  const minimumSoldiers = [...CAPTURED_BATTLE_EMPTY_TACTICS] as number[];
  const maximumSoldiers = [...CAPTURED_BATTLE_EMPTY_TACTICS] as number[];
  const upper = Math.max(
    1,
    Math.floor(
      parameters.autoHell && parameters.hellAvailable
        ? parameters.maximumSoldiers
        : parameters.maxCityGarrison,
    ),
  );
  for (const rawTactic of [0, 1, 2, 3, 4] as const) {
    const tactic = rawTactic as BattleTactic;
    const rating = capturedBattleEnemyRating(root, target, tactic);
    if (rating === undefined) return undefined;
    const minimum = capturedBattleSoldiersForRating(
      controls,
      garrison,
      rating / (1 - parameters.minimumAdvantage / 100),
      upper,
    );
    const maximum = capturedBattleSoldiersForRating(
      controls,
      garrison,
      rating / (1 - parameters.maximumAdvantage / 100),
      upper,
    );
    if (minimum === undefined || maximum === undefined) return undefined;
    minimumSoldiers[tactic] = minimum;
    maximumSoldiers[tactic] = maximum;
  }
  return Object.freeze({
    ...target.input,
    minimumSoldiers: Object.freeze(minimumSoldiers) as BattleTacticValues,
    maximumSoldiers: Object.freeze(maximumSoldiers) as BattleTacticValues,
  });
}

function capturedBattleDecisionsMatch(
  left: Readonly<LaunchBattleDecision>,
  right: Readonly<LaunchBattleDecision>,
): boolean {
  return (
    left.kind === right.kind &&
    left.governmentId === right.governmentId &&
    left.expectedReleased === right.expectedReleased &&
    left.expectedOccupied === right.expectedOccupied &&
    left.expectedAnnexed === right.expectedAnnexed &&
    left.expectedPurchased === right.expectedPurchased &&
    left.spyCount === right.spyCount &&
    left.tactic === right.tactic &&
    left.battalionSize === right.battalionSize &&
    left.releaseControl === right.releaseControl &&
    left.hellPatrolsToRemove === right.hellPatrolsToRemove &&
    left.hellGarrisonToRemove === right.hellGarrisonToRemove
  );
}

function capturedBattleTargetMatches(
  target: CapturedBattleGovernment,
  decision: Readonly<LaunchBattleDecision>,
): boolean {
  return (
    target.input.governmentId === decision.governmentId &&
    target.input.released === decision.expectedReleased &&
    target.input.occupied === decision.expectedOccupied &&
    target.input.annexed === decision.expectedAnnexed &&
    target.input.purchased === decision.expectedPurchased &&
    target.input.spyCount === decision.spyCount
  );
}

function capturedBattleRefreshGovernment(
  root: unknown,
  governmentId: number,
): Record<string, unknown> | undefined {
  const value = readProperty(
    readProperty(readProperty(root, "civic"), "foreign"),
    `gov${governmentId}`,
  );
  return isRecord(value) && !Array.isArray(value) ? value : undefined;
}

function capturedBattleDriveTactic(
  dependencies: CapturedBattleDependencies,
  active: CapturedBattleSession,
  target: BattleTactic,
): boolean {
  for (let step = 0; step <= 5; step += 1) {
    const current = finite(
      readProperty(
        readProperty(readProperty(active.root, "civic"), "garrison"),
        "tactic",
      ),
    );
    if (current === target) return true;
    if (current === undefined || current < 0 || current > 4) return false;
    const method = current < target ? "next" : "last";
    const result = dependencies.controls.invoke(active.garrison, method);
    if (!result.ok) return false;
  }
  return false;
}

function capturedBattleDriveRaid(
  dependencies: CapturedBattleDependencies,
  active: CapturedBattleSession,
  target: number,
): boolean {
  if (!Number.isSafeInteger(target) || target < 0) return false;
  for (let step = 0; step <= CAPTURED_BATTLE_MAX_ADJUSTMENT_STEPS; step += 1) {
    const current = finite(
      readProperty(
        readProperty(readProperty(active.root, "civic"), "garrison"),
        "raid",
      ),
    );
    if (current === target) return true;
    if (current === undefined) return false;
    const method = current < target ? "aNext" : "aLast";
    const result = dependencies.controls.invoke(active.garrison, method);
    if (!result.ok) return false;
  }
  return false;
}

function capturedBattleDriveHell(
  dependencies: CapturedBattleDependencies,
  active: CapturedBattleSession,
  decision: Readonly<LaunchBattleDecision>,
): boolean {
  if (decision.hellPatrolsToRemove > 0 || decision.hellGarrisonToRemove > 0) {
    if (active.hell === undefined) return false;
    const fortress = readProperty(
      readProperty(active.root, "portal"),
      "fortress",
    );
    const patrolsBefore = finite(readProperty(fortress, "patrols"));
    const garrisonBefore = finite(readProperty(fortress, "garrison"));
    if (patrolsBefore === undefined || garrisonBefore === undefined)
      return false;
    const patrolTarget = Math.max(
      0,
      patrolsBefore - decision.hellPatrolsToRemove,
    );
    for (
      let step = 0;
      step <= CAPTURED_BATTLE_MAX_ADJUSTMENT_STEPS;
      step += 1
    ) {
      const patrols = finite(readProperty(fortress, "patrols"));
      if (patrols === undefined) return false;
      if (patrols <= patrolTarget) break;
      const result = dependencies.controls.invoke(active.hell, "patDec");
      if (!result.ok) return false;
    }
    const patrolsAfter = finite(readProperty(fortress, "patrols"));
    if (patrolsAfter === undefined || patrolsAfter > patrolTarget) return false;
    const garrisonTarget = Math.max(
      0,
      garrisonBefore - decision.hellGarrisonToRemove,
    );
    for (
      let step = 0;
      step <= CAPTURED_BATTLE_MAX_ADJUSTMENT_STEPS;
      step += 1
    ) {
      const garrison = finite(readProperty(fortress, "garrison"));
      if (garrison === undefined) return false;
      if (garrison <= garrisonTarget) break;
      const result = dependencies.controls.invoke(active.hell, "aLast");
      if (!result.ok) return false;
    }
    const garrisonAfter = finite(readProperty(fortress, "garrison"));
    if (garrisonAfter === undefined || garrisonAfter > garrisonTarget)
      return false;
  }
  return true;
}

export function createCapturedBattle(
  dependencies: CapturedBattleDependencies,
): { readonly reader: BattleReader; readonly executor: BattleExecutor } {
  const reportActivity = dependencies.onActivity ?? (() => {});
  let cycle: CapturedBattleCycle | undefined;
  let session: CapturedBattleSession | undefined;

  const reader: BattleReader = Object.freeze({
    readCycle(): BattleCycleInput {
      cycle = undefined;
      session = undefined;
      const sample = capturedBattleReadCycle(dependencies);
      if (sample === undefined) return capturedBattleEmptyCycle();
      cycle = sample;
      return sample.input;
    },

    readBattlefield(parameters: Readonly<BattleParameters>): BattlefieldInput {
      const active = cycle;
      if (active === undefined) {
        return Object.freeze({
          currentTarget: null,
          occupationTargets: Object.freeze([]),
        });
      }
      const settingsValue = dependencies.readSettings();
      const settings = isRecord(settingsValue) ? settingsValue : {};
      const governments = new Map<number, CapturedBattleGovernment>();
      for (
        let index = 0;
        index <= CAPTURED_BATTLE_MAX_FOREIGN_INDEX;
        index += 1
      ) {
        const target = capturedBattleReadTarget(
          active.root,
          dependencies.controls,
          active.foreign,
          index,
          settings,
        );
        if (target !== undefined) governments.set(index, target);
      }

      const strategy = capturedBattleForeignStrategy(active.root, settings, [
        ...governments.values(),
      ]);
      const effectiveGovernments = new Map(
        strategy.governments.map((target) => [
          target.input.governmentId,
          target,
        ]),
      );
      const occupationTargets: BattleOccupationTargetInput[] = [];
      for (const target of strategy.governments) {
        if (
          !active.occupationSupported ||
          target.input.policy !== "Occupy" ||
          target.input.occupied
        )
          continue;
        const rating = capturedBattleEnemyRating(active.root, target, 4);
        if (rating === undefined) continue;
        const minimumSiegeSoldiers = capturedBattleSoldiersForRating(
          dependencies.controls,
          active.garrison,
          rating / (1 - parameters.minimumAdvantage / 100),
          Math.max(
            1,
            Math.floor(
              parameters.maximumSoldiers || parameters.maxCityGarrison,
            ),
          ),
        );
        const maximumSiegeSoldiers = capturedBattleSoldiersForRating(
          dependencies.controls,
          active.garrison,
          rating / (1 - parameters.maximumAdvantage / 100),
          Math.max(
            1,
            Math.floor(
              parameters.maximumSoldiers || parameters.maxCityGarrison,
            ),
          ),
        );
        if (
          minimumSiegeSoldiers === undefined ||
          maximumSiegeSoldiers === undefined
        )
          continue;
        occupationTargets.push(
          Object.freeze({
            ...target.input,
            minimumSiegeSoldiers,
            maximumSiegeSoldiers,
          }),
        );
      }

      const selected =
        strategy.currentTargetId === null
          ? undefined
          : effectiveGovernments.get(strategy.currentTargetId);
      const plunderTarget =
        selected !== undefined &&
        !active.occupationSupported &&
        selected.input.policy === "Occupy"
          ? undefined
          : selected;
      const currentTarget =
        plunderTarget === undefined
          ? null
          : capturedBattleReadPlunderTarget(
              active.root,
              dependencies.controls,
              active.garrison,
              parameters,
              plunderTarget,
            );
      const battlefield: BattlefieldInput = Object.freeze({
        currentTarget: currentTarget ?? null,
        occupationTargets: Object.freeze(occupationTargets),
      });
      session = Object.freeze({
        ...active,
        parameters,
        battlefield,
        governments: effectiveGovernments,
      });
      return battlefield;
    },
  });

  const executor: BattleExecutor = Object.freeze({
    execute(decision: Readonly<LaunchBattleDecision>) {
      const active = session;
      if (active === undefined) {
        return stale(
          "captured-battle-session-missing",
          "captured battle session is missing",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        return stale(
          "captured-battle-root-changed",
          "captured game root changed",
        );
      }
      const expected = planBattle(active.parameters, active.battlefield);
      if (
        expected === null ||
        !capturedBattleDecisionsMatch(expected, decision)
      ) {
        return rejected(
          "invalid-captured-battle-decision",
          "captured battle decision does not match the sampled plan",
        );
      }
      const target = active.governments.get(decision.governmentId);
      const government = capturedBattleRefreshGovernment(
        active.root,
        decision.governmentId,
      );
      const attacks = finite(
        readProperty(readProperty(active.root, "stats"), "attacks"),
      );
      const tactic = finite(
        readProperty(
          readProperty(readProperty(active.root, "civic"), "garrison"),
          "tactic",
        ),
      );
      const raid = finite(
        readProperty(
          readProperty(readProperty(active.root, "civic"), "garrison"),
          "raid",
        ),
      );
      if (
        target === undefined ||
        government === undefined ||
        attacks !== active.attacks ||
        tactic !== active.currentTactic ||
        raid !== active.raid ||
        !capturedBattleTargetMatches(target, decision) ||
        Boolean(government["occ"]) !== decision.expectedOccupied ||
        Boolean(government["anx"]) !== decision.expectedAnnexed ||
        Boolean(government["buy"]) !== decision.expectedPurchased ||
        (finite(government["spy"]) ?? 0) !== decision.spyCount
      ) {
        return stale(
          "captured-battle-state-changed",
          "captured battle state changed",
        );
      }
      const currentGarrison = dependencies.controls.resolve(
        active.garrison.elementId,
      );
      if (currentGarrison?.generation !== active.garrison.generation) {
        return stale(
          "captured-battle-garrison-changed",
          "captured garrison control changed",
        );
      }
      if (active.hell !== undefined) {
        const currentHell = dependencies.controls.resolve(
          active.hell.elementId,
        );
        if (currentHell?.generation !== active.hell.generation) {
          return stale(
            "captured-battle-hell-changed",
            "captured Hell control changed",
          );
        }
      }

      session = undefined;
      if (decision.releaseControl) {
        const result = dependencies.controls.invoke(
          active.garrison,
          "campaign",
          [decision.governmentId],
        );
        if (!result.ok) {
          return stale(
            "captured-battle-campaign-failed",
            `campaign failed: ${result.reason}`,
          );
        }
        const released = capturedBattleRefreshGovernment(
          active.root,
          decision.governmentId,
        );
        if (
          released === undefined ||
          Boolean(released["occ"]) ||
          Boolean(released["anx"]) ||
          Boolean(released["buy"])
        ) {
          return stale(
            "captured-battle-release-not-applied",
            "the game did not release the foreign power",
          );
        }
        reportActivity({
          message: `Released foreign power ${decision.governmentId + 1}`,
          color: "success",
          tags: Object.freeze(["combat"]),
        });
        return SUCCEEDED;
      }

      if (!capturedBattleDriveHell(dependencies, active, decision)) {
        return stale(
          "captured-battle-hell-adjustment-failed",
          "Hell garrison adjustment failed",
        );
      }
      if (!capturedBattleDriveTactic(dependencies, active, decision.tactic)) {
        return stale(
          "captured-battle-tactic-failed",
          "garrison tactic did not reach the planned value",
        );
      }
      if (
        !capturedBattleDriveRaid(dependencies, active, decision.battalionSize)
      ) {
        return stale(
          "captured-battle-battalion-failed",
          "garrison battalion did not reach the planned value",
        );
      }
      const result = dependencies.controls.invoke(active.garrison, "campaign", [
        decision.governmentId,
      ]);
      if (!result.ok) {
        return stale(
          "captured-battle-campaign-failed",
          `campaign failed: ${result.reason}`,
        );
      }
      const afterAttacks = finite(
        readProperty(readProperty(active.root, "stats"), "attacks"),
      );
      if (afterAttacks !== active.attacks + 1) {
        return stale(
          "captured-battle-not-started",
          "the game did not start the campaign",
        );
      }
      reportActivity({
        message: `Launched battle against foreign power ${decision.governmentId + 1}`,
        color: "success",
        tags: Object.freeze(["combat"]),
      });
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
