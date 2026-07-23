import {
  createOcularPowerControls,
  type OcularPowerControlsDependencies,
} from "../adapters/browser/ocular-power-controls.ts";
import {
  createOcularPowerAdapter,
  type OcularPowerAdapterDependencies,
} from "../adapters/evolve/traits/ocular-power.ts";
import { runOcularPowerAutomation } from "../application/ocular-power.ts";

// Composition seam for the ocular-power slice: owns both the browser ocular
// controls and the Evolve ocular adapter construction, sharing the controls with
// the automation run, and returns the control entry the runtime places at its
// tick position.
export function createOcularPowerControl(dependencies: {
  controls: OcularPowerControlsDependencies;
  adapter: Omit<OcularPowerAdapterDependencies, "controls">;
}) {
  const controls = createOcularPowerControls(dependencies.controls);
  const adapter = createOcularPowerAdapter({
    ...dependencies.adapter,
    controls,
  });
  return Object.freeze({
    autoOcularPowers: () =>
      runOcularPowerAutomation({
        reader: adapter.reader,
        executor: adapter.executor,
        controls,
      }),
  });
}
