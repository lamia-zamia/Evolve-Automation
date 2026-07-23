import type { ProjectSettingsIntent } from "../domain/progression/research/project-settings.ts";
import type {
  ProjectSettingsEffects,
  ProjectSettingsIntentHandler,
  ProjectSettingsWriter,
} from "../ports/project-settings.ts";

interface ProjectSettingsIntentDependencies {
  readonly writer: ProjectSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: ProjectSettingsEffects;
}

/** Owns A.R.P.A. reset and reorder sequencing outside the browser adapter. */
export function createProjectSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: ProjectSettingsIntentDependencies): ProjectSettingsIntentHandler {
  return Object.freeze({
    handle(intent: ProjectSettingsIntent): void {
      switch (intent.type) {
        case "reset-project-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckbox();
          return;
        case "reorder-projects":
          writer.reorderProjects(intent.projectIds);
          writer.persist();
          return;
      }
    },
  });
}
