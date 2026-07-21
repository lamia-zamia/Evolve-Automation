import type { PlanetSettingsIntent } from "../domain/planet-settings.ts";
import type {
  PlanetSettingsIntentHandler,
  PlanetSettingsWriter,
} from "../ports/planet-settings.ts";

interface PlanetSettingsIntentDependencies {
  readonly writer: PlanetSettingsWriter;
  readonly renderSettingsContent: () => void;
}

/** Owns the Planet Weighting settings reset sequence outside the browser adapter. */
export function createPlanetSettingsIntentHandler({
  writer,
  renderSettingsContent,
}: PlanetSettingsIntentDependencies): PlanetSettingsIntentHandler {
  return Object.freeze({
    handle(intent: PlanetSettingsIntent): void {
      switch (intent.type) {
        case "reset-planet-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          return;
      }
    },
  });
}
