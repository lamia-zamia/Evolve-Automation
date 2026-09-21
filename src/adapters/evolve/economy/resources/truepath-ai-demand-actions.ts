/**
 * Captured action id for each True Path AI hardware target. One owner for these upstream
 * coordinates, read by the demand reader (which prices the planned target) and the demand
 * prerequisite phase (which checks the competitors are captured):
 *
 * - Titan Decoder: `space-decoder` (DeadSpace `truepath.js`, `reqs: { titan: 8 }`)
 * - Titan AI Colonist: `space-ai_colonist` (`reqs: { titan_ai_core: 3 }`)
 * - Eris Shock Trooper: `space-shock_trooper` (`reqs: { eris: 3 }`)
 * - Eris Tank: `space-tank` (`reqs: { eris: 4 }`)
 */

import type { TruepathAiBuildingTarget } from "../../../../domain/progression/truepath/ai-apocalypse.ts";

export const DEMAND_RESERVATION_TRUEPATH_AI_ACTIONS: Readonly<
  Record<TruepathAiBuildingTarget, string>
> = Object.freeze({
  TitanDecoder: "space-decoder",
  TitanAIColonist: "space-ai_colonist",
  ErisTrooper: "space-shock_trooper",
  ErisTank: "space-tank",
});
