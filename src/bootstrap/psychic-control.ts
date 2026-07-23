import {
  createPsychicControls,
  type PsychicControlsDependencies,
} from "../adapters/browser/psychic-controls.ts";
import {
  createPsychicAdapter,
  type PsychicAdapterDependencies,
} from "../adapters/evolve/traits/psychic.ts";
import { runPsychicAutomation } from "../application/psychic.ts";

// Composition seam for the psychic slice: owns both the browser psychic controls
// and the Evolve psychic adapter construction, and returns the control entry the
// runtime places at its tick position.
export function createPsychicControl(dependencies: {
  controls: PsychicControlsDependencies;
  adapter: Omit<PsychicAdapterDependencies, "controls">;
}) {
  const controls = createPsychicControls(dependencies.controls);
  const adapter = createPsychicAdapter({ ...dependencies.adapter, controls });
  return Object.freeze({
    autoPsychic: () =>
      runPsychicAutomation({
        reader: adapter.reader,
        executor: adapter.executor,
      }),
  });
}
