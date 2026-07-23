import {
  createSpyAdapter,
  type SpyAdapterDependencies,
} from "../adapters/evolve/combat/spy.ts";
import { runSpyAutomation } from "../application/spy.ts";

// Composition seam for the spy slice: owns the Evolve spy adapter construction
// and returns the control entry the runtime places at its tick position.
export function createSpyControl(dependencies: SpyAdapterDependencies) {
  const adapter = createSpyAdapter(dependencies);
  return Object.freeze({ autoSpy: () => runSpyAutomation(adapter) });
}
