/** Reads Research prices through the native queue path without exposing its synthetic probe id. */

import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { CapturedGameMechanics } from "../../../../ports/captured-game-mechanics.ts";
import {
  createCountTally,
  createPhaseMeasure,
  type PhaseTimingSink,
} from "../../../../utils/performance.ts";

export interface ResearchTechPriceReader {
  readTechCost(actionId: string): Readonly<Record<string, number>> | undefined;
  readTechCosts(
    actionIds: readonly string[],
  ): readonly (Readonly<Record<string, number>> | undefined)[] | undefined;
}

export interface CapturedResearchTechPriceDependencies {
  readonly mechanics: Pick<CapturedGameMechanics, "withTechQueueCostAliases">;
  readonly costs?: GameActionCostReader;
  readonly diagnostics?: PhaseTimingSink | undefined;
}

export function createCapturedResearchTechPriceReader(
  dependencies: CapturedResearchTechPriceDependencies,
): ResearchTechPriceReader {
  const { mechanics, costs } = dependencies;

  function readTechCosts(
    actionIds: readonly string[],
  ): readonly (Readonly<Record<string, number>> | undefined)[] | undefined {
    if (costs === undefined) return undefined;
    if (actionIds.length === 0) return Object.freeze([]);
    const tally = createCountTally(dependencies.diagnostics);
    const measure = createPhaseMeasure(dependencies.diagnostics);
    tally.count("research.native-price-reads", actionIds.length);
    const prices = measure("research.native-price-probe", () =>
      mechanics.withTechQueueCostAliases(actionIds, (_actionId, probeId) =>
        costs.readCost(probeId),
      ),
    );
    tally.count("research.registry.validations", 2);
    return prices?.map((result) => result?.cost);
  }

  return Object.freeze({
    readTechCost(
      actionId: string,
    ): Readonly<Record<string, number>> | undefined {
      return readTechCosts([actionId])?.[0];
    },
    readTechCosts,
  });
}
