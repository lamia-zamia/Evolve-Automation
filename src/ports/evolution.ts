import type {
  EvolutionCellCounts,
  EvolutionLandingGate,
  EvolutionTreeAction,
  ImitationInput,
  TargetSelectionInput,
} from "../domain/progression/evolution/evolution.ts";

export interface EvolutionCostsSample {
  readonly maxRna: number;
  readonly maxDna: number;
  readonly rnaCurrent: number;
  readonly rnaMax: number;
  readonly dnaCurrent: number;
  readonly dnaMax: number;
}

/**
 * Phased reads for one autoEvolution cycle. Each sampler reads live game state
 * at the moment the legacy factory performed the same read, so samples taken
 * after the target/challenge/resource executors observe their effects.
 */
export interface EvolutionReader {
  sampleSpecies(): string;
  sampleLandingGate(): EvolutionLandingGate;
  hasStoredTarget(): boolean;
  storedTargetId(): string | null;
  /** Sampled after loadQueuedSettings has reloaded the effective settings. */
  sampleTargetSelection(): TargetSelectionInput;
  /** Live game.global.race[trait]; 1 marks the challenge already active. */
  sampleRaceTrait(trait: string): number;
  sampleCosts(targetId: string): EvolutionCostsSample;
  sampleEvolutionTree(targetId: string): readonly EvolutionTreeAction[];
  sampleCells(): EvolutionCellCounts;
  sampleImitation(): ImitationInput;
  /** settings.challenge_<id> for each group id, in one read. */
  sampleChallengeEnabled(
    groupIds: readonly string[],
  ): Readonly<Record<string, boolean>>;
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
  clickEvolution(id: string): boolean;
  accumulateResources(command: Readonly<ResourceAccumulationCommand>): void;
  clickImitation(imitateRace: string): boolean;
  logImitationUnavailable(imitateRace: string): void;
  logImitationNoRace(): void;
}
