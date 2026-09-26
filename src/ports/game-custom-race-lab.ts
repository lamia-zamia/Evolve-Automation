import type {
  CustomRaceDesign,
  CustomRacePresetRequest,
} from "../domain/progression/prestige/custom-race.ts";
import {
  CELESTIAL_LAB_CONTROL_ID,
  CELESTIAL_LAB_PANEL_SELECTOR,
  type CelestialLabSession,
} from "./game-celestial-lab.ts";

export const CUSTOM_RACE_LAB_CONTROL_ID = CELESTIAL_LAB_CONTROL_ID;
export const CUSTOM_RACE_LAB_PANEL_SELECTOR = CELESTIAL_LAB_PANEL_SELECTOR;
export const CUSTOM_RACE_LAB_STRAND_ID = "#traitSlots .labStrand";
export const CUSTOM_RACE_FILE_INPUT_ID = "customFile";

export type CustomRaceLabSession = CelestialLabSession;

export interface CustomRaceLabSnapshot {
  readonly session: CustomRaceLabSession;
  readonly draft: CustomRaceDesign;
  readonly hybridLab: boolean;
  readonly savedCustomRaceExists: boolean;
  /** True when the full current-format saved race matches the live draft. */
  readonly savedCustomRaceReady: boolean;
  /** Saved race JSON from the slot mounted by this native lab, if present. */
  readonly savedCustomRaceJson?: string;
  readonly canSubmit: boolean;
  readonly recalculation: "idle" | "pending" | "settled" | "failed" | "stale";
  /** Identity of a preset whose native import and slot redraw completed in this session. */
  readonly appliedPresetIdentity?: string;
}

export type CustomRaceLabMutationResult =
  | { readonly status: "pending" | "requested" }
  | {
      readonly status: "stale" | "unavailable" | "rejected";
      readonly reason: string;
    };

export type CustomRaceLabSubmitResult =
  | { readonly status: "requested" }
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
  read(requestIdentity: string): CustomRaceLabSnapshot | undefined;
  applyDesign(
    session: CustomRaceLabSession,
    request: CustomRacePresetRequest,
    requestIdentity: string,
  ): CustomRaceLabMutationResult;
  submit(
    session: CustomRaceLabSession,
    requestIdentity: string,
  ): CustomRaceLabSubmitResult;
  /** Reads the saved race selected by the currently mounted lab's native genome. */
  readCurrentSavedRaceJson(): string | undefined;
  readSavedRaceJson(slot: CustomRaceSavedSlot): string | undefined;
}
