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
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { DEMAND_RESERVATION_TRUEPATH_AI_ACTIONS } from "./captured-resource-demand.ts";
import { CAPTURED_FOREIGN_CONTROL } from "../../combat/captured-foreign-state.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export interface CapturedDemandPrerequisitesDependencies {
  readonly root: unknown;
  readonly settings: Record<PropertyKey, unknown>;
  readonly controls: GameControlRegistry;
  /** Draws the civics tab, which binds the `foreign` panel control. */
  readonly ensureCivicControls: () => void;
  /** Sweeps the civilization build controls the AI target is priced from. */
  readonly ensureBuildControls: () => void;
}

/**
 * True while the spy-purchase reservation has something to reserve. This is the cheap,
 * control-free half of the demand reader's gate: unification researched and automation
 * willing. Whether a visible Purchase-policy government actually names a price is the
 * reader's own question once the control exists.
 */
function wantsSpyPurchaseReservation(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  controls: GameControlRegistry,
): boolean {
  if (settings["autoFight"] !== true) return false;
  const tech = readProperty(root, "tech");
  if (!isRecord(tech) || readProperty(tech, "unify") !== 1) return false;
  return controls.resolve(CAPTURED_FOREIGN_CONTROL) === undefined;
}

/**
 * True while the True Path AI reservation is in its hardware stage but some competing
 * target's control is not captured yet. All four prices feed the ranking, so one missing
 * control is enough to hold the discovery back: without it the reader stands down.
 */
function wantsTruepathAiReservation(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  controls: GameControlRegistry,
): boolean {
  const race = readProperty(root, "race");
  if (!isRecord(race) || readProperty(race, "truepath") !== true) return false;
  if (settings["prestigeType"] !== "apocalypse") return false;
  const tech = readProperty(root, "tech");
  const aiCoreLevel = isRecord(tech)
    ? finite(readProperty(tech, "titan_ai_core"))
    : undefined;
  if (aiCoreLevel === undefined || aiCoreLevel < 3) return false;
  return Object.values(DEMAND_RESERVATION_TRUEPATH_AI_ACTIONS).some(
    (actionId) => controls.resolve(actionId) === undefined,
  );
}

export function ensureDemandPrerequisiteControls(
  dependencies: CapturedDemandPrerequisitesDependencies,
): void {
  if (
    wantsSpyPurchaseReservation(
      dependencies.root,
      dependencies.settings,
      dependencies.controls,
    )
  ) {
    dependencies.ensureCivicControls();
  }
  if (
    wantsTruepathAiReservation(
      dependencies.root,
      dependencies.settings,
      dependencies.controls,
    )
  ) {
    dependencies.ensureBuildControls();
  }
}
