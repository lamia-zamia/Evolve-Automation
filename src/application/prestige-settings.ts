import type { PrestigeSettingsIntent } from "../domain/progression/prestige/prestige-settings.ts";
import type {
  PrestigeSettingsEffects,
  PrestigeSettingsIntentHandler,
  PrestigeSettingsWriter,
} from "../ports/prestige-settings.ts";

interface PrestigeSettingsIntentDependencies {
  readonly writer: PrestigeSettingsWriter;
  readonly reader: { getConfirmationText(value: string): string };
  readonly render: (secondaryPrefix: string) => void;
  readonly effects: PrestigeSettingsEffects;
}

export function createPrestigeSettingsIntentHandler({
  writer,
  reader,
  render,
  effects,
}: PrestigeSettingsIntentDependencies): PrestigeSettingsIntentHandler {
  return Object.freeze({
    handle(intent: PrestigeSettingsIntent): void {
      if (intent.type === "reset-prestige-settings") {
        writer.resetToDefaults();
        writer.persist();
        render(intent.secondaryPrefix);
        return;
      }
      const message = reader.getConfirmationText(intent.value);
      if (
        message !== "" &&
        !effects.confirm(
          `${message} You may prestige immediately. Are you sure you want to toggle this prestige?`,
        )
      ) {
        writer.setPrestigeType("none");
      } else {
        writer.setPrestigeType(intent.value);
      }
      writer.setGoalStandard();
      writer.persist();
      render("");
    },
  });
}
