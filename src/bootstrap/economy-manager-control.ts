import { createEconomyManagers } from "../game/economy-managers.ts";

type Dependencies = Parameters<typeof createEconomyManagers>[0];

// Composition seam for the economy manager family. The returned named manager
// objects remain individually visible to the runtime and its compatibility
// surfaces; no manager registry is introduced.
export function createEconomyManagerControl(dependencies: Dependencies) {
  return createEconomyManagers(dependencies);
}
