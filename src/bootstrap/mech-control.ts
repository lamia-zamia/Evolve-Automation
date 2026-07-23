import {
  createMechAdapter,
  type MechAdapterDependencies,
} from "../adapters/evolve/combat/mech.ts";
import { runMechAutomation } from "../application/mech.ts";

// Composition seam for the mech slice: owns the Evolve mech adapter construction
// and returns the control entry the runtime places at its tick position. The
// control logs a non-success outcome when mech debugging is enabled, preserving
// the runtime's prior diagnostic wrapper.
export function createMechControl(dependencies: {
  adapter: MechAdapterDependencies;
  readDebugEnabled: () => boolean;
  log: (label: string, outcome: unknown) => void;
}) {
  const adapter = createMechAdapter(dependencies.adapter);
  return Object.freeze({
    autoMech: () => {
      const outcome = runMechAutomation(adapter);
      if (dependencies.readDebugEnabled() && outcome.status !== "succeeded") {
        dependencies.log("[mech] outcome:", outcome);
      }
      return outcome;
    },
  });
}
