import {
  createHellAdapter,
  type HellAdapterDependencies,
} from "../adapters/evolve/combat/hell.ts";
import { runHellAutomation } from "../application/hell.ts";

// Composition seam for the hell slice: owns the Evolve hell adapter
// construction and returns the control entry the runtime places at its tick
// position.
export function createHellControl(dependencies: HellAdapterDependencies) {
  const adapter = createHellAdapter(dependencies);
  return Object.freeze({ autoHell: () => runHellAutomation(adapter) });
}
