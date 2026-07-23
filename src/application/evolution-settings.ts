import type { EvolutionSettingsIntent } from "../domain/progression/evolution/evolution-settings.ts";
import type {
  EvolutionSettingsEffects,
  EvolutionSettingsIntentHandler,
  EvolutionSettingsWriter,
} from "../ports/evolution-settings.ts";
interface EvolutionSettingsIntentDependencies {
  readonly writer: EvolutionSettingsWriter;
  readonly render: () => void;
  readonly effects: EvolutionSettingsEffects;
}
export function createEvolutionSettingsIntentHandler({
  writer,
  render,
  effects,
}: EvolutionSettingsIntentDependencies): EvolutionSettingsIntentHandler {
  return Object.freeze({
    handle(intent: EvolutionSettingsIntent): void {
      switch (intent.type) {
        case "reset-evolution-settings":
          writer.resetToDefaults();
          writer.persist();
          render();
          effects.resetCheckbox();
          return;
        case "set-evolution-target":
          writer.setTarget(intent.value);
          writer.persist();
          render();
          return;
        case "add-evolution":
          writer.addCurrent(intent.prestigeType);
          writer.persist();
          render();
          return;
        case "remove-evolution":
          writer.remove(intent.index);
          writer.persist();
          render();
          return;
        case "edit-evolution":
          writer.edit(intent.index, intent.json);
          writer.persist();
          render();
          return;
        case "reorder-evolutions":
          writer.reorder(intent.indexes);
          writer.persist();
          return;
      }
    },
  });
}
