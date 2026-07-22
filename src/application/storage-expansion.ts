import { createCycleRunner, type CycleTrace } from "./cycle-runner.ts";
import type { ConstructStorageCommand } from "../domain/commands.ts";
import {
  planStorageExpansion,
  type StorageExpansionSettings,
  type StorageExpansionSnapshot,
} from "../domain/storage-expansion.ts";
import type { Clock } from "../ports/clock.ts";
import type { GameCommandExecutor } from "../ports/game-command-executor.ts";
import type { GameReader } from "../ports/game-reader.ts";
import type { SettingsReader } from "../ports/settings-reader.ts";

export interface StorageExpansionDependencies {
  readonly clock: Clock;
  readonly createReader: (
    getStorageToBuild: () => number,
  ) => GameReader<StorageExpansionSnapshot>;
  readonly settingsReader: SettingsReader<StorageExpansionSettings>;
  readonly commandExecutor: GameCommandExecutor<ConstructStorageCommand>;
}

export interface StorageExpansionAutomation {
  readonly expandStorage: (storageToBuild: number) => boolean;
  readonly getLastTrace: () => CycleTrace<ConstructStorageCommand> | undefined;
}

export function createStorageExpansion({
  clock,
  createReader,
  settingsReader,
  commandExecutor,
}: StorageExpansionDependencies): StorageExpansionAutomation {
  let pendingStorageToBuild = 0;
  let lastTrace: CycleTrace<ConstructStorageCommand> | undefined;
  const runner = createCycleRunner({
    clock,
    gameReader: createReader(() => pendingStorageToBuild),
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
