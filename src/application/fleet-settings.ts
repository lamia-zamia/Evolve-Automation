import type { FleetSettingsIntent } from "../domain/fleet-settings.ts";
import type {
  FleetSettingsEffects,
  FleetSettingsIntentHandler,
  FleetSettingsWriter,
} from "../ports/fleet-settings.ts";

interface FleetSettingsIntentDependencies {
  readonly writer: FleetSettingsWriter;
  readonly render: (secondaryPrefix: string) => void;
  readonly effects: FleetSettingsEffects;
}

export function createFleetSettingsIntentHandler({
  writer,
  render,
  effects,
}: FleetSettingsIntentDependencies): FleetSettingsIntentHandler {
  return Object.freeze({
    handle(intent: FleetSettingsIntent): void {
      switch (intent.type) {
        case "reset-fleet-settings":
          writer.resetToDefaults();
          writer.persist();
          render(intent.secondaryPrefix);
          effects.resetCheckbox();
          return;
        case "reorder-andromeda-regions":
          writer.reorderAndromeda(intent.regionIds);
          writer.persist();
          if (intent.secondaryPrefix !== "") render("");
          return;
      }
    },
  });
}
