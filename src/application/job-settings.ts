import type { JobSettingsIntent } from "../domain/job-settings.ts";
import type {
  JobSettingsEffects,
  JobSettingsIntentHandler,
  JobSettingsWriter,
} from "../ports/job-settings.ts";

interface JobSettingsIntentDependencies {
  readonly writer: JobSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: JobSettingsEffects;
}

/** Owns Jobs settings reset and priority mutation sequencing. */
export function createJobSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: JobSettingsIntentDependencies): JobSettingsIntentHandler {
  return Object.freeze({
    handle(intent: JobSettingsIntent): void {
      switch (intent.type) {
        case "reset-job-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckboxes();
          return;
        case "reset-job-priorities":
          writer.resetPriorities();
          writer.persist();
          renderSettingsContent();
          return;
        case "reorder-jobs":
          writer.reorderJobs(intent.jobIds);
          writer.persist();
          return;
      }
    },
  });
}
