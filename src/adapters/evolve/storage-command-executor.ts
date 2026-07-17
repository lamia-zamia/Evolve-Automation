import type {
  CommandEnvelope,
  CommandExecutionOutcome,
  ConstructStorageCommand,
} from "../../domain/commands.ts";
import type { GameCommandExecutor } from "../../ports/game-command-executor.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
} from "../validation.ts";

export interface StorageCommandExecutorDependencies {
  readonly getStorageManager: () => unknown;
  readonly getResources: () => unknown;
}

function rejected(code: string, message: string): CommandExecutionOutcome {
  return { status: "rejected", failure: { code, message } };
}

export function createStorageCommandExecutor(
  dependencies: StorageCommandExecutorDependencies,
): GameCommandExecutor<ConstructStorageCommand> {
  function execute(
    envelope: CommandEnvelope<ConstructStorageCommand>,
  ): CommandExecutionOutcome {
    const { command } = envelope;
    if (typeof command.count !== "number" || !Number.isFinite(command.count)) {
      return rejected(
        "invalid-storage-count",
        "storage construction count must be a finite number",
      );
    }

    const storageManager = requireRecord(
      dependencies.getStorageManager(),
      "StorageManager",
    );
    const method =
      command.unit === "crate" ? "constructCrate" : "constructContainer";
    const construct = requireFunction(
      storageManager[method],
      `StorageManager.${method}`,
    );
    // Legacy parity: the construct call is unconditional (it self-guards on
    // non-positive counts in-game); the mock records every call.
    Reflect.apply(construct, storageManager, [command.count]);

    const resources = requireRecord(dependencies.getResources(), "resources");
    const produced = requireRecord(
      resources[command.producedResourceId],
      `resources.${command.producedResourceId}`,
    );
    produced["currentQuantity"] =
      requireNumber(
        produced["currentQuantity"],
        `resources.${command.producedResourceId}.currentQuantity`,
      ) + command.count;

    for (const delta of command.spend) {
      const resource = requireRecord(
        resources[delta.resourceId],
        `resources.${delta.resourceId}`,
      );
      resource["currentQuantity"] =
        requireNumber(
          resource["currentQuantity"],
          `resources.${delta.resourceId}.currentQuantity`,
        ) - delta.amount;
    }

    return { status: "succeeded" };
  }

  return Object.freeze({ execute });
}
