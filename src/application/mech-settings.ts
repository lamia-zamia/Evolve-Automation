import type { MechSettingsIntent } from "../domain/mech-settings.ts";
import type {
  MechSettingsEffects,
  MechSettingsIntentHandler,
  MechSettingsWriter,
} from "../ports/mech-settings.ts";
interface MechSettingsIntentDependencies {
  readonly writer: MechSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: MechSettingsEffects;
}
export function createMechSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: MechSettingsIntentDependencies): MechSettingsIntentHandler {
  return Object.freeze({
    handle(intent: MechSettingsIntent): void {
      if (intent.type !== "reset-mech-settings") return;
      writer.resetToDefaults();
      writer.persist();
      renderSettingsContent();
      effects.resetCheckboxes();
      effects.removeMechInfo();
    },
  });
}
