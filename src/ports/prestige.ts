import type {
  PrestigeCommand,
  PrestigeInput,
} from "../domain/progression/prestige/prestige.ts";

/**
 * Samples the selected prestige branch once per cycle. Eligibility for the
 * gated branches is delegated to the already-migrated prestige-eligibility
 * decision surface; the reader only adds the branch-specific act facts and the
 * current reset goal.
 */
export interface PrestigeReader {
  samplePrestige(): PrestigeInput;
}

export interface PrestigeExecutor {
  execute(command: PrestigeCommand): void;
}
