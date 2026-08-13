import { createPrestigeEligibility } from "../adapters/evolve/prestige-eligibility.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type Dependencies = Parameters<typeof createPrestigeEligibility>[0];

// Composition seam for prestige eligibility: the adapter builds its live
// readers and this control owns the characterization publication at the same
// boundary.
export function createPrestigeEligibilityControl({
  testSurface,
  setTestContext,
  ...dependencies
}: Dependencies & {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}) {
  const eligibility = createPrestigeEligibility(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      prestigeEligibility: eligibility,
      setPrestigeEligibilityTestContext: setTestContext,
    });
  return eligibility;
}
