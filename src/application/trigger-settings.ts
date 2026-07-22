import type { TriggerSettingsIntent } from "../domain/trigger-settings.ts";
import type {
  TriggerSettingsEffects,
  TriggerSettingsIntentHandler,
  TriggerSettingsWriter,
} from "../ports/trigger-settings.ts";

interface TriggerSettingsIntentDependencies {
  readonly writer: TriggerSettingsWriter;
  readonly render: () => void;
  readonly effects: TriggerSettingsEffects;
}

/** Owns Trigger settings mutations and persistence sequencing. */
export function createTriggerSettingsIntentHandler({
  writer,
  render,
  effects,
}: TriggerSettingsIntentDependencies): TriggerSettingsIntentHandler {
  return Object.freeze({
    handle(intent: TriggerSettingsIntent): void {
      switch (intent.type) {
        case "reset-trigger-settings":
          writer.resetToDefaults();
          writer.persist();
          render();
          effects.resetCheckbox();
          return;
        case "add-trigger":
          writer.addDefault();
          writer.persist();
          render();
          return;
        case "update-trigger":
          writer.update(intent.seq, intent.field, intent.value);
          writer.persist();
          render();
          return;
        case "remove-trigger":
          writer.remove(intent.seq);
          writer.persist();
          render();
          return;
        case "duplicate-trigger":
          writer.duplicate(intent.seq);
          writer.persist();
          render();
          return;
        case "evalize-trigger":
          writer.evalize(intent.seq);
          return;
        case "reorder-triggers":
          writer.reorder(intent.seqs);
          writer.persist();
          return;
      }
    },
  });
}
