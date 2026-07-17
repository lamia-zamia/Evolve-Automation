import {
  createCycleRunner,
  type CycleTrace,
} from "../application/cycle-runner.ts";
import { createStorageCommandExecutor } from "../adapters/evolve/storage-command-executor.ts";
import { createEvolveStorageExpansionReader } from "../adapters/evolve/storage-expansion-reader.ts";
import { createStorageExpansionSettingsReader } from "../adapters/storage/storage-expansion-settings-reader.ts";
import type { ConstructStorageCommand } from "../domain/commands.ts";
import { planStorageExpansion } from "../domain/storage-expansion.ts";

export interface StorageExpansionDependencies {
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getSettings: () => unknown;
  readonly getStorageManager: () => unknown;
  readonly isEarlyGame: () => unknown;
  readonly isLumberRace: () => unknown;
  readonly nowMs: () => number;
}

export function createStorageExpansion(
  dependencies: StorageExpansionDependencies,
): {
  readonly expandStorage: (storageToBuild: number) => boolean;
  readonly getLastTrace: () => CycleTrace<ConstructStorageCommand> | undefined;
} {
  const clock = Object.freeze({ nowMs: dependencies.nowMs });
  let pendingStorageToBuild = 0;

  const gameReader = createEvolveStorageExpansionReader({
    clock,
    getStorageToBuild: () => pendingStorageToBuild,
    getResources: dependencies.getResources,
    getBuildings: dependencies.getBuildings,
    getStorageManager: dependencies.getStorageManager,
    isEarlyGame: dependencies.isEarlyGame,
    isLumberRace: dependencies.isLumberRace,
  });
  const settingsReader = createStorageExpansionSettingsReader(
    dependencies.getSettings,
  );
  const commandExecutor = createStorageCommandExecutor({
    getStorageManager: dependencies.getStorageManager,
    getResources: dependencies.getResources,
  });

  let lastTrace: CycleTrace<ConstructStorageCommand> | undefined;
  const runner = createCycleRunner({
    clock,
    gameReader,
    settingsReader,
    commandExecutor,
    logger: { record: () => {} },
    publisher: {
      publish: (trace) => {
        lastTrace = trace;
      },
    },
    phases: [
      {
        name: "economy",
        planners: [{ name: "storage-expansion", plan: planStorageExpansion }],
      },
    ],
    getConflictKey: (command) => `storage-${command.unit}`,
    maxCommandsPerCycle: 2,
  });

  function expandStorage(storageToBuild: number): boolean {
    pendingStorageToBuild = storageToBuild;
    const trace = runner.runCycle();
    lastTrace = trace;

    // Legacy `return missingStorage < storageToBuild`: true iff net built
    // storage capacity is positive.
    let storageAdded = 0;
    for (const result of trace.results) {
      if (result.status === "succeeded") {
        storageAdded +=
          result.envelope.command.count *
          result.envelope.command.storagePerUnit;
      }
    }
    return storageAdded > 0;
  }

  return Object.freeze({ expandStorage, getLastTrace: () => lastTrace });
}
