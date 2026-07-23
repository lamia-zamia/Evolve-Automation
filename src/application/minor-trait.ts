import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planMinorTraitPurchase,
  summarizeMinorTraits,
  type MinorTraitPurchaseDecision,
} from "../domain/traits/minor-trait.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { MinorTraitReader } from "../ports/minor-trait.ts";

export interface MinorTraitAutomationDependencies {
  readonly reader: MinorTraitReader;
  readonly executor: DecisionExecutor<MinorTraitPurchaseDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

function staleCandidate(
  index: number,
  expectedTraitName: string,
  actualTraitName: string | null,
): CommandExecutionOutcome {
  return {
    status: "stale",
    failure: {
      code: "stale-minor-trait-candidate",
      message: "managed minor-trait list changed",
      context: { index, expectedTraitName, actualTraitName },
    },
  };
}

/**
 * Preserves the legacy two-pass algorithm: fixed totals are sampled first,
 * then each candidate cost and Genes balance are resampled after every earlier
 * purchase before the pure policy decides the next command.
 */
export function runMinorTraitAutomation(
  dependencies: MinorTraitAutomationDependencies,
): CommandExecutionOutcome {
  const summary = summarizeMinorTraits(dependencies.reader.readSummary());
  if (summary === null) {
    return SUCCEEDED;
  }

  for (let index = 0; index < summary.traits.length; index++) {
    const expected = summary.traits[index];
    if (expected === undefined) {
      continue;
    }
    const candidate = dependencies.reader.readCandidate(index);
    if (candidate === null || candidate.traitName !== expected.traitName) {
      return staleCandidate(
        index,
        expected.traitName,
        candidate?.traitName ?? null,
      );
    }
    const decision = planMinorTraitPurchase(summary, candidate);
    if (decision === null) {
      continue;
    }
    const outcome = dependencies.executor.execute(decision);
    if (outcome.status !== "succeeded") {
      return outcome;
    }
  }
  return SUCCEEDED;
}
