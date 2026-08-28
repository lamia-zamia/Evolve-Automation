import { createGameActionControls } from "../adapters/browser/game-action-controls.ts";
import { createGameCraftingControls } from "../adapters/browser/game-crafting-controls.ts";
import { createGameClickMultipliers } from "../adapters/browser/game-click-multipliers.ts";
import { createGameDisposalControls } from "../adapters/browser/game-disposal-controls.ts";
import { createGameEspionageControls } from "../adapters/browser/game-espionage-controls.ts";
import { createGameForeignControls } from "../adapters/browser/game-foreign-controls.ts";
import { createGameGovernmentSelection } from "../adapters/browser/game-government-selection.ts";
import { createGameIndustryControls } from "../adapters/browser/game-industry-controls.ts";
import { createGameFleetControls } from "../adapters/browser/game-fleet-controls.ts";
import { createGameGarrisonControls } from "../adapters/browser/game-garrison-controls.ts";
import { createGameMechControls } from "../adapters/browser/game-mech-controls.ts";
import { createGameMechListControls } from "../adapters/browser/game-mech-list-controls.ts";
import { createGameJobControls } from "../adapters/browser/game-job-controls.ts";
import { createGameMarketControls } from "../adapters/browser/game-market-controls.ts";
import { createGameProjectControls } from "../adapters/browser/game-project-controls.ts";
import { createGameResearchControls } from "../adapters/browser/game-research-controls.ts";
import { createGameStorageControls } from "../adapters/browser/game-storage-controls.ts";
import { createGameTraitControls } from "../adapters/browser/game-trait-controls.ts";

type ActionDependencies = Parameters<typeof createGameActionControls>[0];
type ClickMultiplierDependencies = Parameters<
  typeof createGameClickMultipliers
>[0];
type FleetDependencies = Parameters<typeof createGameFleetControls>[0];
type GarrisonDependencies = Parameters<typeof createGameGarrisonControls>[0];
type MechListDependencies = Parameters<typeof createGameMechListControls>[0];
type ResearchDependencies = Parameters<typeof createGameResearchControls>[0];

export interface GameControlSetDependencies {
  readonly getVueById: ActionDependencies["getVueById"];
  readonly getForeignVueById: ActionDependencies["getVueById"];
  readonly getMainVue: Parameters<
    typeof createGameProjectControls
  >[0]["getMainVue"];
  readonly getDocument: ResearchDependencies["getDocument"];
  readonly getKeyManager: ClickMultiplierDependencies["getKeyManager"];
  readonly selectTooltip: ActionDependencies["selectTooltip"];
  readonly getGame: GarrisonDependencies["getGame"];
  readonly getJQuery: FleetDependencies["getJQuery"];
  readonly callVueMethod: GarrisonDependencies["callVueMethod"];
  readonly getSortable: MechListDependencies["getSortable"];
  readonly getPageSortable: MechListDependencies["getPageSortable"];
  readonly isSandboxBypass: MechListDependencies["isSandboxBypass"];
  readonly cloneIntoPage: MechListDependencies["cloneIntoPage"];
}

export function createGameControlSet({
  getVueById,
  getForeignVueById,
  getMainVue,
  getDocument,
  getKeyManager,
  selectTooltip,
  getGame,
  getJQuery,
  callVueMethod,
  getSortable,
  getPageSortable,
  isSandboxBypass,
  cloneIntoPage,
}: GameControlSetDependencies) {
  const clickMultipliers = createGameClickMultipliers({ getKeyManager });
  const clickSteps = (count: number) => clickMultipliers.steps(count);
  const clearClicks = () => clickMultipliers.clear();

  const projectControls = createGameProjectControls({ getVueById, getMainVue });
  const researchControls = createGameResearchControls({
    getDocument,
    getVueById,
  });
  const traitControls = createGameTraitControls({ getVueById });
  const jobControls = createGameJobControls({ getVueById, clickSteps });
  const actionControls = createGameActionControls({
    getVueById,
    selectTooltip,
    clickSteps,
  });
  const craftingControls = createGameCraftingControls({
    getVueById,
    clearClickMultipliers: clearClicks,
  });
  const industryControls = createGameIndustryControls({
    getVueById,
    clickSteps,
  });
  const espionageControls = createGameEspionageControls({ getVueById });
  const foreignControls = createGameForeignControls({
    getVueById: getForeignVueById,
  });
  const governmentSelection = createGameGovernmentSelection({ getVueById });
  const marketControls = createGameMarketControls({ getVueById, clickSteps });
  const storageControls = createGameStorageControls({ getVueById, clickSteps });
  const disposalControls = createGameDisposalControls({
    getVueById,
    clickSteps,
  });
  const fleetControls = createGameFleetControls({
    getVueById,
    clickSteps,
    getJQuery,
  });
  const garrisonControls = createGameGarrisonControls({
    getVueById,
    clickSteps,
    getGame,
    clearClickMultipliers: clearClicks,
    callVueMethod,
  });
  const mechControls = createGameMechControls({ getVueById });
  const mechListControls = createGameMechListControls({
    getVueById,
    getSortable,
    getPageSortable,
    isSandboxBypass,
    cloneIntoPage,
  });

  return Object.freeze({
    projectControls,
    researchControls,
    clickMultipliers,
    traitControls,
    jobControls,
    actionControls,
    craftingControls,
    industryControls,
    espionageControls,
    foreignControls,
    governmentSelection,
    marketControls,
    storageControls,
    disposalControls,
    fleetControls,
    garrisonControls,
    mechControls,
    mechListControls,
  });
}
