import {
  createCapturedTraitAutomation,
  type CapturedTraitAutomationDependencies,
} from "../adapters/evolve/traits/captured-trait-automation.ts";
import {
  runGeneticsMinorTraitAutomation,
  runGeneticsMutationAutomation,
} from "../application/genetics-traits.ts";

export function createCapturedTraitControl(
  dependencies: CapturedTraitAutomationDependencies,
) {
  const captured = createCapturedTraitAutomation(dependencies);
  return Object.freeze({
    autoMinorTrait: () =>
      runGeneticsMinorTraitAutomation({
        reader: captured.minor.reader,
        executor: captured.minor.executor,
      }),
    autoMutateTrait: () =>
      runGeneticsMutationAutomation({
        reader: captured.mutation.reader,
        executor: captured.mutation.executor,
      }),
  });
}
