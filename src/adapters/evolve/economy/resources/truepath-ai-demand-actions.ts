/**
 * Captured action id and unlock gate for each True Path AI hardware target. One owner for
 * these upstream coordinates, read by the demand reader (which prices the planned target)
 * and the demand prerequisite phase (which checks the competitors are captured):
 *
 * - Titan Decoder: `space-decoder` (DeadSpace `truepath.js`, `reqs: { titan: 8 }`)
 * - Titan AI Colonist: `space-ai_colonist` (`reqs: { titan_ai_core: 3 }`)
 * - Eris Shock Trooper: `space-shock_trooper` (`reqs: { eris: 3 }`)
 * - Eris Tank: `space-tank` (`reqs: { eris: 4 }`)
 *
 * Eligibility comes from the tech bag alone, so both readers share one definition of which
 * competitors can exist. A target below its gate draws no control and is ineligible rather
 * than cheapest by absence; inferring that from control presence instead would mistake an
 * undiscovered panel for a locked one.
 */

import type { TruepathAiBuildingTarget } from "../../../../domain/progression/truepath/ai-apocalypse.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export const DEMAND_RESERVATION_TRUEPATH_AI_ACTIONS: Readonly<
  Record<TruepathAiBuildingTarget, string>
> = Object.freeze({
  TitanDecoder: "space-decoder",
  TitanAIColonist: "space-ai_colonist",
  ErisTrooper: "space-shock_trooper",
  ErisTank: "space-tank",
});

const TRUEPATH_AI_UNLOCK_ORDER: readonly TruepathAiBuildingTarget[] =
  Object.freeze(["TitanDecoder", "TitanAIColonist", "ErisTrooper", "ErisTank"]);

const TRUEPATH_AI_UNLOCKS: Readonly<
  Record<
    TruepathAiBuildingTarget,
    { readonly tech: string; readonly level: number }
  >
> = Object.freeze({
  TitanDecoder: Object.freeze({ tech: "titan", level: 8 }),
  TitanAIColonist: Object.freeze({ tech: "titan_ai_core", level: 3 }),
  ErisTrooper: Object.freeze({ tech: "eris", level: 3 }),
  ErisTank: Object.freeze({ tech: "eris", level: 4 }),
});

/** The AI hardware targets the tech bag has unlocked, in ranking order. */
export function readEligibleTruepathAiTargets(
  root: unknown,
): readonly TruepathAiBuildingTarget[] {
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return Object.freeze([]);
  return Object.freeze(
    TRUEPATH_AI_UNLOCK_ORDER.filter((target) => {
      const unlock = TRUEPATH_AI_UNLOCKS[target];
      return (finite(readProperty(tech, unlock.tech)) ?? 0) >= unlock.level;
    }),
  );
}
