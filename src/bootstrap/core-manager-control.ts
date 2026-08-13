import { createCoreManagers } from "../game/core-managers.ts";

type Dependencies = Parameters<typeof createCoreManagers>[0];

// Composition seam for core manager construction. The weighting capability
// surface remains explicit in the caller until its consumers can be narrowed.
export function createCoreManagerControl(dependencies: Dependencies) {
  return createCoreManagers(dependencies);
}
