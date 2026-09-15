/**
 * Evolution controls for the captured DeadSpace page.
 *
 * The game keeps its race and action catalogs module-lexical. The captured
 * runtime therefore takes target choices only from the validated settings
 * record, uses the game's drawn evolution rows for current costs and action
 * order, and invokes the closures captured when those rows were bound. It
 * does not recreate the race weighting, planet generation, or evolution cost
 * formulas that the game owns.
 */

import { planUniverseSelection } from "../../../../domain/progression/evolution/universe-selection.ts";
import type {
  ChallengeGroup,
  EvolutionCellCounts,
  EvolutionLandingGate,
  EvolutionTreeAction,
  ImitationInput,
  RaceView,
  TargetSelectionInput,
} from "../../../../domain/progression/evolution/evolution.ts";
import type {
  EvolutionCostsSample,
  EvolutionExecutor,
  EvolutionReader,
  ResourceAccumulationCommand,
} from "../../../../ports/evolution.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameActivitySink } from "../../../../ports/game-message-log.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { UniverseSelectionControls } from "../../../../ports/progression-controls.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";

const EVOLUTION_ACTION_PREFIX = "evolution-";
const EVOLUTION_ACTION_SELECTOR = "#evolution > .action";
const RESOURCE_ACTION_IDS = new Set(["rna", "dna"]);

export interface CapturedEvolutionDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly drawnActions: GameDrawnActionsReader;
  readonly readSettings: () => unknown;
  readonly readEvolutionAttempts: () => number;
  readonly loadQueuedSettings: () => void;
  readonly universeControls: UniverseSelectionControls;
  readonly challengeGroups: readonly ChallengeGroup[];
  readonly onActivity?: GameActivitySink;
}

export interface CapturedEvolutionAdapter {
  readonly reader: EvolutionReader;
  readonly executor: EvolutionExecutor;
  readonly runUniverseSelection: () => void;
}

function capturedEvolutionRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isNonArrayRecord(value) ? value : undefined;
}

function rootRecord(
  rootState: GameRootStateSource,
): Record<string, unknown> | undefined {
  return capturedEvolutionRecord(rootState.readRoot());
}

function nestedRecord(
  owner: unknown,
  key: string,
): Record<string, unknown> | undefined {
  return capturedEvolutionRecord(readProperty(owner, key));
}

function readRace(
  rootState: GameRootStateSource,
): Record<string, unknown> | undefined {
  return nestedRecord(rootRecord(rootState), "race");
}

function capturedEvolutionReadSettings(
  getSettings: () => unknown,
): Record<string, unknown> | undefined {
  return capturedEvolutionRecord(getSettings());
}

function readActionRows(
  drawnActions: GameDrawnActionsReader,
): readonly Readonly<{ id: string; cost: Readonly<Record<string, number>> }>[] {
  return drawnActions
    .read(EVOLUTION_ACTION_SELECTOR)
    .filter((action) => action.id.startsWith(EVOLUTION_ACTION_PREFIX));
}

function capturedEvolutionActionId(rowId: string): string {
  return rowId.slice(EVOLUTION_ACTION_PREFIX.length);
}

function resourceAmount(
  rootState: GameRootStateSource,
  id: string,
  field: "amount" | "max",
): number {
  const root = rootRecord(rootState);
  const resource = nestedRecord(nestedRecord(root, "resource"), id);
  return Number(readProperty(resource, field));
}

function evolutionCount(rootState: GameRootStateSource, id: string): number {
  const root = rootRecord(rootState);
  const evolution = nestedRecord(nestedRecord(root, "evolution"), id);
  return Number(readProperty(evolution, "count"));
}

function actionRowsForTree(
  rows: readonly Readonly<{
    id: string;
    cost: Readonly<Record<string, number>>;
  }>[],
  challengeIds: ReadonlySet<string>,
  targetId: string,
  rootState: GameRootStateSource,
): readonly Readonly<{ id: string; cost: Readonly<Record<string, number>> }>[] {
  const targetRow = rows.find(
    (row) => capturedEvolutionActionId(row.id) === targetId,
  );
  const finalMenu = readProperty(readRace(rootState), "evoFinalMenu");
  if (typeof finalMenu === "string" && targetRow !== undefined) {
    return Object.freeze([targetRow]);
  }
  return Object.freeze(
    rows.filter((row) => {
      const id = capturedEvolutionActionId(row.id);
      return !challengeIds.has(id) && !RESOURCE_ACTION_IDS.has(id);
    }),
  );
}

function explicitTarget(
  settings: Record<string, unknown> | undefined,
): string | undefined {
  const target = settings?.["userEvolutionTarget"];
  return typeof target === "string" &&
    target.length > 0 &&
    target !== "auto" &&
    target !== "none"
    ? target
    : undefined;
}

export function createCapturedEvolution(
  dependencies: CapturedEvolutionDependencies,
): CapturedEvolutionAdapter {
  const challengeTraitById = new Map<string, string>();
  const challengeIds = new Set<string>();
  for (const group of dependencies.challengeGroups) {
    for (const member of group.members) {
      challengeIds.add(member.id);
      challengeTraitById.set(member.id, member.trait);
    }
  }

  let storedTarget: { id: string; name: string } | undefined;
  let lastSpecies: string | undefined;
  const reportActivity = dependencies.onActivity ?? (() => {});

  const reader: EvolutionReader = Object.freeze({
    sampleSpecies(): string {
      const species = readProperty(readRace(dependencies.rootState), "species");
      const value = typeof species === "string" ? species : "";
      if (lastSpecies === "protoplasm" && value !== "protoplasm") {
        storedTarget = undefined;
      }
      lastSpecies = value;
      return value;
    },

    sampleLandingGate(): EvolutionLandingGate {
      const race = readRace(dependencies.rootState);
      const universe = readProperty(race, "universe");
      return Object.freeze({
        universe: typeof universe === "string" ? universe : null,
        seeded: Boolean(readProperty(race, "seeded")),
        chose: Boolean(readProperty(race, "chose")),
      });
    },

    hasStoredTarget(): boolean {
      return storedTarget !== undefined;
    },

    storedTargetId(): string | null {
      return storedTarget?.id ?? null;
    },

    sampleTargetSelection(): TargetSelectionInput {
      const settings = capturedEvolutionReadSettings(dependencies.readSettings);
      const target = explicitTarget(settings);
      const races: readonly RaceView[] = target
        ? Object.freeze([
            Object.freeze({
              id: target,
              weighting: 0,
              habitability: 1,
              genus: "captured",
              name: target,
            }),
          ])
        : Object.freeze([]);
      const stats = nestedRecord(rootRecord(dependencies.rootState), "stats");
      const achieve = nestedRecord(stats, "achieve");
      const queue = settings?.["evolutionQueue"];
      return Object.freeze({
        races,
        userEvolutionTarget:
          typeof settings?.["userEvolutionTarget"] === "string"
            ? settings["userEvolutionTarget"]
            : "unreadable",
        massExtinction: Boolean(achieve?.["mass_extinction"]),
        queueEnabled: settings?.["evolutionQueueEnabled"] === true,
        queueLength: Array.isArray(queue) ? queue.length : 0,
        queueRepeat: settings?.["evolutionQueueRepeat"] === true,
        evolutionAttempts: dependencies.readEvolutionAttempts(),
      });
    },

    sampleRaceTrait(trait: string): number {
      return Number(readProperty(readRace(dependencies.rootState), trait));
    },

    sampleCosts(targetId: string): EvolutionCostsSample {
      const rows = actionRowsForTree(
        readActionRows(dependencies.drawnActions),
        challengeIds,
        targetId,
        dependencies.rootState,
      );
      let maxRna = 0;
      let maxDna = 0;
      for (const row of rows) {
        maxRna = Math.max(maxRna, row.cost["RNA"] ?? 0);
        maxDna = Math.max(maxDna, row.cost["DNA"] ?? 0);
      }
      return Object.freeze({
        maxRna,
        maxDna,
        rnaCurrent: resourceAmount(dependencies.rootState, "RNA", "amount"),
        rnaMax: resourceAmount(dependencies.rootState, "RNA", "max"),
        dnaCurrent: resourceAmount(dependencies.rootState, "DNA", "amount"),
        dnaMax: resourceAmount(dependencies.rootState, "DNA", "max"),
      });
    },

    sampleEvolutionTree(targetId: string): readonly EvolutionTreeAction[] {
      const rows = actionRowsForTree(
        readActionRows(dependencies.drawnActions),
        challengeIds,
        targetId,
        dependencies.rootState,
      );
      const race = readRace(dependencies.rootState);
      return Object.freeze(
        rows.map((row) => {
          const id = capturedEvolutionActionId(row.id);
          const trait = challengeTraitById.get(id);
          return Object.freeze({
            id,
            unlocked: true,
            activeChallenge:
              trait !== undefined && Number(readProperty(race, trait)) === 1,
          });
        }),
      );
    },

    sampleCells(): EvolutionCellCounts {
      return Object.freeze({
        mitochondriaCount: evolutionCount(
          dependencies.rootState,
          "mitochondria",
        ),
        eukaryoticCellCount: evolutionCount(
          dependencies.rootState,
          "eukaryotic_cell",
        ),
        nucleusCount: evolutionCount(dependencies.rootState, "nucleus"),
        organellesCount: evolutionCount(dependencies.rootState, "organelles"),
        rnaMax: resourceAmount(dependencies.rootState, "RNA", "max"),
        dnaMax: resourceAmount(dependencies.rootState, "DNA", "max"),
      });
    },

    sampleImitation(): ImitationInput {
      const race = readRace(dependencies.rootState);
      const settings = capturedEvolutionReadSettings(dependencies.readSettings);
      const imitateRace =
        typeof settings?.["imitateRace"] === "string"
          ? (settings["imitateRace"] as string)
          : "";
      const wanted = `${EVOLUTION_ACTION_PREFIX}s-${imitateRace}`;
      const imitationExists = readActionRows(dependencies.drawnActions).some(
        (row) => row.id === wanted,
      );
      return Object.freeze({
        evoFinalMenu: Boolean(readProperty(race, "evoFinalMenu")),
        imitationExists,
        imitateRace,
      });
    },

    sampleChallengeEnabled(
      groupIds: readonly string[],
    ): Readonly<Record<string, boolean>> {
      const settings = capturedEvolutionReadSettings(dependencies.readSettings);
      const enabled: Record<string, boolean> = {};
      for (const id of groupIds) {
        enabled[id] = settings?.[`challenge_${id}`] === true;
      }
      return Object.freeze(enabled);
    },
  });

  const invokeAction = (id: string): boolean => {
    const handle = dependencies.controls.resolve(
      `${EVOLUTION_ACTION_PREFIX}${id}`,
    );
    if (handle === undefined) return false;
    return dependencies.controls.invoke(handle, "action").ok;
  };

  const invokeRepeated = (id: string, count: number): void => {
    for (let index = 0; index < count; index++) {
      if (!invokeAction(id)) {
        throw new TypeError(`captured evolution control unavailable: ${id}`);
      }
    }
  };

  const executor: EvolutionExecutor = Object.freeze({
    loadQueuedSettings(): void {
      dependencies.loadQueuedSettings();
    },

    commitTarget(id: string, name: string): void {
      storedTarget = { id, name };
      reportActivity({
        message: `Attempting evolution of ${name}.`,
        color: "success",
        tags: Object.freeze(["progress"]),
      });
    },

    clickEvolution(id: string): boolean {
      return invokeAction(id);
    },

    accumulateResources(command: Readonly<ResourceAccumulationCommand>): void {
      invokeRepeated("rna", command.rnaForDna);
      invokeRepeated("dna", command.dnaForEvolution);
      invokeRepeated("rna", command.rnaForEvolution);
    },

    clickImitation(imitateRace: string): boolean {
      return invokeAction(`s-${imitateRace}`);
    },

    logImitationUnavailable(imitateRace: string): void {
      reportActivity({
        message: `${imitateRace} not available for imitation. Please select an available race.`,
        color: "danger",
        tags: Object.freeze(["progress", "achievements"]),
      });
    },

    logImitationNoRace(): void {
      reportActivity({
        message:
          "No race selected for imitation. Please select an available race to continue.",
        color: "danger",
        tags: Object.freeze(["progress", "achievements"]),
      });
    },
  });

  return Object.freeze({
    reader,
    executor,
    runUniverseSelection: () => {
      const race = readRace(dependencies.rootState);
      const settings = capturedEvolutionReadSettings(dependencies.readSettings);
      const targetName = settings?.["userUniverseTargetName"];
      if (typeof targetName !== "string") return;
      const universe = readProperty(race, "universe");
      const target = planUniverseSelection({
        hasBigbang: Boolean(readProperty(race, "bigbang")),
        universe: typeof universe === "string" ? universe : null,
        targetName,
      });
      if (target !== null) dependencies.universeControls.selectUniverse(target);
    },
  });
}
