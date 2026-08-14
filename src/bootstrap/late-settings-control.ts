import { createEjectorSettingsControl } from "./settings/ejector-settings-control.ts";
import { createFleetSettingsControl } from "./settings/fleet-settings-control.ts";
import { createHellSettingsControl } from "./settings/hell-settings-control.ts";
import { createMarketSettingsControl } from "./settings/market-settings-control.ts";
import { createMechSettingsControl } from "./settings/mech-settings-control.ts";

type HellDependencies = Parameters<typeof createHellSettingsControl>[0];
type FleetDependencies = Parameters<typeof createFleetSettingsControl>[0];
type MechDependencies = Parameters<typeof createMechSettingsControl>[0];
type EjectorDependencies = Parameters<typeof createEjectorSettingsControl>[0];
type MarketDependencies = Parameters<typeof createMarketSettingsControl>[0];

export interface LateSettingsControlDependencies {
  hell: HellDependencies;
  fleet: FleetDependencies;
  mech: MechDependencies;
  ejector: EjectorDependencies;
  market: MarketDependencies;
}

export function createLateSettingsControl({
  hell,
  fleet,
  mech,
  ejector,
  market,
}: LateSettingsControlDependencies) {
  return {
    hellSettingsBrowserAdapter: createHellSettingsControl(hell),
    fleetSettingsBrowserAdapter: createFleetSettingsControl(fleet),
    mechSettingsBrowserAdapter: createMechSettingsControl(mech),
    ejectorSettingsBrowserAdapter: createEjectorSettingsControl(ejector),
    marketSettingsBrowserAdapter: createMarketSettingsControl(market),
  };
}
