import { createReplicatorGovernorOffice } from "../adapters/browser/replicator-governor.ts";
import {
  createReplicatorGovernorGameReader,
  createReplicatorSelectionExecutor,
  createReplicatorSelectionReader,
  type ReplicatorGovernorGameReaderDependencies,
  type ReplicatorSelectionReaderDependencies,
} from "../adapters/evolve/economy/production/replicator.ts";
import { runReplicatorAutomation } from "../application/replicator.ts";

// Composition seam for the replicator slice: owns the selection reader, governor
// game reader, and browser governor-office adapter (built once), and constructs
// the selection executor per call to preserve the runtime's prior behavior.
export function createReplicatorControl(dependencies: {
  selectionReader: ReplicatorSelectionReaderDependencies;
  governorGameReader: ReplicatorGovernorGameReaderDependencies;
  getReplicatorManager: Parameters<typeof createReplicatorSelectionExecutor>[0];
  getGovernorOffice: Parameters<typeof createReplicatorGovernorOffice>[0];
  resolveVueMethod: Parameters<typeof createReplicatorGovernorOffice>[1];
}) {
  const selectionReader = createReplicatorSelectionReader(
    dependencies.selectionReader,
  );
  const governorGameReader = createReplicatorGovernorGameReader(
    dependencies.governorGameReader,
  );
  const governorOffice = createReplicatorGovernorOffice(
    dependencies.getGovernorOffice,
    dependencies.resolveVueMethod,
  );
  return Object.freeze({
    autoReplicator: () =>
      runReplicatorAutomation({
        selectionReader,
        selectionExecutor: createReplicatorSelectionExecutor(
          dependencies.getReplicatorManager,
        ),
        governorGameReader,
        governorOfficeReader: governorOffice.reader,
        governorExecutor: governorOffice.executor,
      }),
  });
}
