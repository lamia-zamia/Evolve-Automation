import {
  createFleetAdapter,
  type FleetAdapterDependencies,
} from "../adapters/evolve/combat/fleet.ts";
import { runFleetAutomation } from "../application/fleet.ts";

// Composition seam for the fleet slice: owns the Evolve fleet adapter
// construction and returns the control entry the runtime places at its tick
// position.
export function createFleetControl(dependencies: FleetAdapterDependencies) {
  const adapter = createFleetAdapter(dependencies);
  return Object.freeze({ autoFleet: () => runFleetAutomation(adapter) });
}
