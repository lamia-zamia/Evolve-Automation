/**
 * Demand-prerequisite discovery for the captured cycle.
 *
 * Two demand reservations need captured controls that are otherwise discovered later in the
 * cycle: the spy-purchase Money reserve needs the `foreign` panel control, and the True Path
 * AI hardware target needs the civilization build controls and their costs. The cycle caches
 * its demand sample on first use, so a market or storage phase that samples before that
 * discovery would spend a cycle acting on a sample that omits the reservation. This phase
 * runs before any demand consumer and performs only the discoveries whose reservations the
 * current root and settings can actually create; each discovery is itself cached or
 * rate-limited, so a cycle that needs nothing pays a few root reads.
 *
 * Attempting a discovery is not establishing the capture: a failed or suppressed draw
 * leaves the control absent, and the demand sample must not then report the resource as
 * free. Each prerequisite therefore reports `ready` (capture established, the reader's
 * answer is exact), `not-needed` (the stage gate fails, nothing could be reserved), or
 * `unavailable` (a reservation could exist but its capture is not established). The
 * demand model fails closed on `unavailable` by holding Money rather than spending it.
 * A control still absent after a drawable sweep is a locked competitor rather than a
 * failed capture — the sweep draws every shown panel, so what never draws was never
 * offered — and reports `ready`, letting the reader rank the captured subset.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { DEMAND_RESERVATION_TRUEPATH_AI_ACTIONS } from "./truepath-ai-demand-actions.ts";
import { CAPTURED_FOREIGN_CONTROL } from "../../combat/captured-foreign-state.ts";
import { MAIN_TAB_CONTROL } from "../../captured-tab-discovery.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export type DemandPrerequisiteStatus = "ready" | "not-needed" | "unavailable";

export interface DemandPrerequisiteReport {
  readonly spy: DemandPrerequisiteStatus;
  readonly ai: DemandPrerequisiteStatus;
}

export interface CapturedDemandPrerequisitesDependencies {
  readonly root: unknown;
  readonly settings: Record<PropertyKey, unknown>;
  readonly controls: GameControlRegistry;
  /** Draws the civics tab, which binds the `foreign` panel control. */
  readonly ensureCivicControls: () => void;
  /** Sweeps the civilization build controls the AI target is priced from. */
  readonly ensureBuildControls: () => void;
}

/** The cheap, control-free half of the spy reader's gate: unification researched. */
function spyReservationWanted(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
): boolean {
  if (settings["autoFight"] !== true) return false;
  const tech = readProperty(root, "tech");
  return isRecord(tech) && readProperty(tech, "unify") === 1;
}

/** The cheap, control-free half of the AI reader's gate: the hardware stage is active. */
function truepathAiReservationWanted(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
): boolean {
  const race = readProperty(root, "race");
  if (!isRecord(race) || readProperty(race, "truepath") !== true) return false;
  if (settings["prestigeType"] !== "apocalypse") return false;
  const tech = readProperty(root, "tech");
  const aiCoreLevel = isRecord(tech)
    ? finite(readProperty(tech, "titan_ai_core"))
    : undefined;
  return aiCoreLevel !== undefined && aiCoreLevel >= 3;
}

function spyPrerequisiteStatus(
  dependencies: CapturedDemandPrerequisitesDependencies,
): DemandPrerequisiteStatus {
  if (!spyReservationWanted(dependencies.root, dependencies.settings)) {
    return "not-needed";
  }
  if (dependencies.controls.resolve(CAPTURED_FOREIGN_CONTROL) !== undefined) {
    return "ready";
  }
  dependencies.ensureCivicControls();
  return dependencies.controls.resolve(CAPTURED_FOREIGN_CONTROL) !== undefined
    ? "ready"
    : "unavailable";
}

function aiPrerequisiteStatus(
  dependencies: CapturedDemandPrerequisitesDependencies,
): DemandPrerequisiteStatus {
  if (!truepathAiReservationWanted(dependencies.root, dependencies.settings)) {
    return "not-needed";
  }
  const missing = (): boolean =>
    Object.values(DEMAND_RESERVATION_TRUEPATH_AI_ACTIONS).some(
      (actionId) => dependencies.controls.resolve(actionId) === undefined,
    );
  if (!missing()) return "ready";
  dependencies.ensureBuildControls();
  if (!missing()) return "ready";
  // Still missing after the sweep. A locked competitor (Shock Trooper below eris 3, Tank
  // below eris 4) never draws, so its absence is the game answer and the reader ranks the
  // captured subset. But without the main-tab control no draw could run at all, so absence
  // proves nothing and the reader must fail closed instead.
  return dependencies.controls.resolve(MAIN_TAB_CONTROL) !== undefined
    ? "ready"
    : "unavailable";
}

export function ensureDemandPrerequisiteControls(
  dependencies: CapturedDemandPrerequisitesDependencies,
): DemandPrerequisiteReport {
  const spy = spyPrerequisiteStatus(dependencies);
  const ai = aiPrerequisiteStatus(dependencies);
  return Object.freeze({ spy, ai });
}
