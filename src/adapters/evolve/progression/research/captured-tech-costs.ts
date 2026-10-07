/** Reads Research prices through the native queue path without exposing its synthetic probe id. */

import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { CapturedGameMechanics } from "../../../../ports/captured-game-mechanics.ts";

export interface ResearchTechPriceReader {
  readTechCost(actionId: string): Readonly<Record<string, number>> | undefined;
}

export interface CapturedResearchTechPriceDependencies {
  readonly mechanics: Pick<CapturedGameMechanics, "withTechQueueCostAlias">;
  readonly costs?: GameActionCostReader;
}

export function createCapturedResearchTechPriceReader(
  dependencies: CapturedResearchTechPriceDependencies,
): ResearchTechPriceReader {
  const { mechanics, costs } = dependencies;

  return Object.freeze({
    readTechCost(
      actionId: string,
    ): Readonly<Record<string, number>> | undefined {
      if (costs === undefined) return undefined;
      const price = mechanics.withTechQueueCostAlias(actionId, (probeId) =>
        costs.readCost(probeId),
      );
      return price?.cost;
    },
  });
}
