import {
  createBuildAdapter,
  type BuildAdapterDependencies,
} from "../adapters/evolve/progression/build/build.ts";
import { runBuildAutomation } from "../application/build.ts";

// Composition seam for the build slice: owns the Evolve build adapter
// construction and returns the control entry the runtime places at its tick
// position. The control waits for the lazily-initialized government state before
// entering Evolve's build-click path on a fresh game.
export function createBuildControl(dependencies: {
  adapter: BuildAdapterDependencies;
  isGovernReady: () => boolean;
}) {
  const adapter = createBuildAdapter(dependencies.adapter);
  return Object.freeze({
    autoBuild: () => {
      // Evolve initializes civic.govern lazily on a fresh game, but its build
      // click path assumes the object already exists. Retry on the next tick.
      if (!dependencies.isGovernReady()) return;
      runBuildAutomation(adapter);
    },
  });
}
