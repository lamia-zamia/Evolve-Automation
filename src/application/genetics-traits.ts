import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planGeneticsMinorTrait,
  type GeneticsMinorTraitUpgradeDecision,
} from "../domain/traits/minor-trait.ts";
import {
  planGeneticsMutation,
  type GeneticsMutationDecision,
} from "../domain/traits/mutation.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { GeneticsMinorTraitReader } from "../ports/minor-trait.ts";
import type { GeneticsMutationReader } from "../ports/mutation.ts";

const GENETICS_TRAITS_SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export interface GeneticsMinorTraitAutomationDependencies {
  readonly reader: GeneticsMinorTraitReader;
  readonly executor: DecisionExecutor<GeneticsMinorTraitUpgradeDecision>;
}

export function runGeneticsMinorTraitAutomation(
  dependencies: GeneticsMinorTraitAutomationDependencies,
): CommandExecutionOutcome {
  const decision = planGeneticsMinorTrait(dependencies.reader.read());
  return decision === null
    ? GENETICS_TRAITS_SUCCEEDED
    : dependencies.executor.execute(decision);
}

export interface GeneticsMutationAutomationDependencies {
  readonly reader: GeneticsMutationReader;
  readonly executor: DecisionExecutor<GeneticsMutationDecision>;
}

export function runGeneticsMutationAutomation(
  dependencies: GeneticsMutationAutomationDependencies,
): CommandExecutionOutcome {
  const decision = planGeneticsMutation(dependencies.reader.read());
  return decision === null
    ? GENETICS_TRAITS_SUCCEEDED
    : dependencies.executor.execute(decision);
}
