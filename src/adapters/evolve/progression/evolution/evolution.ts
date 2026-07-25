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
import { requireFunction, requireRecord } from "../../../validation.ts";

/**
 * Loose views of the live game objects the evolution slice drives. The real
 * Race / EvolutionAction instances expose DOM-backed methods; the adapter is
 * the only layer permitted to touch them, and validates each container before
 * calling through.
 */
interface RaceObject {
  readonly id: string;
  readonly genus: unknown;
  readonly name: unknown;
  getWeighting(): unknown;
  getHabitability(): unknown;
  readonly evolutionTree: Record<string, unknown>;
}
interface EvolutionActionObject {
  readonly id: string;
  readonly count: unknown;
  readonly definition: unknown;
  isUnlocked(): unknown;
  click(): unknown;
}

function race(game: unknown): Record<string, unknown> {
  return requireRecord(
    requireRecord(requireRecord(game, "game")["global"], "game.global")["race"],
    "game.global.race",
  );
}

function globalStats(game: unknown): Record<string, unknown> {
  return requireRecord(
    requireRecord(requireRecord(game, "game")["global"], "game.global")[
      "stats"
    ],
    "game.global.stats",
  );
}

/** Plain coercion preserves the NaN poisoning legacy arithmetic relied on. */
function toNumber(value: unknown): number {
  return Number(value);
}

function raceObjects(getRaces: () => unknown): RaceObject[] {
  const races = requireRecord(getRaces(), "races");
  return Object.values(races).map(
    (value) =>
      // Adapter edge: the game's Race instances are opaque; the reader only
      // reads documented getters/methods and never mutates them.
      value as unknown as RaceObject,
  );
}

function evolutionActions(
  getEvolutions: () => unknown,
): Record<string, EvolutionActionObject> {
  // Adapter edge: EvolutionAction instances are opaque game objects.
  return requireRecord(getEvolutions(), "evolutions") as unknown as Record<
    string,
    EvolutionActionObject
  >;
}

interface BranchActionView {
  readonly id: string;
  readonly unlocked: boolean;
}

/**
 * A hybrid race exposes one evolution-tree branch per genus, all sharing the
 * bunker/race/sentience prefix; the genus-confirming action is the one right
 * after `sentience`. Its id is NOT the genus key — `giant` confirms with
 * `gigantism`, `small` with `dwarfism`, `insectoid` with `athropods`, etc. A
 * branch becomes usable once that action is unlocked (the game renders it only
 * when its reqs — e.g. an achievement — are met). Returns the first usable
 * branch key, or null when none is ready yet (early in the tree, before the
 * genus choice renders).
 */
export function selectUsableHybridBranch(
  branches: Readonly<Record<string, readonly BranchActionView[]>>,
): string | null {
  for (const key of Object.keys(branches)) {
    const branch = branches[key];
    if (branch === undefined) {
      continue;
    }
    const sentienceIndex = branch.findIndex((a) => a.id === "sentience");
    const genusAction =
      sentienceIndex >= 0 ? branch[sentienceIndex + 1] : undefined;
    if (genusAction !== undefined && genusAction.unlocked) {
      return key;
    }
  }
  return null;
}

function resolveEvolutionTree(
  getRaces: () => unknown,
  getSettings: () => unknown,
  targetId: string,
): EvolutionActionObject[] {
  const races = requireRecord(getRaces(), "races");
  const target = requireRecord(races[targetId], `races.${targetId}`);
  const tree = requireRecord(
    target["evolutionTree"],
    `races.${targetId}.evolutionTree`,
  );
  const settings = requireRecord(getSettings(), "settings");
  const genus = settings["userEvolutionGenus"];
  const keys = Object.keys(tree);
  const preferred = typeof genus === "string" ? tree[genus] : undefined;
  const fallback = tree[keys[0] as string];

  // Hybrid races have one branch per hybrid genus. A genus branch is only
  // usable when its genus-confirming action is unlocked (visible in the DOM) —
  // if the player lacks the achievement for that genus the action never
  // appears and the tree clicker would stall. Pick the first branch whose
  // genus action is unlocked; if none are ready yet (early in the tree), fall
  // back to the user preference or the first branch so the shared early
  // actions can progress.
  let branch: unknown = preferred ?? fallback;
  if (keys.length > 1) {
    const branchViews: Record<string, BranchActionView[]> = {};
    for (const k of keys) {
      const b = tree[k];
      branchViews[k] = Array.isArray(b)
        ? (b as EvolutionActionObject[]).map((action) => ({
            id: String(action.id),
            unlocked: Boolean(action.isUnlocked()),
          }))
        : [];
    }
    const usable = selectUsableHybridBranch(branchViews);
    if (usable !== null) {
      branch = tree[usable];
    }
  }

  if (!Array.isArray(branch)) {
    throw new TypeError(
      `races.${targetId}.evolutionTree branch is not an array`,
    );
  }
  // Adapter edge: branch entries are opaque EvolutionAction instances.
  return branch as EvolutionActionObject[];
}

export interface EvolutionReaderDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly getState: () => unknown;
  readonly getRaces: () => unknown;
  readonly getEvolutions: () => unknown;
  readonly getImitations: () => unknown;
  readonly getResources: () => unknown;
  readonly getPoly: () => unknown;
  readonly challengeGroups: readonly ChallengeGroup[];
}

export function createEvolutionReader(
  dependencies: EvolutionReaderDependencies,
): EvolutionReader {
  const challengeTraitById = new Map<string, string>();
  for (const group of dependencies.challengeGroups) {
    for (const member of group.members) {
      challengeTraitById.set(member.id, member.trait);
    }
  }

  const resourceLevel = (id: string): { current: number; max: number } => {
    const resources = requireRecord(dependencies.getResources(), "resources");
    const resource = requireRecord(resources[id], `resources.${id}`);
    return {
      current: toNumber(resource["currentQuantity"]),
      max: toNumber(resource["maxQuantity"]),
    };
  };

  return Object.freeze({
    sampleSpecies(): string {
      const species = race(dependencies.getGame())["species"];
      // Non-string species never equals "protoplasm", matching legacy.
      return typeof species === "string" ? species : "";
    },

    sampleLandingGate(): EvolutionLandingGate {
      const current = race(dependencies.getGame());
      const universe = current["universe"];
      return Object.freeze({
        universe: typeof universe === "string" ? universe : null,
        seeded: Boolean(current["seeded"]),
        chose: Boolean(current["chose"]),
      });
    },

    hasStoredTarget(): boolean {
      const state = requireRecord(dependencies.getState(), "state");
      return state["evolutionTarget"] !== null;
    },

    storedTargetId(): string | null {
      const state = requireRecord(dependencies.getState(), "state");
      const target = state["evolutionTarget"];
      return typeof target === "string" ? target : null;
    },

    sampleTargetSelection(): TargetSelectionInput {
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const settingsRaw = requireRecord(
        dependencies.getSettingsRaw(),
        "settingsRaw",
      );
      const state = requireRecord(dependencies.getState(), "state");
      const stats = globalStats(dependencies.getGame());
      const achieve = requireRecord(
        stats["achieve"],
        "game.global.stats.achieve",
      );
      const races: RaceView[] = raceObjects(dependencies.getRaces).map((r) =>
        Object.freeze({
          id: r.id,
          weighting: toNumber(r.getWeighting()),
          habitability: toNumber(r.getHabitability()),
          genus: String(r.genus),
          name: String(r.name),
        }),
      );
      const queue = settingsRaw["evolutionQueue"];
      const userTarget = settings["userEvolutionTarget"];
      return Object.freeze({
        races: Object.freeze(races),
        userEvolutionTarget:
          typeof userTarget === "string" ? userTarget : String(userTarget),
        massExtinction: Boolean(achieve["mass_extinction"]),
        queueEnabled: Boolean(settings["evolutionQueueEnabled"]),
        queueLength: Array.isArray(queue) ? queue.length : 0,
        queueRepeat: Boolean(settings["evolutionQueueRepeat"]),
        evolutionAttempts: toNumber(state["evolutionAttempts"]),
      });
    },

    sampleRaceTrait(trait: string): number {
      const value = race(dependencies.getGame())[trait];
      // Absent/non-numeric traits are "not active" (!== 1) like legacy.
      return typeof value === "number" ? value : NaN;
    },

    sampleCosts(targetId: string): EvolutionCostsSample {
      const tree = resolveEvolutionTree(
        dependencies.getRaces,
        dependencies.getSettings,
        targetId,
      );
      const poly = requireRecord(dependencies.getPoly(), "poly");
      const adjustCosts = requireFunction(
        poly["adjustCosts"],
        "poly.adjustCosts",
      );
      let maxRna = 0;
      let maxDna = 0;
      for (const action of tree) {
        const costs = requireRecord(
          adjustCosts(action.definition),
          "adjustedCosts",
        );
        const rnaCost = costs["RNA"];
        const dnaCost = costs["DNA"];
        maxRna = Math.max(
          maxRna,
          Number(typeof rnaCost === "function" ? rnaCost() : 0),
        );
        maxDna = Math.max(
          maxDna,
          Number(typeof dnaCost === "function" ? dnaCost() : 0),
        );
      }
      const rna = resourceLevel("RNA");
      const dna = resourceLevel("DNA");
      return Object.freeze({
        maxRna,
        maxDna,
        rnaCurrent: rna.current,
        rnaMax: rna.max,
        dnaCurrent: dna.current,
        dnaMax: dna.max,
      });
    },

    sampleEvolutionTree(targetId: string): readonly EvolutionTreeAction[] {
      const tree = resolveEvolutionTree(
        dependencies.getRaces,
        dependencies.getSettings,
        targetId,
      );
      const current = race(dependencies.getGame());
      return Object.freeze(
        tree.map((action) => {
          const trait = challengeTraitById.get(action.id);
          return Object.freeze({
            id: action.id,
            unlocked: Boolean(action.isUnlocked()),
            activeChallenge: trait !== undefined && Boolean(current[trait]),
          });
        }),
      );
    },

    sampleCells(): EvolutionCellCounts {
      const evolutions = evolutionActions(dependencies.getEvolutions);
      const rna = resourceLevel("RNA");
      const dna = resourceLevel("DNA");
      const countOf = (id: string): number => {
        const action = evolutions[id];
        if (action === undefined) {
          throw new TypeError(`evolutions.${id} is missing`);
        }
        return toNumber(action.count);
      };
      return Object.freeze({
        mitochondriaCount: countOf("mitochondria"),
        eukaryoticCellCount: countOf("eukaryotic_cell"),
        nucleusCount: countOf("nucleus"),
        organellesCount: countOf("organelles"),
        rnaMax: rna.max,
        dnaMax: dna.max,
      });
    },

    sampleImitation(): ImitationInput {
      const current = race(dependencies.getGame());
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const imitateRaceValue = settings["imitateRace"];
      const imitateRace =
        typeof imitateRaceValue === "string"
          ? imitateRaceValue
          : String(imitateRaceValue);
      const imitations = requireRecord(
        dependencies.getImitations(),
        "imitations",
      );
      const wanted = `s-${imitateRace}`;
      const imitationExists = Object.values(imitations).some((value) => {
        return (
          typeof value === "object" &&
          value !== null &&
          (value as Record<string, unknown>)["id"] === wanted
        );
      });
      return Object.freeze({
        evoFinalMenu: Boolean(current["evoFinalMenu"]),
        imitationExists,
        imitateRace,
      });
    },

    sampleChallengeEnabled(
      groupIds: readonly string[],
    ): Readonly<Record<string, boolean>> {
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const enabled: Record<string, boolean> = {};
      for (const id of groupIds) {
        enabled[id] = Boolean(settings[`challenge_${id}`]);
      }
      return Object.freeze(enabled);
    },
  });
}

export interface EvolutionExecutorDependencies {
  readonly getGame: () => unknown;
  readonly getState: () => unknown;
  readonly getResources: () => unknown;
  readonly getEvolutions: () => unknown;
  readonly getImitations: () => unknown;
  readonly loadQueuedSettings: () => void;
  readonly gameLog: {
    logSuccess(type: string, message: string, tags: string[]): void;
    logDanger(type: string, message: string, tags: string[]): void;
  };
}

export function createEvolutionCommandExecutor(
  dependencies: EvolutionExecutorDependencies,
): EvolutionExecutor {
  const setResourceCurrent = (id: string, value: number): void => {
    const resources = requireRecord(dependencies.getResources(), "resources");
    const resource = requireRecord(resources[id], `resources.${id}`);
    resource["currentQuantity"] = value;
  };

  return Object.freeze({
    loadQueuedSettings(): void {
      dependencies.loadQueuedSettings();
    },

    commitTarget(id: string, name: string): void {
      const state = requireRecord(dependencies.getState(), "state");
      state["evolutionTarget"] = id;
      dependencies.gameLog.logSuccess(
        "special",
        `Attempting evolution of ${name}.`,
        ["progress"],
      );
    },

    clickEvolution(id: string): boolean {
      const evolutions = evolutionActions(dependencies.getEvolutions);
      const action = evolutions[id];
      if (action === undefined) {
        throw new TypeError(`evolutions.${id} is missing`);
      }
      return Boolean(action.click());
    },

    accumulateResources(command: Readonly<ResourceAccumulationCommand>): void {
      const evolution = requireRecord(
        requireRecord(
          requireRecord(dependencies.getGame(), "game")["actions"],
          "game.actions",
        )["evolution"],
        "game.actions.evolution",
      );
      const rna = requireRecord(evolution["rna"], "game.actions.evolution.rna");
      const dna = requireRecord(evolution["dna"], "game.actions.evolution.dna");
      const rnaAction = requireFunction(
        rna["action"],
        "game.actions.evolution.rna.action",
      );
      const dnaAction = requireFunction(
        dna["action"],
        "game.actions.evolution.dna.action",
      );
      for (let i = 0; i < command.rnaForDna; i++) {
        rnaAction();
      }
      for (let i = 0; i < command.dnaForEvolution; i++) {
        dnaAction();
      }
      for (let i = 0; i < command.rnaForEvolution; i++) {
        rnaAction();
      }
      setResourceCurrent("RNA", command.newRna);
      setResourceCurrent("DNA", command.newDna);
    },

    clickImitation(imitateRace: string): boolean {
      const imitations = requireRecord(
        dependencies.getImitations(),
        "imitations",
      );
      const wanted = `s-${imitateRace}`;
      const target = Object.values(imitations).find(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          (value as Record<string, unknown>)["id"] === wanted,
      ) as { click(): unknown } | undefined;
      return target !== undefined ? Boolean(target.click()) : false;
    },

    logImitationUnavailable(imitateRace: string): void {
      dependencies.gameLog.logDanger(
        "special",
        `${imitateRace} not avaialble for imitation. Please select an available race.`,
        ["progress", "achievements"],
      );
    },

    logImitationNoRace(): void {
      dependencies.gameLog.logDanger(
        "special",
        `No race selected for imitation. Please select an available race to continue.`,
        ["progress", "achievements"],
      );
    },
  });
}
