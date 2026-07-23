import { createStorageCommandExecutor } from "../adapters/evolve/economy/storage/storage-command-executor.ts";
import { createEvolveStorageExpansionReader } from "../adapters/evolve/economy/storage/storage-expansion-reader.ts";
import { createStorageExpansionSettingsReader } from "../adapters/storage/storage-expansion-settings-reader.ts";
import { createStorageExpansion } from "../application/storage-expansion.ts";

// Composition seam for the storage-expansion slice: owns the Evolve reader
// factory, settings reader, and command executor, and returns the `expandStorage`
// use-case the storage-allocation control consumes. The shared clock is built from
// the injected `nowMs`, exactly as the runtime closure did.
export function createStorageExpansionControl(dependencies: {
  nowMs: () => number;
  reader: Omit<
    Parameters<typeof createEvolveStorageExpansionReader>[0],
    "clock" | "getStorageToBuild"
  >;
  getSettings: Parameters<typeof createStorageExpansionSettingsReader>[0];
  commandExecutor: Parameters<typeof createStorageCommandExecutor>[0];
}) {
  const clock = Object.freeze({ nowMs: dependencies.nowMs });
  const { expandStorage } = createStorageExpansion({
    clock,
    createReader: (getStorageToBuild) =>
      createEvolveStorageExpansionReader({
        clock,
        getStorageToBuild,
        ...dependencies.reader,
      }),
    settingsReader: createStorageExpansionSettingsReader(
      dependencies.getSettings,
    ),
    commandExecutor: createStorageCommandExecutor(dependencies.commandExecutor),
  });
  return Object.freeze({ expandStorage });
}
