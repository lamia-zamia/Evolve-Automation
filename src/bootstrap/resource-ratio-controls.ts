import {
  createResourceRatioCommandExecutors,
  readExtractorRatioInput,
  readMineRatioInput,
  readQuarryRatioInput,
} from "../adapters/evolve/economy/resources/resource-ratios.ts";
import {
  planExtractorRatios,
  planMineRatio,
  planQuarryRatio,
} from "../domain/economy/resources/resource-ratios.ts";

// Composition seam for the resource-ratio slice: quarry, mine, and extractor
// share one dependency object and one set of command executors, built once here.
// Each control reads, plans, and (for quarry/mine) applies only a non-null
// adjustment — exactly as the runtime closure did.
export function createResourceRatioControls(
  dependencies: Parameters<typeof readQuarryRatioInput>[0],
) {
  const executors = createResourceRatioCommandExecutors(dependencies);
  return Object.freeze({
    autoQuarry: () => {
      const adjustment = planQuarryRatio(readQuarryRatioInput(dependencies));
      if (adjustment !== null) {
        executors.quarry.execute(adjustment);
      }
    },
    autoMine: () => {
      const adjustment = planMineRatio(readMineRatioInput(dependencies));
      if (adjustment !== null) {
        executors.mine.execute(adjustment);
      }
    },
    autoExtractor: () =>
      executors.extractor.execute(
        planExtractorRatios(readExtractorRatioInput(dependencies)),
      ),
  });
}
