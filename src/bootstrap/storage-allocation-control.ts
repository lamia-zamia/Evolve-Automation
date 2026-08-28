import { createStorageDebugSource } from "../adapters/browser/storage-debug.ts";
import { createStorageAllocationAdapter } from "../adapters/evolve/economy/storage/storage-allocation.ts";
import { createStorageAllocationAutomation } from "../application/storage-allocation.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

// Composition seam for the storage-allocation slice: owns the browser debug source
// and the Evolve allocation adapter, wiring the adapter's `readDebugEnabled` to the
// debug source. The `expand` step comes from the storage-expansion control, passed
// through explicitly — exactly as the runtime closure did.
export function createStorageAllocationControl(dependencies: {
  debug: { getWindow: Parameters<typeof createStorageDebugSource>[0] };
  adapter: Omit<
    Parameters<typeof createStorageAllocationAdapter>[0],
    "readDebugEnabled"
  >;
  expand: Parameters<
    typeof createStorageAllocationAutomation
  >[0]["expansion"]["expand"];
  diagnostics?: TickDiagnostics | undefined;
}) {
  const debug = createStorageDebugSource(dependencies.debug.getWindow);
  const adapter = createStorageAllocationAdapter({
    ...dependencies.adapter,
    readDebugEnabled: () => debug.readEnabled(),
    diagnostics: dependencies.diagnostics,
  });
  const automation = createStorageAllocationAutomation({
    reader: adapter.reader,
    executor: adapter.executor,
    expansion: { expand: dependencies.expand },
    diagnostics: dependencies.diagnostics,
  });
  return Object.freeze({ autoStorage: () => automation.run() });
}
