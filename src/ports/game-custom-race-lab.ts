import type {
  CustomRaceDesign,
  CustomRaceTextField,
} from "../domain/progression/prestige/custom-race.ts";
import type { CelestialLabMode } from "../domain/progression/prestige/prestige.ts";

/** DeadSpace's captured Vue control and panel coordinates, shared by its callers. */
export const CUSTOM_RACE_LAB_CONTROL_ID = "celestialLab";
export const CUSTOM_RACE_LAB_PANEL_SELECTOR = "#celestialLab";

/** Opaque identity for one mounted lab on one captured game root. */
export type CustomRaceLabSession = Readonly<{ readonly identity: object }>;

export interface CustomRaceLabSnapshot {
  readonly session: CustomRaceLabSession;
  readonly draft: CustomRaceDesign;
  readonly availableTraits: readonly string[];
  readonly availableGenera: readonly string[];
  readonly hybridLab: boolean;
  readonly savedCustomRaceExists: boolean;
  readonly canSubmit: boolean;
  /** The game's own `g.genes`, recalculated by `calcGenomeScore` in `space.js`. */
  readonly genes: number;
  readonly recalculation: "idle" | "pending" | "settled" | "failed";
}

export type CustomRaceLabMutationResult =
  | { readonly status: "applied" }
  | {
      readonly status: "stale" | "unavailable" | "rejected";
      readonly reason: string;
    };

export type CustomRaceSavedSlot = "race0" | "race1";

/**
 * Narrow captured capability for the mounted game-owned lab. It never exposes the Vue view, live
 * root, DOM element, trait definition catalog, or the lab's closure variables.
 */
export interface GameCustomRaceLabPort {
  read(mode: CelestialLabMode): CustomRaceLabSnapshot | undefined;
  applyDesign(
    session: CustomRaceLabSession,
    design: CustomRaceDesign,
  ): CustomRaceLabMutationResult;
  submit(
    session: CustomRaceLabSession,
    mode: CelestialLabMode,
  ): CustomRaceLabMutationResult;
  readSavedRaceJson(slot: CustomRaceSavedSlot): string | undefined;
}

/** Restricts text keys to the fields the game stores on its custom race record. */
export type CustomRaceLabText = Readonly<
  Partial<Record<CustomRaceTextField, string>>
>;
