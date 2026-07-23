import type { ProjectSettingsIntent } from "../domain/progression/research/project-settings.ts";

/** Receives user intents emitted by the A.R.P.A. settings UI. */
export interface ProjectSettingsIntentHandler {
  handle(intent: ProjectSettingsIntent): void;
}

/** Writes A.R.P.A. settings and preserves the legacy reorder sequence. */
export interface ProjectSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
  reorderProjects(projectIds: readonly string[]): void;
}

export interface ProjectSettingsEffects {
  resetCheckbox(): void;
}
