import { createArpaToggleBrowserAdapter } from "../adapters/browser/arpa-toggles.ts";
import { createBuildingToggleBrowserAdapter } from "../adapters/browser/building-toggles.ts";
import { createCraftToggleBrowserAdapter } from "../adapters/browser/craft-toggles.ts";
import { createEjectToggleBrowserAdapter } from "../adapters/browser/eject-toggles.ts";
import { createSupplyToggleBrowserAdapter } from "../adapters/browser/supply-toggles.ts";
import { createArpaToggleEvolveAdapter } from "../adapters/evolve/progression/research/arpa-toggles.ts";
import { createBuildingToggleEvolveAdapter } from "../adapters/evolve/progression/build/building-toggles.ts";
import { createCraftToggleEvolveAdapter } from "../adapters/evolve/economy/production/craft-toggles.ts";
import { createEjectToggleEvolveAdapter } from "../adapters/evolve/economy/resources/eject-toggles.ts";
import { createSupplyToggleEvolveAdapter } from "../adapters/evolve/economy/resources/supply-toggles.ts";

type ArpaEvolveDependencies = Parameters<
  typeof createArpaToggleEvolveAdapter
>[0];
type ArpaBrowserDependencies = Parameters<
  typeof createArpaToggleBrowserAdapter
>[0];
type CraftEvolveDependencies = Parameters<
  typeof createCraftToggleEvolveAdapter
>[0];
type CraftBrowserDependencies = Parameters<
  typeof createCraftToggleBrowserAdapter
>[0];
type BuildingEvolveDependencies = Parameters<
  typeof createBuildingToggleEvolveAdapter
>[0];
type BuildingBrowserDependencies = Parameters<
  typeof createBuildingToggleBrowserAdapter
>[0];
type EjectEvolveDependencies = Parameters<
  typeof createEjectToggleEvolveAdapter
>[0];
type EjectBrowserDependencies = Parameters<
  typeof createEjectToggleBrowserAdapter
>[0];
type SupplyEvolveDependencies = Parameters<
  typeof createSupplyToggleEvolveAdapter
>[0];
type SupplyBrowserDependencies = Parameters<
  typeof createSupplyToggleBrowserAdapter
>[0];

export interface ToggleControlsDependencies {
  readonly arpa: ArpaEvolveDependencies;
  readonly arpaBrowser: ArpaBrowserDependencies;
  readonly craft: CraftEvolveDependencies;
  readonly craftBrowser: CraftBrowserDependencies;
  readonly building: BuildingEvolveDependencies;
  readonly buildingBrowser: BuildingBrowserDependencies;
  readonly eject: EjectEvolveDependencies;
  readonly ejectBrowser: EjectBrowserDependencies;
  readonly supply: SupplyEvolveDependencies;
  readonly supplyBrowser: SupplyBrowserDependencies;
}

export function createToggleControls({
  arpa,
  arpaBrowser,
  craft,
  craftBrowser,
  building,
  buildingBrowser,
  eject,
  ejectBrowser,
  supply,
  supplyBrowser,
}: ToggleControlsDependencies) {
  const arpaToggleReader = createArpaToggleEvolveAdapter(arpa);
  const arpaToggleBrowserAdapter = createArpaToggleBrowserAdapter({
    ...arpaBrowser,
    reader: arpaToggleReader,
  });
  const craftToggleReader = createCraftToggleEvolveAdapter(craft);
  const craftToggleBrowserAdapter = createCraftToggleBrowserAdapter({
    ...craftBrowser,
    reader: craftToggleReader,
  });
  const buildingToggleReader = createBuildingToggleEvolveAdapter(building);
  const buildingToggleBrowserAdapter = createBuildingToggleBrowserAdapter({
    ...buildingBrowser,
    reader: buildingToggleReader,
  });
  const ejectToggleReader = createEjectToggleEvolveAdapter(eject);
  const ejectToggleBrowserAdapter = createEjectToggleBrowserAdapter({
    ...ejectBrowser,
    reader: ejectToggleReader,
  });
  const supplyToggleReader = createSupplyToggleEvolveAdapter(supply);
  const supplyToggleBrowserAdapter = createSupplyToggleBrowserAdapter({
    ...supplyBrowser,
    reader: supplyToggleReader,
  });

  return Object.freeze({
    arpaToggleReader,
    arpaToggleBrowserAdapter,
    craftToggleReader,
    craftToggleBrowserAdapter,
    buildingToggleReader,
    buildingToggleBrowserAdapter,
    ejectToggleReader,
    ejectToggleBrowserAdapter,
    supplyToggleReader,
    supplyToggleBrowserAdapter,
  });
}
