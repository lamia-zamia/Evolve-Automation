import {
  createGeneticsControls,
  type GeneticsControlsDependencies,
} from "../adapters/browser/genetics-controls.ts";
import {
  createGeneticsAdapter,
  type GeneticsAdapterDependencies,
} from "../adapters/evolve/traits/genetics.ts";
import { runGeneticsAutomation } from "../application/genetics.ts";

// Composition seam for the genetics slice: owns both the browser genetics
// controls and the Evolve genetics adapter construction, sharing the controls
// with the automation run, and returns the control entry the runtime places at
// its tick position.
export function createGeneticsControl(dependencies: {
  controls: GeneticsControlsDependencies;
  adapter: Omit<GeneticsAdapterDependencies, "controls">;
}) {
  const controls = createGeneticsControls(dependencies.controls);
  const adapter = createGeneticsAdapter({ ...dependencies.adapter, controls });
  return Object.freeze({
    autoGenetics: () =>
      runGeneticsAutomation({
        reader: adapter.reader,
        executor: adapter.executor,
        controls,
      }),
  });
}
