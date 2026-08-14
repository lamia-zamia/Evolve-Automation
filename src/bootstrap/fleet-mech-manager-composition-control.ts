import { createFleetMechManagerControl } from "./fleet-mech-manager-control.ts";

type FleetMechManagerDependencies = Parameters<
  typeof createFleetMechManagerControl
>[0];

export type FleetMechManagerCompositionDependencies =
  FleetMechManagerDependencies;

export function createFleetMechManagerCompositionControl(
  dependencies: FleetMechManagerCompositionDependencies,
) {
  return createFleetMechManagerControl(dependencies);
}
