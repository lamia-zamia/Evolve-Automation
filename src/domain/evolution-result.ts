/** Species that can only be evolved intentionally, never as a random result. */
export const INTENTIONAL_SPECIES = [
  "junker",
  "sludge",
  "ultra_sludge",
  "hellspawn",
] as const;

export interface EvolutionRaceView {
  readonly name: string;
  /** Achievement-based weighting of the evolved species for this prestige. */
  readonly weighting: number;
  /** Auto Achievement goal ids the evolved species is chasing. */
  readonly goals: readonly string[];
}

export interface EvolutionTraitView {
  /** Display name used in the reset log. */
  readonly name: string;
  readonly resetEnabled: boolean;
  /** Whether the evolved race currently has the trait. */
  readonly gained: boolean;
  /** Whether the base (unmutated) race already has the trait. */
  readonly inheritedFromBase: boolean;
}

export interface EvolutionResultInput {
  readonly autoEvolution: boolean;
  readonly evolutionBackup: boolean;
  readonly autoMutateTraits: boolean;
  /** "auto" for Auto Achievement, otherwise the explicit target species id. */
  readonly userEvolutionTarget: string;
  readonly species: string;
  readonly speciesRace: Readonly<EvolutionRaceView>;
  /** Highest weighting available across all evolvable races. */
  readonly bestWeighting: number;
  /**
   * Habitability of the explicit target species, sampled only when a distinct
   * explicit target is configured; undefined for Auto Achievement.
   */
  readonly targetHabitability?: number;
  readonly traits: readonly Readonly<EvolutionTraitView>[];
}

export type EvolutionLogEvent =
  | {
      readonly level: "danger";
      readonly code: "backup-no-achievements";
      readonly raceName: string;
    }
  | {
      readonly level: "warning";
      readonly code: "backup-no-race";
      readonly raceName: string;
    }
  | { readonly level: "danger"; readonly code: "wrong-race" }
  | {
      readonly level: "danger";
      readonly code: "gained-trait";
      readonly traitName: string;
    }
  | {
      readonly level: "info";
      readonly code: "auto-goals";
      readonly goals: readonly string[];
    }
  | { readonly level: "info"; readonly code: "auto-goals-none" };

export interface EvolutionResultDecision {
  readonly logs: readonly EvolutionLogEvent[];
  readonly needReset: boolean;
}

function isIntentionalSpecies(species: string): boolean {
  return (INTENTIONAL_SPECIES as readonly string[]).includes(species);
}

/**
 * Decides whether the evolved race is acceptable and, if not, that the run should
 * soft reset. Pure: the caller performs the reset, persistence, and logging.
 */
export function decideEvolutionResult(
  input: Readonly<EvolutionResultInput>,
): EvolutionResultDecision {
  const logs: EvolutionLogEvent[] = [];
  let needReset = false;

  if (
    input.autoEvolution &&
    input.evolutionBackup &&
    !isIntentionalSpecies(input.species)
  ) {
    if (input.userEvolutionTarget === "auto") {
      if (input.speciesRace.weighting <= 0) {
        if (input.bestWeighting > 0) {
          logs.push({
            level: "danger",
            code: "backup-no-achievements",
            raceName: input.speciesRace.name,
          });
          needReset = true;
        } else {
          logs.push({
            level: "warning",
            code: "backup-no-race",
            raceName: input.speciesRace.name,
          });
        }
      }
    } else if (
      input.userEvolutionTarget !== input.species &&
      (input.targetHabitability ?? 0) > 0
    ) {
      logs.push({ level: "danger", code: "wrong-race" });
      needReset = true;
    }
  }

  if (input.autoMutateTraits) {
    for (const trait of input.traits) {
      if (trait.resetEnabled && trait.gained && !trait.inheritedFromBase) {
        logs.push({
          level: "danger",
          code: "gained-trait",
          traitName: trait.name,
        });
        needReset = true;
        break;
      }
    }
  }

  if (
    !needReset &&
    input.autoEvolution &&
    input.userEvolutionTarget === "auto"
  ) {
    logs.push(
      input.speciesRace.goals.length > 0
        ? { level: "info", code: "auto-goals", goals: input.speciesRace.goals }
        : { level: "info", code: "auto-goals-none" },
    );
  }

  return { logs, needReset };
}
