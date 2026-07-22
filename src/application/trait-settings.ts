import type { TraitSettingsIntent } from "../domain/trait-settings.ts";
import type {
  TraitSettingsEffects,
  TraitSettingsIntentHandler,
  TraitSettingsWriter,
} from "../ports/trait-settings.ts";

interface TraitSettingsIntentDependencies {
  readonly writer: TraitSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: TraitSettingsEffects;
}

/** Owns Trait settings reset, ordering, and typed browser-intent sequencing. */
export function createTraitSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: TraitSettingsIntentDependencies): TraitSettingsIntentHandler {
  return Object.freeze({
    handle(intent: TraitSettingsIntent): void {
      switch (intent.type) {
        case "reset-trait-settings":
          writer.resetMinorTraits();
          writer.resetMutableTraits();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckboxes();
          return;
        case "clear-evolution-target":
          writer.clearEvolutionTarget();
          writer.persist();
          return;
        case "reorder-minor-traits":
          writer.reorderMinorTraits(intent.traitIds);
          writer.persist();
          return;
        case "reorder-mutable-traits":
          writer.reorderMutableTraits(intent.traitIds);
          writer.persist();
          return;
        case "set-trait-setting":
          writer.setBoolean(intent.settingName, intent.value);
          writer.persist();
          return;
      }
    },
  });
}
