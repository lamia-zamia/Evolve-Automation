import { createRuntimeTestSurface } from "./runtime-test-surface.js";
import { startEvolveRuntimeComposition } from "./evolve-runtime.js";

export function startEvolveRuntimeForTests($, diagnostics, runtimeEnvironment) {
  const testSurface = createRuntimeTestSurface();
  startEvolveRuntimeComposition(
    $,
    diagnostics,
    runtimeEnvironment,
    testSurface,
  );
  return testSurface.finish();
}
