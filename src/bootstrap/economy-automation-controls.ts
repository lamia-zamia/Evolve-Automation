import { createConsumeControl } from "./consume-control.ts";
import { createGrapheneControl } from "./graphene-control.ts";
import { createMiningDroidControl } from "./mining-droid-control.ts";
import { createReplicatorControl } from "./replicator-control.ts";

type MiningDroidDependencies = Parameters<typeof createMiningDroidControl>[0];
type GrapheneDependencies = Parameters<typeof createGrapheneControl>[0];
type ConsumeDependencies = Parameters<typeof createConsumeControl>[0];
type ReplicatorDependencies = Parameters<typeof createReplicatorControl>[0];

interface EconomyAutomationControlDependencies {
  readonly miningDroid: MiningDroidDependencies;
  readonly graphene: GrapheneDependencies;
  readonly consume: ConsumeDependencies;
  readonly replicator: ReplicatorDependencies;
}

// Composition seam for the remaining economy automation family. Each control
// keeps its own adapter construction and the runtime retains the tick ordering
// through the returned entries.
export function createEconomyAutomationControls({
  miningDroid,
  graphene,
  consume,
  replicator,
}: EconomyAutomationControlDependencies) {
  const miningDroidControl = createMiningDroidControl(miningDroid);
  const grapheneControl = createGrapheneControl(graphene);
  // TODO: Allow configuring priorities between eject\supply\nanite
  const consumeControl = createConsumeControl(consume);
  const replicatorControl = createReplicatorControl(replicator);

  return Object.freeze({
    ...miningDroidControl,
    ...grapheneControl,
    ...consumeControl,
    ...replicatorControl,
  });
}
