import { createInfrastructureManagers } from "../game/infrastructure-managers.ts";

type Dependencies = Parameters<typeof createInfrastructureManagers>[0];

// Composition seam for infrastructure manager construction. KeyManager and
// GameLog remain named outputs for the browser and logging compatibility ports.
export function createInfrastructureManagerControl(dependencies: Dependencies) {
  return createInfrastructureManagers(dependencies);
}
