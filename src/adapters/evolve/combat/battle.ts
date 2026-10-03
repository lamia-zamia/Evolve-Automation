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
import { planBattle, prepareBattle } from "../../../domain/combat/battle.ts";
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
import { readCapturedAchievementStar } from "../captured-achievements.ts";
import {
  readCapturedHellGarrisonFromControl,
  resolveCapturedOrdinaryFortress,
} from "./captured-hell-garrison.ts";
import {
  capturedCitySoldiersForRating,
  readCapturedCityGarrisonSnapshotFromControl,
} from "./captured-city-garrison.ts";
import {
  CAPTURED_FOREIGN_CONTROL,
  CAPTURED_FOREIGN_GARRISON_CONTROLS,
  CAPTURED_FOREIGN_GARRISON_REQUIRED_METHODS,
  capturedForeignPacifistGuardActive,
  readCapturedBattleForeignTargets,
  selectCapturedForeignStrategy,
  type CapturedForeignGovernment,
} from "./captured-foreign-state.ts";

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

type CapturedBattleGovernment = CapturedForeignGovernment;

interface CapturedBattleCycle {
  readonly root: unknown;
  readonly stateKey: string;
  readonly garrison: GameControlHandle;
  readonly foreign: GameControlHandle;
  readonly hell: GameControlHandle | undefined;
  readonly input: Readonly<BattleCycleInput>;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly fortress:
    | Readonly<{
        garrison: number;
        patrols: number;
        patrolSize: number;
        patrolling: number;
      }>
    | undefined;
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
  readonly settings: Readonly<Record<string, unknown>>;
  readonly fortress: CapturedBattleCycle["fortress"];
  readonly stateKey: string;
  readonly parameters: Readonly<BattleParameters>;
  readonly battlefield: Readonly<BattlefieldInput>;
  readonly governments: ReadonlyMap<number, CapturedBattleGovernment>;
  readonly currentTactic: number;
  readonly raid: number;
  readonly attacks: number;
  readonly occupationSupported: boolean;
}

const CAPTURED_BATTLE_SETTING_NUMBERS = Object.freeze({
  foreignAttackHealthySoldiersPercent: 90,
  foreignAttackLivingSoldiersPercent: 90,
  foreignMinAdvantage: 40,
  foreignMaxAdvantage: 80,
  foreignMaxSiegeBattalion: 10,
  foreignPowerRequired: 75,
});
const CAPTURED_BATTLE_SETTING_BOOLEANS = Object.freeze({
  foreignPacifist: false,
  autoHell: false,
  autoBuild: false,
  hellAssaultReserve: true,
  foreignUnification: true,
  foreignOccupyLast: true,
  foreignForceSabotage: true,
  achievementGuards: false,
  guardPacifist: true,
  guardWorldDomination: true,
  guardSyndicate: true,
});
const CAPTURED_BATTLE_SETTING_STRINGS = Object.freeze({
  foreignProtect: "auto",
  foreignPolicyInferior: "Ignore",
  foreignPolicySuperior: "Ignore",
  foreignPolicyRival: "Ignore",
});

function capturedBattleSettings(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const source = isRecord(value) ? value : {};
  const settings: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(CAPTURED_BATTLE_SETTING_NUMBERS))
    settings[key] = capturedBattleSettingNumber(source, key, fallback);
  for (const [key, fallback] of Object.entries(
    CAPTURED_BATTLE_SETTING_BOOLEANS,
  ))
    settings[key] = capturedBattleSettingBoolean(source, key, fallback);
  for (const [key, fallback] of Object.entries(CAPTURED_BATTLE_SETTING_STRINGS))
    settings[key] = capturedBattleSettingString(source, key, fallback);
  return Object.freeze(settings);
}

function capturedBattleSettingsMatch(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

function capturedBattleInvokeBoolean(
  controls: GameControlRegistry,
  control: GameControlHandle,
  method: string,
  args: readonly unknown[] = [],
): boolean | undefined {
  try {
    const result = controls.invoke(control, method, args);
    return result.ok && typeof result.value === "boolean"
      ? result.value
      : undefined;
  } catch {
    return undefined;
  }
}

function capturedBattleAuthorityCurrent(
  dependencies: CapturedBattleDependencies,
  active: {
    readonly root: unknown;
    readonly garrison: GameControlHandle;
    readonly foreign: GameControlHandle;
    readonly hell: GameControlHandle | undefined;
  },
): boolean {
  return (
    dependencies.rootState.readRoot() === active.root &&
    dependencies.controls.resolve(active.garrison.elementId)?.generation ===
      active.garrison.generation &&
    dependencies.controls.resolve(active.foreign.elementId)?.generation ===
      active.foreign.generation &&
    (active.hell === undefined ||
      dependencies.controls.resolve(active.hell.elementId)?.generation ===
        active.hell.generation)
  );
}

function capturedBattleRelevantState(root: unknown): string {
  const civic = readProperty(root, "civic");
  const garrison = readProperty(civic, "garrison");
  const foreign = readProperty(civic, "foreign");
  const fortress = readProperty(readProperty(root, "portal"), "fortress");
  const fields = (value: unknown, keys: readonly string[]) =>
    keys.map((key) => readProperty(value, key) ?? null);
  return JSON.stringify([
    fields(readProperty(root, "race"), [
      "banana",
      "frail",
      "high_pop",
      "rage",
      "warlord",
      "no_plasmid",
      "no_trade",
      "no_craft",
      "no_crispr",
      "cataclysm",
      "truepath",
    ]),
    fields(readProperty(root, "tech"), [
      "armor",
      "hell_pit",
      "unify",
      "world_control",
      "isolation",
      "shadow",
    ]),
    fields(readProperty(root, "city"), ["biome", "ptrait"]),
    fields(readProperty(readProperty(root, "city"), "morale"), ["current"]),
    fields(readProperty(civic, "govern"), ["type"]),
    fields(readProperty(root, "settings"), ["showPortal", "mKeys", "keyMap"]),
    fields(garrison, [
      "workers",
      "max",
      "crew",
      "wounded",
      "progress",
      "rate",
      "display",
    ]),
    fields(fortress, ["garrison", "patrols", "patrol_size"]),
    ["soul_forge", "guard_post", "assault_forge"].map((name) =>
      fields(readProperty(readProperty(root, "portal"), name), ["count"]),
    ),
    fields(readProperty(readProperty(root, "resource"), "Money"), [
      "amount",
      "currentQuantity",
    ]),
    fields(readProperty(readProperty(root, "space"), "fob"), ["troops"]),
    fields(readProperty(readProperty(root, "eden"), "pillbox"), ["staffed"]),
    ["pacifist", "world_domination", "syndicate"].map(
      (name) => readCapturedAchievementStar(root, name) ?? null,
    ),
    fields(readProperty(root, "stats"), ["attacks"]),
    Array.from({ length: 5 }, (_, index) =>
      fields(readProperty(foreign, `gov${index}`), [
        "mil",
        "spy",
        "occ",
        "anx",
        "buy",
        "hstl",
        "unrest",
        "eco",
        "sab",
        "act",
      ]),
    ),
  ]);
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
  const military = government.military;
  if (factor === undefined || military === undefined || military < 0)
    return undefined;
  let rating = (factor * military) / 100;
  const race = readProperty(root, "race");
  const city = readProperty(root, "city");
  if (readProperty(race, "banana")) rating *= 2;
  if (readProperty(city, "biome") === "swamp") rating *= 1.4;
  return Number.isFinite(rating) && rating >= 0 ? rating : undefined;
}

function capturedBattleOccupationCost(root: unknown): number | undefined {
  const race = readProperty(root, "race");
  // DeadSpace applies jobScale() inside jobStack(). Its high_pop multiplier is
  // not exposed by the captured garrison, so an Occupy plan is unsafe here.
  if (readProperty(race, "high_pop")) return undefined;
  const government = readProperty(readProperty(root, "civic"), "govern");
  return readProperty(government, "type") === "federation" ? 15 : 20;
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
  const stateKey = capturedBattleRelevantState(root);
  if (capturedBattleModifierHeld(root, dependencies.keyState)) return undefined;

  const settings = capturedBattleSettings(dependencies.readSettings());
  if (
    capturedBattleSettingBoolean(settings, "foreignPacifist", false) ||
    capturedForeignPacifistGuardActive(root, settings)
  ) {
    return undefined;
  }
  const foreign = capturedBattleResolveControl(
    dependencies.controls,
    [CAPTURED_FOREIGN_CONTROL],
    ["vis", "gvis"],
  );
  const garrison = capturedBattleResolveControl(
    dependencies.controls,
    CAPTURED_FOREIGN_GARRISON_CONTROLS,
    CAPTURED_FOREIGN_GARRISON_REQUIRED_METHODS,
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
  const citySnapshot = readCapturedCityGarrisonSnapshotFromControl(
    dependencies.rootState,
    dependencies.controls,
    root,
    garrison,
  );
  if (citySnapshot === undefined) return undefined;
  const currentCityGarrison = citySnapshot.current;
  const maxCityGarrison = citySnapshot.maximum;
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
  let fortressSnapshot: CapturedBattleCycle["fortress"];
  const hellReserveKnown = capturedBattleHellReserveKnown(root, settings);
  const fortress = readProperty(readProperty(root, "portal"), "fortress");
  if (
    autoHell &&
    isRecord(fortress) &&
    !Array.isArray(fortress) &&
    readProperty(race, "warlord") !== true
  ) {
    const fortressGarrison = finite(fortress["garrison"]);
    const patrols = finite(fortress["patrols"]);
    const patrolSize = finite(fortress["patrol_size"]);
    hell = resolveCapturedOrdinaryFortress(dependencies.controls, [
      "aLast",
      "patDec",
    ]);
    const stationed =
      hell === undefined
        ? undefined
        : readCapturedHellGarrisonFromControl(
            dependencies.rootState,
            dependencies.controls,
            root,
            hell,
          );
    if (hell !== undefined && stationed === undefined) return undefined;
    if (
      fortressGarrison !== undefined &&
      patrols !== undefined &&
      patrolSize !== undefined &&
      patrolSize > 0 &&
      stationed !== undefined
    ) {
      hellSoldiers = fortressGarrison;
      hellPatrolSize = patrolSize;
      hellGarrison = stationed;
      hellAvailable = true;
      fortressSnapshot = Object.freeze({
        garrison: fortressGarrison,
        patrols,
        patrolSize,
        patrolling: stationed,
      });
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
    fortressSnapshot = undefined;
  }
  if (
    !capturedBattleAuthorityCurrent(dependencies, {
      root,
      garrison,
      foreign,
      hell,
    }) ||
    capturedBattleRelevantState(root) !== stateKey
  )
    return undefined;

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
    stateKey,
    garrison,
    foreign,
    hell: hellAvailable ? hell : undefined,
    input,
    settings,
    fortress: fortressSnapshot,
    currentTactic,
    raid,
    attacks,
    occupationSupported,
  });
}

function capturedBattleTargetInput(
  target: CapturedBattleGovernment,
  minimumSoldiers: BattleTacticValues = CAPTURED_BATTLE_EMPTY_TACTICS,
  maximumSoldiers: BattleTacticValues = CAPTURED_BATTLE_EMPTY_TACTICS,
): BattlePlunderTargetInput {
  return Object.freeze({
    governmentId: target.governmentId,
    policy: target.policy,
    // Upstream has no `released` field. A controlled foreign power is released by
    // the same campaign closure that clears occ/anx/buy, so this is a per-cycle
    // action marker rather than a copied manager state field.
    released: false,
    occupied: target.occupied,
    annexed: target.annexed,
    purchased: target.purchased,
    spyCount: target.spyCount,
    minimumSoldiers,
    maximumSoldiers,
  });
}

function capturedBattleReadPlunderTarget(
  root: unknown,
  rootState: GameRootStateSource,
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
    const minimum = capturedCitySoldiersForRating({
      rootState,
      controls,
      control: garrison,
      expectedRoot: root,
      targetRating: rating / (1 - parameters.minimumAdvantage / 100),
      capacity: upper,
    });
    const maximum = capturedCitySoldiersForRating({
      rootState,
      controls,
      control: garrison,
      expectedRoot: root,
      targetRating: rating / (1 - parameters.maximumAdvantage / 100),
      capacity: upper,
    });
    if (minimum === undefined || maximum === undefined) return undefined;
    minimumSoldiers[tactic] = minimum;
    maximumSoldiers[tactic] = maximum;
  }
  return Object.freeze({
    ...capturedBattleTargetInput(target),
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
    const patrolSize = finite(readProperty(fortress, "patrol_size"));
    const patrolling = readCapturedHellGarrisonFromControl(
      dependencies.rootState,
      dependencies.controls,
      active.root,
      active.hell,
    );
    if (
      active.fortress === undefined ||
      patrolsBefore !== active.fortress.patrols ||
      garrisonBefore !== active.fortress.garrison ||
      patrolSize !== active.fortress.patrolSize ||
      patrolling !== active.fortress.patrolling ||
      capturedBattleRelevantState(active.root) !== active.stateKey ||
      !capturedBattleSettingsMatch(
        active.settings,
        capturedBattleSettings(dependencies.readSettings()),
      ) ||
      !capturedBattleAuthorityCurrent(dependencies, active)
    )
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
    if (patrolsAfter !== patrolTarget) return false;
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
    if (
      garrisonAfter !== garrisonTarget ||
      finite(readProperty(fortress, "patrol_size")) !==
        active.fortress.patrolSize ||
      finite(readProperty(fortress, "patrols")) !== patrolTarget
    )
      return false;
  }
  return true;
}

function capturedBattleStableKey(value: string, allowHell: boolean): string {
  if (!allowHell) return value;
  const fields: unknown[] = JSON.parse(value);
  fields[7] = null;
  return JSON.stringify(fields);
}

function capturedBattleStableInput(
  input: Readonly<BattleCycleInput>,
  allowHell: boolean,
  hellGarrisonDelta = 0,
): string {
  if (!allowHell) return JSON.stringify(input);
  return JSON.stringify({
    ...input,
    currentCityGarrison: input.currentCityGarrison - hellGarrisonDelta,
    maxCityGarrison: input.maxCityGarrison - hellGarrisonDelta,
    availableGarrison: input.availableGarrison - hellGarrisonDelta,
    hellSoldiers: 0,
    hellGarrison: 0,
    maximumSoldiers: 0,
  });
}

function capturedBattleResample(
  dependencies: CapturedBattleDependencies,
  active: CapturedBattleSession,
  decision: Readonly<LaunchBattleDecision>,
  allowHell: boolean,
): boolean {
  if (
    !capturedBattleAuthorityCurrent(dependencies, active) ||
    !capturedBattleSettingsMatch(
      active.settings,
      capturedBattleSettings(dependencies.readSettings()),
    )
  )
    return false;
  const fresh = capturedBattleReadCycle(dependencies);
  if (
    fresh === undefined ||
    fresh.root !== active.root ||
    fresh.garrison.elementId !== active.garrison.elementId ||
    fresh.garrison.generation !== active.garrison.generation ||
    fresh.foreign.elementId !== active.foreign.elementId ||
    fresh.foreign.generation !== active.foreign.generation ||
    fresh.hell?.elementId !== active.hell?.elementId ||
    fresh.hell?.generation !== active.hell?.generation ||
    !capturedBattleSettingsMatch(active.settings, fresh.settings) ||
    capturedBattleStableInput(
      fresh.input,
      allowHell,
      allowHell && active.fortress !== undefined && fresh.fortress !== undefined
        ? active.fortress.garrison - fresh.fortress.garrison
        : 0,
    ) !== capturedBattleStableInput(active.input, allowHell) ||
    capturedBattleStableKey(
      capturedBattleRelevantState(active.root),
      allowHell,
    ) !== capturedBattleStableKey(active.stateKey, allowHell)
  )
    return false;
  if (
    !allowHell &&
    JSON.stringify(fresh.fortress) !== JSON.stringify(active.fortress)
  )
    return false;
  const parameters = prepareBattle(fresh.input);
  if (parameters === null) return false;
  const sampled = capturedBattleSampleField(dependencies, fresh, parameters);
  if (
    sampled === undefined ||
    capturedBattleStableKey(sampled.stateKey, allowHell) !==
      capturedBattleStableKey(active.stateKey, allowHell) ||
    JSON.stringify([...sampled.governments.values()]) !==
      JSON.stringify([...active.governments.values()])
  )
    return false;
  if (!allowHell) {
    const replanned = planBattle(parameters, sampled.battlefield);
    if (
      replanned === null ||
      !capturedBattleDecisionsMatch(replanned, decision) ||
      JSON.stringify(sampled.battlefield) !== JSON.stringify(active.battlefield)
    )
      return false;
  }
  const settingsCurrent = capturedBattleSettings(dependencies.readSettings());
  return (
    capturedBattleAuthorityCurrent(dependencies, active) &&
    capturedBattleSettingsMatch(active.settings, settingsCurrent) &&
    capturedBattleStableKey(
      capturedBattleRelevantState(active.root),
      allowHell,
    ) === capturedBattleStableKey(active.stateKey, allowHell)
  );
}

function capturedBattleSampleField(
  dependencies: CapturedBattleDependencies,
  active: CapturedBattleCycle,
  parameters: Readonly<BattleParameters>,
):
  | {
      battlefield: BattlefieldInput;
      governments: ReadonlyMap<number, CapturedBattleGovernment>;
      stateKey: string;
    }
  | undefined {
  if (
    !capturedBattleAuthorityCurrent(dependencies, active) ||
    !capturedBattleSettingsMatch(
      active.settings,
      capturedBattleSettings(dependencies.readSettings()),
    )
  )
    return undefined;
  const before = capturedBattleRelevantState(active.root);
  const targets = readCapturedBattleForeignTargets(
    active.root,
    dependencies.controls,
    active.foreign,
    active.settings,
    () => capturedBattleAuthorityCurrent(dependencies, active),
  );
  if (targets === undefined) return undefined;
  const strategy = selectCapturedForeignStrategy(
    active.root,
    active.settings,
    targets,
  );
  const effectiveGovernments = new Map(
    strategy.governments.map((target) => [target.governmentId, target]),
  );
  const occupationTargets: BattleOccupationTargetInput[] = [];
  for (const target of strategy.governments) {
    if (
      !active.occupationSupported ||
      target.policy !== "Occupy" ||
      target.occupied
    )
      continue;
    const rating = capturedBattleEnemyRating(active.root, target, 4);
    if (rating === undefined) return undefined;
    const capacity = Math.max(
      1,
      Math.floor(parameters.maximumSoldiers || parameters.maxCityGarrison),
    );
    const minimumSiegeSoldiers = capturedCitySoldiersForRating({
      rootState: dependencies.rootState,
      controls: dependencies.controls,
      control: active.garrison,
      expectedRoot: active.root,
      targetRating: rating / (1 - parameters.minimumAdvantage / 100),
      capacity,
    });
    const maximumSiegeSoldiers = capturedCitySoldiersForRating({
      rootState: dependencies.rootState,
      controls: dependencies.controls,
      control: active.garrison,
      expectedRoot: active.root,
      targetRating: rating / (1 - parameters.maximumAdvantage / 100),
      capacity,
    });
    if (
      minimumSiegeSoldiers === undefined ||
      maximumSiegeSoldiers === undefined
    )
      return undefined;
    occupationTargets.push(
      Object.freeze({
        ...capturedBattleTargetInput(target),
        minimumSiegeSoldiers,
        maximumSiegeSoldiers,
      }),
    );
  }
  const selected =
    strategy.battleTargetId === null
      ? undefined
      : effectiveGovernments.get(strategy.battleTargetId);
  const plunderTarget =
    selected !== undefined &&
    !active.occupationSupported &&
    selected.policy === "Occupy"
      ? undefined
      : selected;
  const currentTarget =
    plunderTarget === undefined
      ? null
      : capturedBattleReadPlunderTarget(
          active.root,
          dependencies.rootState,
          dependencies.controls,
          active.garrison,
          parameters,
          plunderTarget,
        );
  if (plunderTarget !== undefined && currentTarget === undefined)
    return undefined;
  const battlefield: BattlefieldInput = Object.freeze({
    currentTarget: currentTarget ?? null,
    occupationTargets: Object.freeze(occupationTargets),
  });
  if (
    !capturedBattleAuthorityCurrent(dependencies, active) ||
    capturedBattleRelevantState(active.root) !== before ||
    !capturedBattleSettingsMatch(
      active.settings,
      capturedBattleSettings(dependencies.readSettings()),
    )
  )
    return undefined;
  return { battlefield, governments: effectiveGovernments, stateKey: before };
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
      session = undefined;
      const active = cycle;
      cycle = undefined;
      const empty: BattlefieldInput = Object.freeze({
        currentTarget: null,
        occupationTargets: Object.freeze([]),
      });
      if (
        active === undefined ||
        !capturedBattleSettingsMatch(
          active.settings,
          capturedBattleSettings(dependencies.readSettings()),
        ) ||
        !capturedBattleAuthorityCurrent(dependencies, active) ||
        capturedBattleRelevantState(active.root) !== active.stateKey ||
        JSON.stringify(prepareBattle(active.input)) !==
          JSON.stringify(parameters)
      )
        return empty;
      const sample = capturedBattleSampleField(
        dependencies,
        active,
        parameters,
      );
      if (sample === undefined) return empty;
      if (planBattle(parameters, sample.battlefield) === null)
        return sample.battlefield;
      session = Object.freeze({
        ...active,
        parameters,
        battlefield: sample.battlefield,
        governments: sample.governments,
        stateKey: sample.stateKey,
      });
      return sample.battlefield;
    },
  });
  const executor: BattleExecutor = Object.freeze({
    execute(decision: Readonly<LaunchBattleDecision>) {
      const active = session;
      session = undefined;
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
      if (
        !capturedBattleResample(dependencies, active, decision, false) ||
        finite(
          readProperty(
            readProperty(readProperty(active.root, "civic"), "garrison"),
            "tactic",
          ),
        ) !== active.currentTactic ||
        finite(
          readProperty(
            readProperty(readProperty(active.root, "civic"), "garrison"),
            "raid",
          ),
        ) !== active.raid
      ) {
        return stale(
          "captured-battle-state-changed",
          "captured battle state changed",
        );
      }
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
      if (!capturedBattleResample(dependencies, active, decision, true))
        return stale(
          "captured-battle-after-hell-changed",
          "battle state changed after Hell adjustment",
        );
      const afterHellKey = capturedBattleRelevantState(active.root);
      if (!capturedBattleDriveTactic(dependencies, active, decision.tactic)) {
        return stale(
          "captured-battle-tactic-failed",
          "garrison tactic did not reach the planned value",
        );
      }
      if (
        capturedBattleRelevantState(active.root) !== afterHellKey ||
        !capturedBattleResample(dependencies, active, decision, true)
      )
        return stale(
          "captured-battle-after-tactic-changed",
          "battle state changed after tactic adjustment",
        );
      if (
        !capturedBattleDriveRaid(dependencies, active, decision.battalionSize)
      ) {
        return stale(
          "captured-battle-battalion-failed",
          "garrison battalion did not reach the planned value",
        );
      }
      if (
        capturedBattleRelevantState(active.root) !== afterHellKey ||
        !capturedBattleResample(dependencies, active, decision, true) ||
        finite(
          readProperty(
            readProperty(readProperty(active.root, "civic"), "garrison"),
            "tactic",
          ),
        ) !== decision.tactic ||
        finite(
          readProperty(
            readProperty(readProperty(active.root, "civic"), "garrison"),
            "raid",
          ),
        ) !== decision.battalionSize
      )
        return stale(
          "captured-battle-before-campaign-changed",
          "battle state changed before campaign",
        );
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
