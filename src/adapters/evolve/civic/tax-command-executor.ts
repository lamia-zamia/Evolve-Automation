import type {
  AdjustTaxRateCommand,
  CommandEnvelope,
  CommandExecutionOutcome,
} from "../../../domain/commands.ts";
import type { GameCommandExecutor } from "../../../ports/game-command-executor.ts";
import type {
  KeyModifierController,
  TaxControls,
} from "../../../ports/tax-controls.ts";
import {
  requireBoolean,
  requireNumber,
  requireRecord,
} from "../../validation.ts";

export interface TaxCommandExecutorDependencies {
  readonly controls: TaxControls;
  readonly keyModifiers: KeyModifierController;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
}

function failure(
  status: "rejected" | "stale",
  code: string,
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): CommandExecutionOutcome {
  return context === undefined
    ? { status, failure: { code, message } }
    : { status, failure: { code, message, context } };
}

export function createTaxCommandExecutor(
  dependencies: TaxCommandExecutorDependencies,
): GameCommandExecutor<AdjustTaxRateCommand> {
  function execute(
    envelope: CommandEnvelope<AdjustTaxRateCommand>,
  ): CommandExecutionOutcome {
    const game = requireRecord(dependencies.getGame(), "game");
    const global = requireRecord(game["global"], "game.global");
    const civic = requireRecord(global["civic"], "game.global.civic");
    const taxes = requireRecord(civic["taxes"], "game.global.civic.taxes");
    const currentRate = requireNumber(
      taxes["tax_rate"],
      "game.global.civic.taxes.tax_rate",
    );
    if (currentRate !== envelope.command.expectedRate) {
      return failure("stale", "stale-tax-rate", "tax rate changed", {
        expected: envelope.command.expectedRate,
        actual: currentRate,
      });
    }
    if (!requireBoolean(taxes["display"], "game.global.civic.taxes.display")) {
      return failure("stale", "taxes-hidden", "tax controls became locked");
    }
    if (!dependencies.controls.isAvailable()) {
      return failure(
        "stale",
        "tax-controls-unavailable",
        "tax controls became unavailable",
      );
    }

    const resources = requireRecord(dependencies.getResources(), "resources");
    const morale = requireRecord(resources["Morale"], "resources.Morale");
    if (
      requireBoolean(morale["incomeAdusted"], "resources.Morale.incomeAdusted")
    ) {
      return failure(
        "stale",
        "morale-already-adjusted",
        "morale was already adjusted",
      );
    }

    for (const batch of envelope.command.batches) {
      dependencies.keyModifiers.clear();
      for (const operation of batch.operations) {
        if (!Number.isSafeInteger(operation.count) || operation.count < 0) {
          return failure(
            "rejected",
            "invalid-tax-adjustment-count",
            "tax adjustment count must be a non-negative integer",
          );
        }
        for (let index = 0; index < operation.count; index += 1) {
          if (!dependencies.controls.adjust(operation.direction)) {
            return failure(
              "stale",
              "tax-controls-unavailable",
              "tax controls became unavailable",
            );
          }
        }
      }
      morale["incomeAdusted"] = true;
    }
    return { status: "succeeded" };
  }

  return Object.freeze({ execute });
}
