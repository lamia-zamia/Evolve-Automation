import { createCoreManagerControl } from "./core-manager-control.ts";
import { createWeightingSnapshotReader } from "../adapters/evolve/progression/build/weighting-snapshot.ts";

type CoreManagerDependencies = Parameters<typeof createCoreManagerControl>[0];
type WeightingSnapshotDependencies = Parameters<
  typeof createWeightingSnapshotReader
>[0];

export type CoreManagerCompositionDependencies = Omit<
  CoreManagerDependencies,
  "readWeightingSnapshot"
> & {
  weightingSnapshot: WeightingSnapshotDependencies;
};

export function createCoreManagerCompositionControl({
  weightingSnapshot,
  ...coreManagerDependencies
}: CoreManagerCompositionDependencies) {
  return createCoreManagerControl({
    ...coreManagerDependencies,
    readWeightingSnapshot: createWeightingSnapshotReader(weightingSnapshot),
  });
}
