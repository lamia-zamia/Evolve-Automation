import type { PlanetSettingsIntent } from "../domain/progression/evolution/planet-settings.ts";

/** Receives user intents emitted by the Planet Weighting settings UI. */
export interface PlanetSettingsIntentHandler {
  handle(intent: PlanetSettingsIntent): void;
}

/** Effects needed to reset and persist the Planet Weighting settings section. */
export interface PlanetSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}
