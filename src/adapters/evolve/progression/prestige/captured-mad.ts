/**
 * Captured prestige input and commands for the independent runtime.
 *
 * DeadSpace keeps the MAD definition lexical, but publishes the facts its panel and reset gate
 * use on the reactive root. The panel's own `arm` and `launch` methods are captured when the
 * military tab is drawn, so this adapter never reaches for the private `warhead` function.
 * DeadSpace's ordinary prestige actions are also lexical definitions, but their action rows are
 * captured by the same page surface: Terraform, Ascension, and Apotheosis open the celestial lab;
 * Matrix, Retirement, and Eden own their direct or delayed reset paths.
 */

import {
  isBioseedPrestigeReady,
  isDemonicPrestigeReady,
  isWitchAscensionPrestigeAvailable,
  type BioseedPrestigeInput,
  type DemonicPrestigeInput,
} from "../../../../domain/progression/prestige/prestige-eligibility.ts";
import {
  WHITEHOLE_REPAIR_TECH_ID,
  WHITEHOLE_RESET_LEVEL,
  type CelestialLabMode,
  type PrestigeBranch,
  type PrestigeCommand,
  type PrestigeInput,
} from "../../../../domain/progression/prestige/prestige.ts";
import type {
  GameControlResult,
  GameControlHandle,
  GameControlRegistry,
} from "../../../../ports/game-control-registry.ts";
import type { GameActivitySink } from "../../../../ports/game-message-log.ts";
import type {
  PrestigeExecutor,
  PrestigeReader,
} from "../../../../ports/prestige.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { canAfford } from "../../../../domain/game-world.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import { readCapturedAscensionLevel } from "../../ascension-level.ts";
import {
  coerceNumber,
  finite,
  isNonArrayRecord,
  readProperty,
} from "../../../validation.ts";
import { readCapturedControlLabel } from "../../captured-control-label.ts";

export const CAPTURED_MAD_CONTROL = "mad";

/** The captured research action that commits the cataclysm reset. */
export const CAPTURED_CATACLYSM_TECH = "tech-dial_it_to_11";

/** The two captured research actions in the upstream True Path apocalypse sequence. */
export const CAPTURED_APOCALYPSE_TECHS = Object.freeze({
  first: "tech-protocol66",
  final: "tech-protocol66a",
});

/** The captured research action selected by the upstream non-Witch-Hunter Demonic path. */
export const CAPTURED_DEMONIC_TECHS = Object.freeze({
  demonic: "tech-demonic_infusion",
  final: "tech-final_ingredient",
});

/** The captured Hell action shared by the Witch-Hunter Ascension and Demonic paths. */
export const CAPTURED_WITCH_ASCENSION_ACTION = "portal-absorption_chamber";

/** The captured opener and modal actions for the upstream Bioseed dock. */
export const CAPTURED_BIOSEED_ACTIONS = Object.freeze({
  opener: "space-star_dock",
  probe: "starDock-probes",
  prep: "starDock-prep_ship",
  launch: "starDock-launch_ship",
});

const CAPTURED_BIOSEED_COMMANDS = Object.freeze({
  prep: "GasSpaceDockPrepForLaunch",
  launch: "GasSpaceDockLaunch",
});

const CAPTURED_APOCALYPSE_TECH_IDS = Object.freeze(
  Object.values(CAPTURED_APOCALYPSE_TECHS),
);

const CAPTURED_DEMONIC_TECH_IDS = Object.freeze(
  Object.values(CAPTURED_DEMONIC_TECHS),
);

/** The three captured research actions in the upstream whitehole sequence. */
export const CAPTURED_WHITEHOLE_TECHS = Object.freeze({
  confirm: "tech-infusion_confirm",
  check: "tech-infusion_check",
  exotic: "tech-exotic_infusion",
});

/** The captured research action that repairs an interrupted whitehole reset. */
export const CAPTURED_WHITEHOLE_REPAIR_TECH = WHITEHOLE_REPAIR_TECH_ID;

const CAPTURED_WHITEHOLE_TECH_IDS = Object.freeze(
  Object.values(CAPTURED_WHITEHOLE_TECHS),
);

const CAPTURED_PRESTIGE_TECH_IDS = Object.freeze([
  CAPTURED_CATACLYSM_TECH,
  ...CAPTURED_APOCALYPSE_TECH_IDS,
  ...CAPTURED_DEMONIC_TECH_IDS,
  ...CAPTURED_WHITEHOLE_TECH_IDS,
  CAPTURED_WHITEHOLE_REPAIR_TECH,
]);

/** The Vue component that owns the post-opener Terraform/Ascension controls. */
export const CAPTURED_CELESTIAL_LAB = "celestialLab";

/** DeadSpace action rows that begin or commit the captured building-shaped prestige branches. */
export const CAPTURED_BUILDING_PRESTIGE_ACTIONS = Object.freeze({
  terraform: Object.freeze({ elementId: "space-terraform", region: "space" }),
  ascension: Object.freeze({
    elementId: "interstellar-ascend",
    region: "interstellar",
  }),
  matrix: Object.freeze({ elementId: "tauceti-blue_pill", region: "tauceti" }),
  retire: Object.freeze({
    elementId: "tauceti-alien_space_station",
    region: "tauceti",
  }),
  eden: Object.freeze({ elementId: "tauceti-goe_facility", region: "tauceti" }),
  apotheosis: Object.freeze({
    elementId: "eden-apotheosis",
    region: "eden",
  }),
});

export type CapturedBuildingPrestigeType =
  keyof typeof CAPTURED_BUILDING_PRESTIGE_ACTIONS;

export function isCapturedBuildingPrestigeType(
  value: unknown,
): value is CapturedBuildingPrestigeType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      CAPTURED_BUILDING_PRESTIGE_ACTIONS,
      value,
    )
  );
}

type MadBranch = Extract<PrestigeBranch, { readonly type: "mad" }>;
type BioseedBranch = Extract<PrestigeBranch, { readonly type: "bioseed" }>;
type WhiteholeBranch = Extract<PrestigeBranch, { readonly type: "whitehole" }>;
type WitchBranch = Extract<
  PrestigeBranch,
  { readonly type: "ascension" | "demonic" }
>;

type CapturedResetStat = CapturedBuildingPrestigeType | "descend";

const CAPTURED_RESET_STAT_BY_TYPE: Readonly<Record<CapturedResetStat, string>> =
  Object.freeze({
    terraform: "terraform",
    ascension: "ascend",
    matrix: "matrix",
    retire: "retired",
    eden: "eden",
    apotheosis: "apotheosis",
    descend: "descend",
  });

export interface CapturedMadPrestigeDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readGoal: () => string;
  readonly setGoal: (goal: string) => void;
  /** The current research draw, including the game's own price and control generation. */
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  /** Captured holdings used to answer the selected research action's affordability. */
  readonly resources?: GameResourceSource;
  /** Reads the game's offered action rows for the named prestige panel. */
  readonly readBuildingResetActions?: (
    regions: readonly string[],
  ) => ReadonlySet<string> | undefined;
  /** Closes a Bioseed options modal after its action controls have been captured. */
  readonly closeBioseedModal?: () => void;
  /** Reports a prestige after the launch replaced the captured game root. */
  readonly onActivity?: GameActivitySink;
}

function capturedMadSettingsRecord(raw: unknown): Record<PropertyKey, unknown> {
  return isNonArrayRecord(raw) ? raw : {};
}

function capturedMadSettingBoolean(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = settings[key];
  return value === undefined ? fallback : Boolean(value);
}

function capturedMadSettingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number {
  return finite(settings[key]) ?? fallback;
}

function readCapturedResetCount(
  root: unknown,
  type: CapturedResetStat,
): number | undefined {
  return finite(
    readProperty(
      readProperty(root, "stats"),
      CAPTURED_RESET_STAT_BY_TYPE[type],
    ),
  );
}

function readCapturedWitchResetStat(
  root: unknown,
  type: "ascension" | "demonic",
): CapturedResetStat {
  return type === "demonic" &&
    finite(readProperty(readProperty(root, "tech"), "forbidden")) === 5
    ? "descend"
    : "ascension";
}

function celestialLabMethod(mode: CelestialLabMode): string {
  return mode === "terraform" ? "setPlanet" : "setRace";
}

function readCapturedCelestialLabMode(
  controls: GameControlRegistry,
  pending: CelestialLabMode | undefined,
): CelestialLabMode | undefined {
  if (pending === undefined) return undefined;
  const control = controls.resolve(CAPTURED_CELESTIAL_LAB);
  return control?.methods.includes(celestialLabMethod(pending))
    ? pending
    : undefined;
}

/**
 * DeadSpace's action-row Vue wrapper returns `undefined` and can silently stop on the touch
 * popover or q-key paths before it reaches the action definition. Temporarily disabling those two
 * game-owned gates makes this one transaction equivalent to an ordinary click, then restores the
 * user's settings even when the captured method fails.
 */
function invokeCapturedPrestigeAction(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  handle: GameControlHandle,
): GameControlResult {
  const settings = readProperty(rootState.readRoot(), "settings");
  if (!isNonArrayRecord(settings)) {
    return {
      ok: false,
      reason: "threw",
      detail: "captured prestige game settings are unavailable",
    };
  }
  const snapshots = [
    Object.freeze({
      key: "qKey",
      present: Object.prototype.hasOwnProperty.call(settings, "qKey"),
      value: readProperty(settings, "qKey"),
    }),
    Object.freeze({
      key: "touch",
      present: Object.prototype.hasOwnProperty.call(settings, "touch"),
      value: readProperty(settings, "touch"),
    }),
  ];
  const setDisabled = (key: string): boolean =>
    Reflect.set(settings, key, false) && readProperty(settings, key) === false;
  let result: GameControlResult | undefined;
  let restoreFailure: string | undefined;
  try {
    if (!setDisabled("qKey") || !setDisabled("touch")) {
      result = {
        ok: false,
        reason: "threw",
        detail: "captured prestige game action modifiers could not be disabled",
      };
    } else {
      result = controls.invoke(handle, "action");
    }
  } finally {
    for (const snapshot of snapshots) {
      if (snapshot.present) {
        if (
          !Reflect.set(settings, snapshot.key, snapshot.value) ||
          readProperty(settings, snapshot.key) !== snapshot.value
        ) {
          restoreFailure ??= `captured prestige game setting ${snapshot.key} was not restored`;
        }
      } else if (!Reflect.deleteProperty(settings, snapshot.key)) {
        restoreFailure ??= `captured prestige game setting ${snapshot.key} was not removed`;
      }
    }
  }
  return restoreFailure === undefined
    ? (result ?? {
        ok: false,
        reason: "threw",
        detail: "captured prestige game action was not invoked",
      })
    : { ok: false, reason: "threw", detail: restoreFailure };
}

function readCapturedBioseedCount(
  root: unknown,
  region: string,
  type: string,
): number {
  return (
    finite(
      readProperty(readProperty(readProperty(root, region), type), "count"),
    ) ?? 0
  );
}

function capturedBioseedActionAvailable(
  controls: GameControlRegistry,
  elementId: string,
): boolean {
  const handle = controls.resolve(elementId);
  return handle !== undefined && handle.methods.includes("action");
}

/**
 * DeadSpace increments `stats.eden` inside `gardenOfEden()` before it asks the browser to reload.
 * The action row returns `false` both when it cannot pay and after that reset path runs, so this
 * counter is the only captured success answer for Eden.
 */
function readCapturedEdenResetCount(root: unknown): number | undefined {
  return readCapturedResetCount(root, "eden");
}

function readCapturedBioseedBranch(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  controls: GameControlRegistry,
): BioseedBranch {
  const stats = readProperty(root, "stats");
  const achievement = readProperty(readProperty(stats, "achieve"), "lamentis");
  const requiredGecks = finite(settings["prestigeGECK"]) ?? Number.NaN;
  const requiredProbes =
    finite(settings["prestigeBioseedProbes"]) ?? Number.NaN;
  const gecks = readCapturedBioseedCount(root, "starDock", "geck");
  const shipSegments = readCapturedBioseedCount(root, "starDock", "seeder");
  const probes = readCapturedBioseedCount(root, "starDock", "probes");
  const genesis =
    finite(readProperty(readProperty(root, "tech"), "genesis")) ?? 0;
  const geckNeeded =
    (finite(readProperty(achievement, "l")) ?? 0) >= 5 && gecks < requiredGecks;
  const eligibility: BioseedPrestigeInput = {
    geckNeeded,
    spaceDock: readCapturedBioseedCount(root, "space", "star_dock"),
    shipSegments,
    probes,
    requiredProbes,
  };

  return {
    type: "bioseed",
    eligible: isBioseedPrestigeReady(eligibility),
    launchUnlocked:
      genesis >= 7 &&
      capturedBioseedActionAvailable(controls, CAPTURED_BIOSEED_ACTIONS.launch),
    prepUnlocked:
      genesis === 6 &&
      capturedBioseedActionAvailable(controls, CAPTURED_BIOSEED_ACTIONS.prep),
  };
}

function capturedTechIsAffordable(
  tech: Readonly<OfferedTech> | undefined,
  resources: GameResourceSource | undefined,
): boolean {
  if (tech === undefined || resources === undefined) return false;
  const sample = resources.readResources(Object.keys(tech.cost));
  return sample !== undefined && canAfford(sample, tech.cost);
}

function readCapturedWhiteholeLevel(root: unknown): number {
  return finite(readProperty(readProperty(root, "tech"), "whitehole")) ?? 0;
}

function readCapturedWhiteholeRepairBranch(
  root: unknown,
  offered: readonly Readonly<OfferedTech>[],
  resources: GameResourceSource | undefined,
): Extract<PrestigeBranch, { readonly type: "whitehole-repair" }> | undefined {
  if (readCapturedWhiteholeLevel(root) < WHITEHOLE_RESET_LEVEL)
    return undefined;
  const repair = offered.find(
    (entry) => entry.elementId === CAPTURED_WHITEHOLE_REPAIR_TECH,
  );
  if (repair === undefined) return undefined;
  return {
    type: "whitehole-repair",
    eligible: true,
    repairReady: capturedTechIsAffordable(repair, resources),
  };
}

function capturedWhiteholeRepairSucceeded(root: unknown): boolean {
  const tech = readProperty(root, "tech");
  const engine = readProperty(
    readProperty(root, "interstellar"),
    "stellar_engine",
  );
  return (
    isNonArrayRecord(tech) &&
    readProperty(tech, "whitehole") === undefined &&
    isNonArrayRecord(engine) &&
    finite(readProperty(engine, "exotic")) === 0
  );
}

function readCapturedWhiteholeBranch(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  offered: readonly Readonly<OfferedTech>[],
  resources: GameResourceSource | undefined,
): WhiteholeBranch {
  const engine = readProperty(
    readProperty(root, "interstellar"),
    "stellar_engine",
  );
  const mass = finite(readProperty(engine, "mass")) ?? 0;
  const exotic = finite(readProperty(engine, "exotic")) ?? 0;
  const whiteholeLevel = readCapturedWhiteholeLevel(root);
  const findOffer = (id: string) =>
    offered.find((entry) => entry.elementId === id);
  const exoticOffer = findOffer(CAPTURED_WHITEHOLE_TECHS.exotic);
  const confirmOffer = findOffer(CAPTURED_WHITEHOLE_TECHS.confirm);

  return {
    type: "whitehole",
    eligible:
      mass + exotic >=
        (finite(settings["prestigeWhiteholeMinMass"]) ?? Number.NaN) &&
      CAPTURED_WHITEHOLE_TECH_IDS.some((id) => findOffer(id) !== undefined),
    exoticInfusionReady: capturedTechIsAffordable(exoticOffer, resources),
    whiteholeLevel,
    confirmReady: capturedTechIsAffordable(confirmOffer, resources),
  };
}

function readCapturedDemonicBranch(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  offered: readonly Readonly<OfferedTech>[],
  resources: GameResourceSource | undefined,
): Extract<PrestigeBranch, { readonly type: "demonic" }> {
  const race = readProperty(root, "race");
  const fasting = Boolean(readProperty(race, "fasting"));
  const witchHunter = Boolean(readProperty(race, "witch_hunter"));
  const targetId = fasting
    ? CAPTURED_DEMONIC_TECHS.final
    : CAPTURED_DEMONIC_TECHS.demonic;
  const target = offered.find((entry) => entry.elementId === targetId);
  const portal = readProperty(root, "portal");
  const spireFloor =
    finite(readProperty(readProperty(portal, "spire"), "count")) ?? Number.NaN;
  const minimumSpireFloor =
    finite(settings["prestigeDemonicFloor"]) ?? Number.NaN;
  const input: DemonicPrestigeInput = {
    spireFloor,
    minimumSpireFloor,
    resetTechUnlocked: target !== undefined,
    resetTechAffordable: capturedTechIsAffordable(target, resources),
    // The independent runtime cannot answer the manager-owned mech potential yet. Stand down
    // whenever its automation is enabled instead of reconstructing that live formula here.
    mechReady: !capturedMadSettingBoolean(settings, "autoMech", false),
  };

  return {
    type: "demonic",
    witchHunter,
    fasting,
    eligible: !witchHunter && isDemonicPrestigeReady(input),
  };
}

function readCapturedResourceAmount(
  resources: GameResourceSource | undefined,
  id: string,
): number {
  return (
    resources?.readResources([id])?.resources.get(id)?.amount ?? Number.NaN
  );
}

function readCapturedWitchBranch(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  resources: GameResourceSource | undefined,
  controls: GameControlRegistry,
  offered: ReadonlySet<string>,
  type: "ascension" | "demonic",
): WitchBranch {
  const race = readProperty(root, "race");
  const fasting = Boolean(readProperty(race, "fasting"));
  const species = readProperty(race, "species");
  const universe = readProperty(race, "universe");
  const pillars = readProperty(root, "pillars");
  const speciesPillarLevel =
    typeof species === "string"
      ? finite(readProperty(pillars, species))
      : undefined;
  const ascensionLevel = readCapturedAscensionLevel(root) ?? Number.NaN;
  const pillarView = {
    settings: {
      requirePillar: capturedMadSettingBoolean(
        settings,
        "prestigeAscensionPillar",
        true,
      ),
    },
    game: {
      universe: typeof universe === "string" ? universe : "",
      ascensionLevel,
      ...(speciesPillarLevel === undefined ? {} : { speciesPillarLevel }),
    },
    resources: { harmony: readCapturedResourceAmount(resources, "Harmony") },
  };
  const portal = readProperty(root, "portal");
  const absorptionChambers =
    finite(readProperty(readProperty(portal, "absorption_chamber"), "count")) ??
    Number.NaN;
  const soulCapacitorEnergy =
    finite(readProperty(readProperty(portal, "soul_capacitor"), "energy")) ??
    Number.NaN;
  const tech = readProperty(root, "tech");
  const eligible = isWitchAscensionPrestigeAvailable(
    {
      ...pillarView,
      game: { ...pillarView.game, fasting },
      buildings: { absorptionChambers, soulCapacitorEnergy },
      tech: {
        forbiddenLevelFive: (finite(readProperty(tech, "forbidden")) ?? 0) >= 5,
        dishLevelTwo: (finite(readProperty(tech, "dish_reset")) ?? 0) >= 2,
      },
    },
    type === "demonic",
  );
  const control = controls.resolve(CAPTURED_WITCH_ASCENSION_ACTION);
  const actionAvailable =
    offered.has(CAPTURED_WITCH_ASCENSION_ACTION) &&
    control !== undefined &&
    control.methods.includes("action");

  return type === "demonic"
    ? {
        type,
        witchHunter: true,
        fasting,
        eligible: eligible && actionAvailable,
      }
    : { type, witchHunter: true, eligible: eligible && actionAvailable };
}

/**
 * Reads the MAD branch from one root. Missing numeric bags preserve DeadSpace's arithmetic
 * behavior as `NaN`: an uninitialized count cannot satisfy the wait-for-population gate, but it
 * does not turn a displayed and eligible MAD panel into a hard adapter failure.
 */
export function readCapturedMadBranch(
  root: unknown,
  rawSettings: unknown,
): MadBranch {
  const settings = capturedMadSettingsRecord(rawSettings);
  const civic = readProperty(root, "civic");
  const mad = readProperty(civic, "mad");
  const tech = readProperty(root, "tech");
  const garrison = readProperty(civic, "garrison");
  const population = readProperty(readProperty(root, "resource"), "Population");
  const currentSoldiers =
    coerceNumber(readProperty(garrison, "workers")) -
    coerceNumber(readProperty(garrison, "crew"));
  const maxSoldiers =
    coerceNumber(readProperty(garrison, "max")) -
    coerceNumber(readProperty(garrison, "crew"));
  const madDisplay = readProperty(mad, "display") === true;
  const madLevel = coerceNumber(readProperty(tech, "mad"));

  return Object.freeze({
    type: "mad",
    // `tech.mad` is the captured grant that the upstream `haveTech('mad')` gate reports; display
    // is the separate `civic.mad.display` flag written by the game's tech action.
    eligible: madDisplay && madLevel > 0,
    armed: Boolean(readProperty(mad, "armed")),
    waitForPopulation: capturedMadSettingBoolean(
      settings,
      "prestigeMADWait",
      true,
    ),
    currentSoldiers,
    maxSoldiers,
    currentPopulation: coerceNumber(readProperty(population, "amount")),
    maxPopulation: coerceNumber(readProperty(population, "max")),
    requiredPopulation: capturedMadSettingNumber(
      settings,
      "prestigeMADPopulation",
      1,
    ),
  });
}

function invokeMadControl(
  controls: GameControlRegistry,
  method: "arm" | "launch",
): void {
  const control = controls.resolve(CAPTURED_MAD_CONTROL);
  if (control === undefined || !control.methods.includes(method)) {
    throw new Error(`captured MAD control lacks ${method}`);
  }
  const result = controls.invoke(control, method);
  if (!result.ok) {
    throw new Error(
      `captured MAD ${method} failed: ${result.detail ?? result.reason}`,
    );
  }
}

/** Creates the reader/executor pair consumed by the existing pure MAD planner. */
export function createCapturedMadPrestige(
  dependencies: CapturedMadPrestigeDependencies,
): { readonly reader: PrestigeReader; readonly executor: PrestigeExecutor } {
  let sampledRoot: unknown;
  let sampledPrestigeTechs = new Map<string, Readonly<OfferedTech>>();
  let sampledBioseedControls = new Map<string, Readonly<GameControlHandle>>();
  let sampledWitchControl: Readonly<GameControlHandle> | undefined;
  let sampledEdenCount: number | undefined;
  let sampledBuildingType: CapturedBuildingPrestigeType | undefined;
  let sampledBuildingResetCount: number | undefined;
  let pendingCelestialLabMode: CelestialLabMode | undefined;
  let pendingWitchCelestialLab = false;
  let pendingWitchDirectReset = false;
  let resetCommitted = false;
  let apocalypseFirstActionDone = false;
  let bioseedModalRequested = false;
  const reader: PrestigeReader = Object.freeze({
    samplePrestige(): PrestigeInput {
      const settings = capturedMadSettingsRecord(dependencies.readSettings());
      const root = dependencies.rootState.readRoot();
      sampledRoot = root;
      sampledPrestigeTechs = new Map();
      sampledBioseedControls = new Map();
      sampledWitchControl = undefined;
      sampledEdenCount = undefined;
      sampledBuildingType = undefined;
      sampledBuildingResetCount = undefined;
      apocalypseFirstActionDone = false;
      const prestigeType =
        typeof settings["prestigeType"] === "string"
          ? settings["prestigeType"]
          : "none";
      let branch: PrestigeBranch = { type: "noop" };
      if (!resetCommitted && pendingCelestialLabMode !== undefined) {
        const mode = pendingCelestialLabMode;
        sampledBuildingResetCount = readCapturedResetCount(root, mode);
        branch = {
          type: "celestial-lab",
          mode,
          eligible:
            readCapturedCelestialLabMode(
              dependencies.controls,
              pendingCelestialLabMode,
            ) !== undefined && sampledBuildingResetCount !== undefined,
        };
      } else if (!resetCommitted && prestigeType === "mad") {
        branch = readCapturedMadBranch(root, settings);
      } else if (
        !resetCommitted &&
        prestigeType === "ascension" &&
        Boolean(readProperty(readProperty(root, "race"), "witch_hunter"))
      ) {
        const offered = dependencies.readBuildingResetActions?.(["portal"]);
        if (offered !== undefined) {
          branch = readCapturedWitchBranch(
            root,
            settings,
            dependencies.resources,
            dependencies.controls,
            offered,
            "ascension",
          );
          const control = dependencies.controls.resolve(
            CAPTURED_WITCH_ASCENSION_ACTION,
          );
          if (control !== undefined && control.methods.includes("action")) {
            sampledWitchControl = control;
          }
        }
      } else if (
        !resetCommitted &&
        isCapturedBuildingPrestigeType(prestigeType)
      ) {
        const action = CAPTURED_BUILDING_PRESTIGE_ACTIONS[prestigeType];
        const offered = dependencies.readBuildingResetActions?.([
          action.region,
        ]);
        // A missing panel sample is an unknown gate, not a locked reset. The planner only
        // receives a boolean after the game has answered whether it drew the action row.
        if (offered !== undefined) {
          sampledBuildingType = prestigeType;
          sampledBuildingResetCount = readCapturedResetCount(
            root,
            prestigeType,
          );
          if (
            action.elementId ===
            CAPTURED_BUILDING_PRESTIGE_ACTIONS.eden.elementId
          ) {
            sampledEdenCount = readCapturedEdenResetCount(root);
          }
          branch = {
            type: "building-reset",
            building: action.elementId,
            unlocked:
              offered.has(action.elementId) &&
              (action.elementId !==
                CAPTURED_BUILDING_PRESTIGE_ACTIONS.eden.elementId ||
                sampledEdenCount !== undefined),
          };
        }
      } else if (!resetCommitted && prestigeType === "cataclysm") {
        const offered = dependencies.readOfferedTechs?.();
        if (offered !== undefined) {
          const tech = offered.find(
            (entry) => entry.elementId === CAPTURED_CATACLYSM_TECH,
          );
          if (tech !== undefined)
            sampledPrestigeTechs.set(tech.elementId, tech);
          branch = {
            type: "cataclysm",
            // The game only draws an unresearched action after its own
            // requirements and condition have passed. The row is therefore
            // the eligibility answer; affordability is a separate live gate.
            eligible: tech !== undefined,
            loadQueuedSettings: false,
            dialClickable:
              tech !== undefined &&
              capturedTechIsAffordable(tech, dependencies.resources),
          };
        }
      } else if (!resetCommitted && prestigeType === "apocalypse") {
        const offered = dependencies.readOfferedTechs?.();
        if (offered !== undefined) {
          for (const tech of offered) {
            if (
              CAPTURED_APOCALYPSE_TECH_IDS.some((id) => id === tech.elementId)
            ) {
              sampledPrestigeTechs.set(tech.elementId, tech);
            }
          }
          branch = {
            type: "apocalypse",
            // `drawTech` only emits these True Path rows after the game's own
            // path, requirement, and qualification checks. Either row is the
            // same eligibility answer as the compatibility `isUnlocked` gate.
            eligible: CAPTURED_APOCALYPSE_TECH_IDS.some((id) =>
              sampledPrestigeTechs.has(id),
            ),
          };
        }
      } else if (
        !resetCommitted &&
        prestigeType === "demonic" &&
        Boolean(readProperty(readProperty(root, "race"), "witch_hunter"))
      ) {
        const offered = dependencies.readBuildingResetActions?.(["portal"]);
        if (offered !== undefined) {
          branch = readCapturedWitchBranch(
            root,
            settings,
            dependencies.resources,
            dependencies.controls,
            offered,
            "demonic",
          );
          const control = dependencies.controls.resolve(
            CAPTURED_WITCH_ASCENSION_ACTION,
          );
          if (control !== undefined && control.methods.includes("action")) {
            sampledWitchControl = control;
          }
        }
      } else if (!resetCommitted && prestigeType === "demonic") {
        const offered = dependencies.readOfferedTechs?.();
        if (offered !== undefined) {
          const demonicBranch = readCapturedDemonicBranch(
            root,
            settings,
            offered,
            dependencies.resources,
          );
          const targetId = demonicBranch.fasting
            ? CAPTURED_DEMONIC_TECHS.final
            : CAPTURED_DEMONIC_TECHS.demonic;
          const tech = offered.find((entry) => entry.elementId === targetId);
          if (tech !== undefined)
            sampledPrestigeTechs.set(tech.elementId, tech);
          // Witch-Hunter uses the separate absorption-chamber act. Keep that path inert until its
          // controls and delayed reset contract are captured; the non-Witch-Hunter research path
          // remains fully answered by the drawn row and root floor above.
          branch = demonicBranch;
        }
      } else if (!resetCommitted && prestigeType === "whitehole") {
        const offered = dependencies.readOfferedTechs?.();
        if (offered !== undefined) {
          const repairBranch = readCapturedWhiteholeRepairBranch(
            root,
            offered,
            dependencies.resources,
          );
          if (repairBranch !== undefined) {
            const repair = offered.find(
              (entry) => entry.elementId === CAPTURED_WHITEHOLE_REPAIR_TECH,
            );
            if (repair !== undefined) {
              sampledPrestigeTechs.set(repair.elementId, repair);
            }
            branch = repairBranch;
          } else {
            for (const tech of offered) {
              if (
                CAPTURED_WHITEHOLE_TECH_IDS.some((id) => id === tech.elementId)
              ) {
                sampledPrestigeTechs.set(tech.elementId, tech);
              }
            }
            branch = readCapturedWhiteholeBranch(
              root,
              settings,
              offered,
              dependencies.resources,
            );
          }
        }
      } else if (!resetCommitted && prestigeType === "bioseed") {
        const offered = dependencies.readBuildingResetActions?.(["space"]);
        if (
          offered !== undefined &&
          offered.has(CAPTURED_BIOSEED_ACTIONS.opener)
        ) {
          branch = readCapturedBioseedBranch(
            root,
            settings,
            dependencies.controls,
          );
          for (const [commandId, elementId] of [
            [CAPTURED_BIOSEED_COMMANDS.prep, CAPTURED_BIOSEED_ACTIONS.prep],
            [CAPTURED_BIOSEED_COMMANDS.launch, CAPTURED_BIOSEED_ACTIONS.launch],
          ] as const) {
            const handle = dependencies.controls.resolve(elementId);
            if (handle !== undefined && handle.methods.includes("action")) {
              sampledBioseedControls.set(commandId, handle);
            }
          }
          if (
            bioseedModalRequested &&
            dependencies.controls.resolve(CAPTURED_BIOSEED_ACTIONS.probe) !==
              undefined
          ) {
            dependencies.closeBioseedModal?.();
            bioseedModalRequested = false;
          }
        }
      }
      return Object.freeze({
        goal: dependencies.readGoal(),
        branch: Object.freeze(branch),
      });
    },
  });

  const executor: PrestigeExecutor = Object.freeze({
    execute(command: PrestigeCommand): void {
      switch (command.kind) {
        case "set-goal":
          // Witch-Hunter Ascension opens the celestial lab first. The pure legacy act places
          // this guard after the opener, but doing so here would prevent the following tick from
          // reaching the captured `setRace()` completion method.
          if (
            command.goal === "GameOverMan" &&
            (pendingCelestialLabMode !== undefined || pendingWitchDirectReset)
          ) {
            return;
          }
          dependencies.setGoal(command.goal);
          return;
        case "arm-mad":
        case "launch-mad":
          if (dependencies.rootState.readRoot() !== sampledRoot) {
            throw new Error("captured MAD root changed after sampling");
          }
          invokeMadControl(
            dependencies.controls,
            command.kind === "arm-mad" ? "arm" : "launch",
          );
          if (
            command.kind === "launch-mad" &&
            dependencies.rootState.readRoot() !== sampledRoot
          ) {
            dependencies.onActivity?.({
              message: "Prestiged",
              color: "info",
              tags: Object.freeze(["achievements"]),
            });
          }
          return;
        case "log-prestige":
          // The activity sink observes the root transition after launch; logging this planner
          // command would report an attempted prestige before the game actually reset.
          return;
        case "reset-modifier-keys":
          // Action transactions disable the game-owned q/touch gates around their own invocation.
          // This planner command remains a compatibility no-op for captured prestige.
          return;
        case "absorption-chamber-action": {
          if (dependencies.rootState.readRoot() !== sampledRoot) {
            throw new Error(
              "captured Witch-Hunter root changed after sampling",
            );
          }
          const handle = sampledWitchControl;
          if (handle === undefined) {
            throw new Error("captured Witch-Hunter action is unavailable");
          }
          const currentHandle = dependencies.controls.resolve(
            CAPTURED_WITCH_ASCENSION_ACTION,
          );
          if (
            currentHandle === undefined ||
            currentHandle.generation !== handle.generation ||
            !currentHandle.methods.includes("action")
          ) {
            throw new Error("captured Witch-Hunter action was redrawn");
          }
          const prestigeType = capturedMadSettingsRecord(
            dependencies.readSettings(),
          )["prestigeType"];
          const resetStat = readCapturedWitchResetStat(
            sampledRoot,
            prestigeType === "demonic" ? "demonic" : "ascension",
          );
          const resetCountBefore = readCapturedResetCount(
            sampledRoot,
            resetStat,
          );
          const result = invokeCapturedPrestigeAction(
            dependencies.rootState,
            dependencies.controls,
            currentHandle,
          );
          if (!result.ok) {
            throw new Error(
              `captured Witch-Hunter action failed: ${result.detail ?? result.reason}`,
            );
          }
          const resetCountAfter = readCapturedResetCount(
            dependencies.rootState.readRoot(),
            resetStat,
          );
          if (
            resetCountBefore !== undefined &&
            resetCountAfter !== undefined &&
            resetCountAfter > resetCountBefore
          ) {
            pendingWitchDirectReset = false;
            resetCommitted = true;
            dependencies.onActivity?.({
              message: "Prestiged",
              color: "info",
              tags: Object.freeze(["achievements"]),
            });
          } else if (resetStat === "ascension") {
            pendingCelestialLabMode = "ascension";
            pendingWitchCelestialLab = true;
          } else {
            pendingWitchDirectReset = true;
          }
          return;
        }
        case "complete-celestial-lab": {
          if (dependencies.rootState.readRoot() !== sampledRoot) {
            throw new Error(
              "captured celestial lab root changed after sampling",
            );
          }
          if (pendingCelestialLabMode !== command.mode) return;
          const handle = dependencies.controls.resolve(CAPTURED_CELESTIAL_LAB);
          const method = celestialLabMethod(command.mode);
          if (handle === undefined || !handle.methods.includes(method)) return;
          const resetCountBefore = sampledBuildingResetCount;
          const result = dependencies.controls.invoke(handle, method);
          if (!result.ok) {
            throw new Error(
              `captured celestial lab ${method} failed: ${result.detail ?? result.reason}`,
            );
          }
          const resetCountAfter = readCapturedResetCount(
            dependencies.rootState.readRoot(),
            command.mode,
          );
          if (
            resetCountBefore === undefined ||
            resetCountAfter === undefined ||
            resetCountAfter <= resetCountBefore
          ) {
            return;
          }
          const completeWitchCelestialLab = pendingWitchCelestialLab;
          pendingCelestialLabMode = undefined;
          pendingWitchCelestialLab = false;
          resetCommitted = true;
          dependencies.onActivity?.({
            message: "Prestiged",
            color: "info",
            tags: Object.freeze(["achievements"]),
          });
          if (completeWitchCelestialLab) {
            dependencies.setGoal("GameOverMan");
          }
          return;
        }
        case "cache-building-options": {
          if (command.id !== "GasSpaceDock") return;
          if (dependencies.rootState.readRoot() !== sampledRoot) {
            throw new Error("captured bioseed root changed after sampling");
          }
          const opener = dependencies.controls.resolve(
            CAPTURED_BIOSEED_ACTIONS.opener,
          );
          if (opener === undefined || !opener.methods.includes("trigModal")) {
            throw new Error("captured Bioseed dock opener is unavailable");
          }
          const result = dependencies.controls.invoke(opener, "trigModal");
          if (!result.ok) {
            throw new Error(
              `captured Bioseed dock opener failed: ${result.detail ?? result.reason}`,
            );
          }
          bioseedModalRequested = true;
          return;
        }
        case "click-building": {
          if (dependencies.rootState.readRoot() !== sampledRoot) {
            throw new Error("captured prestige root changed after sampling");
          }
          const bioseedElementId =
            command.id === CAPTURED_BIOSEED_COMMANDS.prep
              ? CAPTURED_BIOSEED_ACTIONS.prep
              : command.id === CAPTURED_BIOSEED_COMMANDS.launch
                ? CAPTURED_BIOSEED_ACTIONS.launch
                : undefined;
          const handle =
            bioseedElementId === undefined
              ? dependencies.controls.resolve(command.id)
              : sampledBioseedControls.get(command.id);
          if (handle === undefined || !handle.methods.includes("action")) {
            throw new Error(
              `captured prestige action ${command.id} is unavailable`,
            );
          }
          const currentHandle =
            bioseedElementId === undefined
              ? handle
              : dependencies.controls.resolve(bioseedElementId);
          if (
            currentHandle === undefined ||
            currentHandle.generation !== handle.generation
          ) {
            throw new Error(
              `captured prestige action ${command.id} was redrawn`,
            );
          }
          const result = invokeCapturedPrestigeAction(
            dependencies.rootState,
            dependencies.controls,
            currentHandle,
          );
          if (!result.ok) {
            throw new Error(
              `captured prestige action ${command.id} failed: ${result.detail ?? result.reason}`,
            );
          }
          if (command.id === CAPTURED_BIOSEED_COMMANDS.launch) {
            resetCommitted = true;
            dependencies.onActivity?.({
              message: "Prestiged",
              color: "info",
              tags: Object.freeze(["achievements"]),
            });
            return;
          }
          if (command.id === CAPTURED_BIOSEED_COMMANDS.prep) {
            // `prep_ship` redraws the same modal after granting genesis 7. Its captured launch
            // control survives that redraw, so close the modal before the next cycle can act.
            dependencies.closeBioseedModal?.();
            return;
          }
          if (
            command.id === CAPTURED_BUILDING_PRESTIGE_ACTIONS.eden.elementId
          ) {
            const edenCountAfter = readCapturedEdenResetCount(
              dependencies.rootState.readRoot(),
            );
            // `goe_facility.action()` returns false even after `gardenOfEden()` has run. Do not
            // treat a successful control call as a reset unless the game's own counter moved.
            if (
              sampledEdenCount === undefined ||
              edenCountAfter === undefined ||
              edenCountAfter <= sampledEdenCount
            ) {
              return;
            }
            resetCommitted = true;
            dependencies.onActivity?.({
              message: "Prestiged",
              color: "info",
              tags: Object.freeze(["achievements"]),
            });
            return;
          }
          if (sampledBuildingType !== undefined) {
            const resetCountAfter = readCapturedResetCount(
              dependencies.rootState.readRoot(),
              sampledBuildingType,
            );
            if (
              sampledBuildingResetCount !== undefined &&
              resetCountAfter !== undefined &&
              resetCountAfter > sampledBuildingResetCount
            ) {
              resetCommitted = true;
              dependencies.onActivity?.({
                message: "Prestiged",
                color: "info",
                tags: Object.freeze(["achievements"]),
              });
              return;
            }
            if (sampledBuildingType === "matrix") {
              // Matrix installs its overlay and schedules `matrix()` five seconds later. The
              // successful modifier-neutralized wrapper call is the commit; never click it again
              // while that delayed reset is pending.
              resetCommitted = true;
              dependencies.onActivity?.({
                message: "Prestiged",
                color: "info",
                tags: Object.freeze(["achievements"]),
              });
              return;
            }
            if (
              sampledBuildingType === "terraform" ||
              sampledBuildingType === "ascension" ||
              sampledBuildingType === "apotheosis"
            ) {
              pendingCelestialLabMode =
                sampledBuildingType === "terraform"
                  ? "terraform"
                  : sampledBuildingType;
            }
          }
          return;
        }
        case "click-tech": {
          if (!CAPTURED_PRESTIGE_TECH_IDS.some((id) => id === command.id))
            return;
          if (dependencies.rootState.readRoot() !== sampledRoot) {
            throw new Error("captured prestige root changed after sampling");
          }
          let sampled = sampledPrestigeTechs.get(command.id);
          // Protocol 66 grants the prerequisite synchronously and calls the
          // game's own `drawTech`; refresh the catalog before the planner's
          // second command so protocol 66a can be captured in the same act.
          if (
            sampled === undefined &&
            command.id === CAPTURED_APOCALYPSE_TECHS.final &&
            apocalypseFirstActionDone
          ) {
            const offered = dependencies.readOfferedTechs?.();
            const tech = offered?.find(
              (entry) => entry.elementId === command.id,
            );
            if (tech !== undefined) {
              sampledPrestigeTechs.set(tech.elementId, tech);
              sampled = tech;
            }
          }
          // Protocol 66 is optional in the legacy sequence: when protocol 66a
          // was already the offered row, its preceding click was a no-op.
          if (
            sampled === undefined &&
            command.id === CAPTURED_APOCALYPSE_TECHS.first
          )
            return;
          if (
            sampled === undefined &&
            (CAPTURED_WHITEHOLE_TECH_IDS.some((id) => id === command.id) ||
              command.id === CAPTURED_WHITEHOLE_REPAIR_TECH)
          )
            return;
          if (sampled === undefined) {
            throw new Error(
              `captured prestige action ${command.id} was not offered`,
            );
          }
          const handle = dependencies.controls.resolve(command.id);
          if (handle === undefined || !handle.methods.includes("action")) {
            if (command.id === CAPTURED_WHITEHOLE_REPAIR_TECH) return;
            throw new Error(
              `captured prestige action ${command.id} is unavailable`,
            );
          }
          if (handle.generation !== sampled.generation) {
            if (command.id === CAPTURED_WHITEHOLE_REPAIR_TECH) return;
            throw new Error(
              `captured prestige action ${command.id} was redrawn`,
            );
          }
          const corruptedAiBefore =
            command.id === CAPTURED_APOCALYPSE_TECHS.first
              ? readProperty(
                  readProperty(dependencies.rootState.readRoot(), "tech"),
                  "corrupted_ai",
                )
              : undefined;
          if (
            (command.id === CAPTURED_CATACLYSM_TECH ||
              CAPTURED_DEMONIC_TECH_IDS.some((id) => id === command.id) ||
              command.id === CAPTURED_APOCALYPSE_TECHS.final ||
              command.id === CAPTURED_WHITEHOLE_TECHS.confirm ||
              command.id === CAPTURED_WHITEHOLE_REPAIR_TECH) &&
            !capturedTechIsAffordable(sampled, dependencies.resources)
          ) {
            return;
          }
          const whiteholeLevelBefore =
            command.id === CAPTURED_WHITEHOLE_TECHS.confirm
              ? (finite(
                  readProperty(
                    readProperty(dependencies.rootState.readRoot(), "tech"),
                    "whitehole",
                  ),
                ) ?? 0)
              : 0;
          const result = invokeCapturedPrestigeAction(
            dependencies.rootState,
            dependencies.controls,
            handle,
          );
          if (!result.ok) {
            throw new Error(
              `captured prestige action ${command.id} failed: ${result.detail ?? result.reason}`,
            );
          }
          if (command.id === CAPTURED_APOCALYPSE_TECHS.first) {
            const corruptedAiAfter = readProperty(
              readProperty(dependencies.rootState.readRoot(), "tech"),
              "corrupted_ai",
            );
            apocalypseFirstActionDone = corruptedAiAfter !== corruptedAiBefore;
            return;
          }
          if (
            command.id === CAPTURED_CATACLYSM_TECH ||
            CAPTURED_DEMONIC_TECH_IDS.some((id) => id === command.id) ||
            command.id === CAPTURED_APOCALYPSE_TECHS.final
          ) {
            resetCommitted = true;
          }
          if (command.id === CAPTURED_WHITEHOLE_TECHS.confirm) {
            const whiteholeLevelAfter =
              finite(
                readProperty(
                  readProperty(dependencies.rootState.readRoot(), "tech"),
                  "whitehole",
                ),
              ) ?? 0;
            if (whiteholeLevelAfter <= whiteholeLevelBefore) return;
            resetCommitted = true;
          }
          if (command.id === CAPTURED_WHITEHOLE_REPAIR_TECH) {
            if (
              !capturedWhiteholeRepairSucceeded(
                dependencies.rootState.readRoot(),
              )
            ) {
              return;
            }
            const label = readCapturedControlLabel(
              handle,
              "Stabilize Blackhole",
            );
            dependencies.onActivity?.({
              message: `Researched ${label}`,
              color: "success",
              tags: Object.freeze(["queue", "research_queue"]),
            });
            return;
          }
          if (
            command.id !== CAPTURED_CATACLYSM_TECH &&
            !CAPTURED_DEMONIC_TECH_IDS.some((id) => id === command.id) &&
            command.id !== CAPTURED_APOCALYPSE_TECHS.final &&
            command.id !== CAPTURED_WHITEHOLE_TECHS.confirm
          ) {
            return;
          }
          // The Vue wrapper does not return the lexical action's boolean. The
          // drawn row and live affordability already gated this call, so a
          // successful wrapper invocation is the only synchronous commit fact
          // available before the game's delayed reset.
          dependencies.onActivity?.({
            message: "Prestiged",
            color: "info",
            tags: Object.freeze(["achievements"]),
          });
          return;
        }
        default:
          // Unsupported branches are intentionally represented as noop by this bounded reader.
          return;
      }
    },
  });
  return Object.freeze({ reader, executor });
}
