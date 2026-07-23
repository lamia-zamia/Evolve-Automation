import type { JobSettingsIntent } from "../domain/civic/job-settings.ts";

/** Receives user intents emitted by the Jobs settings UI. */
export interface JobSettingsIntentHandler {
  handle(intent: JobSettingsIntent): void;
}

/** Writes Jobs settings and priority state through the Evolve adapter. */
export interface JobSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
  resetPriorities(): void;
  reorderJobs(jobIds: readonly string[]): void;
}

export interface JobSettingsEffects {
  resetCheckboxes(): void;
}
