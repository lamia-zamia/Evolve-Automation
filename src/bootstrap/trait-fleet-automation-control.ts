import { createFleetMechControls } from "./fleet-mech-controls.ts";
import { createTraitResourceControls } from "./trait-resource-controls.ts";

type TraitResourceDependencies = Parameters<
  typeof createTraitResourceControls
>[0];
type FleetMechDependencies = Parameters<typeof createFleetMechControls>[0];

export interface TraitFleetAutomationControlDependencies {
  traitResource: TraitResourceDependencies;
  fleetMech: FleetMechDependencies;
}

export function createTraitFleetAutomationControl({
  traitResource,
  fleetMech,
}: TraitFleetAutomationControlDependencies) {
  return {
    ...createTraitResourceControls(traitResource),
    ...createFleetMechControls(fleetMech),
  };
}
