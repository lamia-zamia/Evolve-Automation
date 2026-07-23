import {
  createOuterFleetAdapter,
  type OuterFleetAdapterDependencies,
} from "../adapters/evolve/combat/fleet-outer.ts";
import { runOuterFleetAutomation } from "../application/fleet-outer.ts";

// Composition seam for the outer-fleet slice: owns the Evolve outer-fleet
// adapter construction and returns the control entry the runtime places at its
// tick position.
export function createOuterFleetControl(
  dependencies: OuterFleetAdapterDependencies,
) {
  const adapter = createOuterFleetAdapter(dependencies);
  return Object.freeze({
    autoFleetOuter: () => runOuterFleetAutomation(adapter),
  });
}
