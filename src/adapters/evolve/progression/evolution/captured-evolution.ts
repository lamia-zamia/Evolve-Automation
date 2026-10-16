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
  EvolutionGenusSelectionInput,
  EvolutionLandingGate,
  EvolutionTreeAction,
  ImitationInput,
  TargetSelectionInput,
} from "../../../../domain/progression/evolution/evolution.ts";
import type {
  EvolutionCostsSample,
  EvolutionExecutor,
  EvolutionReader,
  EvolutionResultSample,
  ResourceAccumulationCommand,
} from "../../../../ports/evolution.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameActivitySink } from "../../../../ports/game-message-log.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { UniverseSelectionControls } from "../../../../ports/progression-controls.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";
import {
  readCapturedEvolutionTargetGenus,
  sampleCapturedEvolutionRaceCatalog,
} from "./captured-evolution-race-catalog.ts";
import { CAPTURED_EVOLUTION_GENERA } from "./captured-evolution-catalog.ts";
import { readCapturedEvolutionResult } from "./captured-evolution-result.ts";

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
  /**
   * Forgets the committed target so the next cycle re-runs selection. The settings panel calls
   * this when the player picks a different Target Race mid-evolution; without it the run would
   * keep evolving toward the race that was current when the target was committed.
   */
  readonly clearStoredTarget: () => void;
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

function capturedEvolutionActionState(
  root: unknown,
  id: string,
  challengeTrait: string | undefined,
): unknown {
  if (id === "rna" || id === "dna") {
    return readProperty(
      readProperty(readProperty(root, "resource"), id.toUpperCase()),
      "amount",
    );
  }
  if (id.startsWith("s-")) {
    return readProperty(readProperty(root, "race"), "imitation");
  }
  if (challengeTrait !== undefined) {
    return readProperty(readProperty(root, "race"), challengeTrait);
  }
  const genus = CAPTURED_EVOLUTION_GENERA.find(
    (candidate) => candidate.actionId === id,
  );
  const genusTech =
    genus === undefined
      ? undefined
      : readProperty(readProperty(root, "tech"), `evo_${genus.id}`);
  if (genusTech !== undefined) return genusTech;
  const actionState = readProperty(readProperty(root, "evolution"), id);
  const count = readProperty(actionState, "count");
  return count === undefined ? actionState : count;
}

function capturedEvolutionResource(
  root: unknown,
  id: "RNA" | "DNA",
): { readonly amount: number; readonly max: number } | undefined {
  const resource = nestedRecord(nestedRecord(root, "resource"), id);
  const amount = Number(readProperty(resource, "amount"));
  const max = Number(readProperty(resource, "max"));
  return Number.isFinite(amount) && Number.isFinite(max)
    ? Object.freeze({ amount, max })
    : undefined;
}

function capturedEvolutionRootInvalidated(root: unknown): boolean {
  const record = capturedEvolutionRecord(root);
  const resources = nestedRecord(record, "resource");
  const evolution = nestedRecord(record, "evolution");
  return (
    readProperty(readProperty(record, "race"), "species") === "protoplasm" &&
    Number(readProperty(readProperty(record, "stats"), "days")) === 0 &&
    resources !== undefined &&
    Object.keys(resources).length === 0 &&
    evolution !== undefined &&
    Object.keys(evolution).length === 0
  );
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
  const reportedEvolutionFailures = new Set<string>();
  const reportActivity = dependencies.onActivity ?? (() => {});

  const reportEvolutionFailure = (id: string, detail: string): void => {
    const key = `${id}:${detail}`;
    if (reportedEvolutionFailures.has(key)) return;
    reportedEvolutionFailures.add(key);
    reportActivity({
      message: `Evolution action ${id} failed: ${detail}`,
      color: "danger",
      tags: Object.freeze(["progress"]),
    });
  };

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

    evolutionActionsReady(): boolean {
      const root = dependencies.rootState.readRoot();
      if (
        capturedEvolutionResource(root, "RNA") === undefined ||
        capturedEvolutionResource(root, "DNA") === undefined
      ) {
        return false;
      }
      const rows = new Set(
        readActionRows(dependencies.drawnActions).map((row) => row.id),
      );
      for (const id of ["rna", "dna"]) {
        const elementId = `${EVOLUTION_ACTION_PREFIX}${id}`;
        const handle = dependencies.controls.resolve(elementId);
        if (
          !rows.has(elementId) ||
          handle === undefined ||
          !Number.isSafeInteger(handle.generation) ||
          handle.generation < 1 ||
          !handle.methods.includes("action")
        ) {
          return false;
        }
      }
      return true;
    },

    hasStoredTarget(): boolean {
      return storedTarget !== undefined;
    },

    storedTargetId(): string | null {
      return storedTarget?.id ?? null;
    },

    sampleTargetSelection(): TargetSelectionInput {
      const settings = capturedEvolutionReadSettings(dependencies.readSettings);
      const catalog = sampleCapturedEvolutionRaceCatalog(
        dependencies.rootState.readRoot(),
        settings,
      );
      const queue = settings?.["evolutionQueue"];
      return Object.freeze({
        races: catalog.races,
        catalogAvailable: catalog.status === "ready",
        userEvolutionTarget:
          typeof settings?.["userEvolutionTarget"] === "string"
            ? settings["userEvolutionTarget"]
            : "unreadable",
        massExtinction: catalog.massExtinction,
        queueEnabled: settings?.["evolutionQueueEnabled"] === true,
        queueLength: Array.isArray(queue) ? queue.length : 0,
        queueRepeat: settings?.["evolutionQueueRepeat"] === true,
        evolutionAttempts: dependencies.readEvolutionAttempts(),
      });
    },

    sampleEvolutionResult(): EvolutionResultSample {
      return readCapturedEvolutionResult(
        dependencies.rootState.readRoot(),
        dependencies.readSettings(),
      );
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

    sampleEvolutionGenusSelection(
      targetId: string,
    ): EvolutionGenusSelectionInput {
      const target = readCapturedEvolutionTargetGenus(
        dependencies.rootState.readRoot(),
        targetId,
      );
      const root = rootRecord(dependencies.rootState);
      const evolution = nestedRecord(root, "evolution");
      const tech = nestedRecord(root, "tech");
      const settings = capturedEvolutionReadSettings(dependencies.readSettings);
      const availableActions = readActionRows(dependencies.drawnActions);
      const actions = CAPTURED_EVOLUTION_GENERA.flatMap((genus) => {
        const row = availableActions.find(
          (candidate) =>
            capturedEvolutionActionId(candidate.id) === genus.actionId,
        );
        return row === undefined
          ? []
          : [
              Object.freeze({
                genus: genus.id,
                actionId: genus.actionId,
                unlocked: true,
              }),
            ];
      });
      const selectedGenus = CAPTURED_EVOLUTION_GENERA.find(
        (genus) => Number(readProperty(tech, `evo_${genus.id}`)) >= 2,
      )?.id;
      return Object.freeze({
        available: target !== undefined,
        genusSelectionActive: readProperty(evolution, "gselect") === true,
        targetOffersChoice: target?.targetOffersChoice === true,
        targetGenera: target?.targetGenera ?? Object.freeze([]),
        preferredGenus:
          typeof settings?.["userEvolutionGenus"] === "string"
            ? (settings["userEvolutionGenus"] as string)
            : null,
        selectedGenus: selectedGenus ?? null,
        actions: Object.freeze(actions),
      });
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

  const invokeAction = (id: string) => {
    const rootBefore = dependencies.rootState.readRoot();
    if (rootRecord(dependencies.rootState) === undefined) {
      return Object.freeze({ status: "unavailable" as const });
    }
    const handle = dependencies.controls.resolve(
      `${EVOLUTION_ACTION_PREFIX}${id}`,
    );
    if (handle === undefined || !handle.methods.includes("action")) {
      return Object.freeze({ status: "unavailable" as const });
    }
    const before = capturedEvolutionActionState(
      rootBefore,
      id,
      challengeTraitById.get(id),
    );
    const result = dependencies.controls.invoke(handle, "action");
    if (!result.ok) {
      if (
        result.reason === "stale-control" ||
        result.reason === "unknown-control"
      ) {
        return Object.freeze({ status: "unavailable" as const });
      }
      reportEvolutionFailure(id, result.detail ?? result.reason);
      return Object.freeze({
        status: "failed" as const,
        detail: result.detail ?? result.reason,
      });
    }
    const rootAfter = dependencies.rootState.readRoot();
    if (rootAfter !== rootBefore) {
      return Object.freeze({ status: "root-replaced" as const });
    }
    if (capturedEvolutionRootInvalidated(rootAfter)) {
      return Object.freeze({ status: "root-replaced" as const });
    }
    const after = capturedEvolutionActionState(
      rootAfter,
      id,
      challengeTraitById.get(id),
    );
    return Object.freeze({
      status: "invoked" as const,
      stateChanged: !Object.is(before, after),
    });
  };

  const invokeRepeated = (
    id: "rna" | "dna",
    count: number,
  ): "complete" | "deferred" | "failed" => {
    for (let index = 0; index < count; index++) {
      const resource = capturedEvolutionResource(
        dependencies.rootState.readRoot(),
        id.toUpperCase() as "RNA" | "DNA",
      );
      if (resource === undefined) return "deferred";
      if (resource.amount >= resource.max) return "complete";
      const outcome = invokeAction(id);
      if (outcome.status === "failed") return "failed";
      if (outcome.status !== "invoked" || !outcome.stateChanged)
        return "deferred";
      const after = capturedEvolutionResource(
        dependencies.rootState.readRoot(),
        id.toUpperCase() as "RNA" | "DNA",
      );
      if (after === undefined || after.amount <= resource.amount)
        return "deferred";
    }
    return "complete";
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

    clickEvolution(id: string) {
      return invokeAction(id);
    },

    accumulateResources(
      command: Readonly<ResourceAccumulationCommand>,
    ): "complete" | "deferred" | "failed" {
      const rnaForDna = invokeRepeated("rna", command.rnaForDna);
      if (rnaForDna !== "complete") return rnaForDna;
      const dna = invokeRepeated("dna", command.dnaForEvolution);
      if (dna !== "complete") return dna;
      return invokeRepeated("rna", command.rnaForEvolution);
    },

    clickImitation(imitateRace: string) {
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
    clearStoredTarget: () => {
      storedTarget = undefined;
    },
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
