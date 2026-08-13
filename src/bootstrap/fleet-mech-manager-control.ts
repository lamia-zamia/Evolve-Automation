import { createFleetManagers } from "../game/fleet-managers.ts";
import { createMechManager } from "../game/mech-manager.ts";

type FleetDependencies = Parameters<typeof createFleetManagers>[0];
type MechDependencies = Parameters<typeof createMechManager>[0];

interface FleetMechManagerControlDependencies {
  readonly fleet: FleetDependencies;
  readonly mech: MechDependencies;
}

// Composition seam for fleet and mech manager construction. The fleet family
// is built first, then the mech manager, preserving the legacy startup order
// while exposing named manager outputs directly.
export function createFleetMechManagerControl({
  fleet,
  mech,
}: FleetMechManagerControlDependencies) {
  const fleetManagers = createFleetManagers(fleet);
  const mechManager = createMechManager(mech);

  return Object.freeze({
    ...fleetManagers,
    ...mechManager,
  });
}
