import { createOuterFleetControl } from "./fleet-outer-control.ts";
import { createFleetControl } from "./fleet-control.ts";
import { createMechControl } from "./mech-control.ts";

type OuterFleetDependencies = Parameters<typeof createOuterFleetControl>[0];
type FleetDependencies = Parameters<typeof createFleetControl>[0];
type MechDependencies = Parameters<typeof createMechControl>[0];

interface FleetMechControlDependencies {
  readonly outerFleet: OuterFleetDependencies;
  readonly fleet: FleetDependencies;
  readonly mech: MechDependencies;
}

// Composition seam for fleet and mech automation. The controls retain their
// adapter-owned effects and the returned entries preserve the existing combat
// tick order.
export function createFleetMechControls({
  outerFleet,
  fleet,
  mech,
}: FleetMechControlDependencies) {
  const outerFleetControl = createOuterFleetControl(outerFleet);
  const fleetControl = createFleetControl(fleet);
  const mechControl = createMechControl(mech);

  return Object.freeze({
    ...outerFleetControl,
    ...fleetControl,
    ...mechControl,
  });
}
