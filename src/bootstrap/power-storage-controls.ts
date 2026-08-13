import { createPowerControl } from "./power-control.ts";
import { createStorageAllocationControl } from "./storage-allocation-control.ts";

type PowerDependencies = Parameters<typeof createPowerControl>[0];
type StorageAllocationDependencies = Parameters<
  typeof createStorageAllocationControl
>[0];

interface PowerStorageControlDependencies {
  readonly power: PowerDependencies;
  readonly storage: StorageAllocationDependencies;
}

// Composition seam for power and storage-allocation automation. Storage
// expansion remains an explicit input so its lifecycle and test surface stay
// owned by the runtime's earlier storage-expansion construction.
export function createPowerStorageControls({
  power,
  storage,
}: PowerStorageControlDependencies) {
  const powerControl = createPowerControl(power);
  const storageControl = createStorageAllocationControl(storage);

  return Object.freeze({
    ...powerControl,
    ...storageControl,
  });
}
