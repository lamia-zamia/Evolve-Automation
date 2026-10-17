import type {
  EvolutionCellCounts,
  EvolutionLandingGate,
  EvolutionGenusSelectionInput,
  EvolutionTreeAction,
  ImitationInput,
  TargetSelectionInput,
} from "../domain/progression/evolution/evolution.ts";
import type { EvolutionResultInput } from "../domain/progression/evolution/evolution-result.ts";

export type EvolutionResultSample =
  | { readonly status: "ready"; readonly input: Readonly<EvolutionResultInput> }
  | { readonly status: "unavailable"; readonly reason: string };

export interface EvolutionCostsSample {
  readonly maxRna: number;
  readonly maxDna: number;
  readonly rnaCurrent: number;
  readonly rnaMax: number;
  readonly rnaDisplay: boolean;
  readonly dnaCurrent: number;
  readonly dnaMax: number;
  readonly dnaDisplay: boolean;
}

/**
 * Phased reads for one autoEvolution cycle. Each sampler reads live game state
 * at the moment the legacy factory performed the same read, so samples taken
 * after the target/challenge/resource executors observe their effects.
 */
export interface EvolutionReader {
  sampleSpecies(): string;
  sampleLandingGate(): EvolutionLandingGate;
  /** Native condition-hidden challenge rows are not offers; a visible row without a current binding is a redraw gap. */
  sampleChallengeActionAvailability(
    id: string,
  ): "not-offered" | "stale" | "available";
  hasStoredTarget(): boolean;
  storedTargetId(): string | null;
  /** Sampled after loadQueuedSettings has reloaded the effective settings. */
  sampleTargetSelection(): TargetSelectionInput;
  /** Captures the post-evolution result only after the lifecycle marks one pending. */
  sampleEvolutionResult(): EvolutionResultSample;
  /** Live game.global.race[trait]; 1 marks the challenge already active. */
  sampleRaceTrait(trait: string): number;
  sampleCosts(targetId: string): EvolutionCostsSample;
  sampleEvolutionTree(targetId: string): readonly EvolutionTreeAction[];
  sampleEvolutionGenusSelection(targetId: string): EvolutionGenusSelectionInput;
  sampleCells(): EvolutionCellCounts;
  sampleImitation(): ImitationInput;
  /** settings.challenge_<id> for each group id, in one read. */
  sampleChallengeEnabled(
    groupIds: readonly string[],
  ): Readonly<Record<string, boolean>>;
}

export interface EvolutionCycleTrace {
  readonly stage: string;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ResourceAccumulationCommand {
  readonly rnaForDna: number;
  readonly dnaForEvolution: number;
  readonly rnaForEvolution: number;
  readonly newRna: number;
  readonly newDna: number;
}

export interface EvolutionExecutor {
  loadQueuedSettings(): void;
  /** Store the chosen target and log the attempt. */
  commitTarget(id: string, name: string): void;
  /** Click an evolution action (challenge, tree node, or cell); returns success. */
  clickEvolution(id: string): boolean | EvolutionActionOutcome;
  accumulateResources(
    command: Readonly<ResourceAccumulationCommand>,
  ): void | ResourceAccumulationOutcome;
  clickImitation(imitateRace: string): boolean | EvolutionActionOutcome;
  logImitationUnavailable(imitateRace: string): void;
  logImitationNoRace(): void;
}

export type EvolutionActionOutcome =
  | { readonly status: "unavailable" }
  | { readonly status: "failed"; readonly detail: string }
  | { readonly status: "root-replaced" }
  | { readonly status: "invoked"; readonly stateChanged: boolean };

export type ResourceAccumulationOutcome = "complete" | "deferred" | "failed";
