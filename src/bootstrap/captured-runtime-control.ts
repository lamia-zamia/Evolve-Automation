import { createCapturedProgressionControl } from "./captured-progression-control.ts";
import { advancePeriodGate } from "../domain/tick.ts";
import { readPeriodsPerScriptCycle } from "../adapters/evolve/captured-tick-rate.ts";
import { runCraftAutomation } from "../application/craft.ts";
import { runJobsAutomation } from "../application/jobs.ts";
import { createCapturedGatherResourcesControl } from "./captured-gather-resources-control.ts";
import { createCapturedTaxControl } from "./captured-tax-control.ts";
import {
  createCapturedGovernmentAutomation,
  runCapturedGovernmentAutomation,
} from "../adapters/evolve/civic/captured-government.ts";
import { createCapturedHellAutomation } from "../adapters/evolve/combat/captured-hell.ts";
import { createCapturedCraftsmenAutomation } from "../adapters/evolve/civic/captured-craftsmen.ts";
import {
  createCapturedFullJobsAutomation,
  createCapturedOrdinaryJobsAutomation,
} from "../adapters/evolve/civic/captured-ordinary-jobs.ts";
import {
  createCapturedPylonAutomation,
  PYLON_CONTROL,
} from "../adapters/evolve/economy/production/captured-pylon.ts";
import {
  ALCHEMY_CONTROL_PREFIX,
  createCapturedAlchemyAutomation,
} from "../adapters/evolve/economy/production/captured-alchemy.ts";
import {
  createCapturedMiningDroidAutomation,
  MINING_DROID_CONTROL,
} from "../adapters/evolve/economy/production/captured-mining-droid.ts";
import {
  createCapturedGrapheneAutomation,
  GRAPHENE_CONTROL,
} from "../adapters/evolve/economy/production/captured-graphene.ts";
import {
  createCapturedReplicatorAutomation,
  GOVERNOR_CONTROL,
  REPLICATOR_CONTROL,
} from "../adapters/evolve/economy/production/captured-replicator.ts";
import {
  createCapturedResourceDemand,
  EMPTY_DEMAND_SAMPLE,
  type CapturedDemandSample,
} from "../adapters/evolve/economy/resources/captured-resource-demand.ts";
import { createCapturedResourceSource } from "../adapters/evolve/captured-world-state.ts";
import { createCapturedFleetDemand } from "../adapters/evolve/combat/captured-fleet-demand.ts";
import { createCapturedFleetAutomation } from "../adapters/evolve/combat/captured-fleet.ts";
import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import {
  createCapturedTriggers,
  triggersNeedDemandSample,
  triggersNeedGrantedTechs,
  triggersNeedTechKnowledge,
  type CapturedTriggerTarget,
} from "../adapters/evolve/progression/build/captured-triggers.ts";
import { createCapturedTriggerActions } from "../adapters/evolve/progression/build/captured-trigger-actions.ts";
import { createCapturedQueueReservationSource } from "../adapters/evolve/captured-queue-reservations.ts";
import {
  createCapturedProductionRatios,
  MINING_SHIP_CONTROL,
  QUARRY_CONTROL,
  TITAN_MINE_CONTROL,
} from "../adapters/evolve/economy/resources/captured-production-ratios.ts";
import { createCapturedPowerProducerAutomation } from "../adapters/evolve/economy/production/captured-power-producers.ts";
import { createCapturedPowerWarningAutomation } from "../adapters/evolve/economy/production/captured-power-warnings.ts";
import {
  createCapturedSmelterAutomation,
  SMELTER_CONTROL,
} from "../adapters/evolve/economy/production/captured-smelter.ts";
import {
  createCapturedNaniteAutomation,
  NANITE_CONTROL,
} from "../adapters/evolve/economy/resources/captured-nanite.ts";
import {
  createCapturedEjectorAutomation,
  EJECTOR_SUMMARY_CONTROL,
} from "../adapters/evolve/economy/resources/captured-ejector.ts";
import {
  createCapturedSupplyAutomation,
  SUPPLY_SUMMARY_CONTROL,
} from "../adapters/evolve/economy/resources/captured-supply.ts";
import {
  createCapturedFactoryAutomation,
  FACTORY_CONTROL,
} from "../adapters/evolve/economy/production/captured-factory.ts";
import {
  createCapturedStoragePorts,
  STORAGE_CONSTRUCTION_CONTROL,
} from "../adapters/evolve/economy/storage/captured-storage.ts";
import {
  createCapturedGalaxyMarketPorts,
  GALAXY_MARKET_CONTROL,
} from "../adapters/evolve/economy/market/captured-galaxy-market.ts";
import {
  createCapturedMarketPorts,
  MARKET_QUANTITY_CONTROL,
} from "../adapters/evolve/economy/market/captured-market.ts";
import { createCapturedTradeRoutes } from "../adapters/evolve/economy/market/captured-trade-routes.ts";
import { runGalaxyMarketAutomation } from "../application/galaxy-market.ts";
import { runFleetAutomation } from "../application/fleet.ts";
import {
  runTriggerAutomation,
  triggerPhaseActive,
} from "../application/trigger.ts";
import { runMarketTradesAutomation } from "../application/market.ts";
import { createStorageAllocationAutomation } from "../application/storage-allocation.ts";
import { createCapturedCraftCosts } from "../adapters/evolve/economy/production/captured-craft-costs.ts";
import {
  createCapturedCraftExecutor,
  createCapturedCraftReader,
  type CraftingDocument,
} from "../adapters/evolve/economy/production/captured-crafting.ts";
import { createGameDrawnActionsReader } from "../adapters/browser/game-drawn-actions.ts";
import { createGameDrawnProjectsReader } from "../adapters/browser/game-drawn-projects.ts";
import { createGamePanelWorkspace } from "../adapters/browser/game-panel-workspace.ts";
import { createSettingsStore } from "../adapters/browser/settings-store.ts";
import { createCapturedSettingsPanel } from "./captured-settings-panel-control.ts";
import {
  createCapturedTabDiscovery,
  GOV_TABS_SETTING,
  GOV_TAB_INDEX,
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
  MARKET_TABS_SETTING,
  MARKET_TAB_INDEX,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SUB_TAB_CONTROLS,
} from "../adapters/evolve/captured-tab-discovery.ts";
import type { PageCapture } from "../adapters/evolve/page-capture.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import { isRecord, readProperty } from "../adapters/validation.ts";

type WorkspaceDocument = ReturnType<
  Parameters<typeof createGamePanelWorkspace>[0]["getDocument"]
>;
type DrawnActionsDocument = ReturnType<
  Parameters<typeof createGameDrawnActionsReader>[0]["getDocument"]
>;
type DrawnProjectsDocument = ReturnType<
  Parameters<typeof createGameDrawnProjectsReader>[0]["getDocument"]
>;
type CapturedDocument = WorkspaceDocument &
  DrawnActionsDocument &
  DrawnProjectsDocument &
  CraftingDocument;

export interface CapturedRuntimeControlDependencies {
  readonly pageCapture: PageCapture;
  /** Browser adapter output; the feature readers narrow it at their own boundaries. */
  readonly document: unknown;
  readonly mouseEvent: unknown;
  readonly storage: unknown;
  /** The page's global object. The settings panel reads `document`, `navigator` and `location`. */
  readonly settingsHostWindow: unknown;
  readonly diagnostics?: TickDiagnostics | undefined;
  readonly logError?: (message: string) => void;
}

const DEFAULT_SETTINGS: Readonly<Record<string, boolean>> = Object.freeze({
  masterScriptToggle: true,
  autoBuild: false,
  autoARPA: false,
  autoResearch: false,
  autoTax: false,
  autoMiningDroid: false,
  autoGraphenePlant: false,
  autoReplicator: false,
  autoMarket: false,
  autoAlchemy: false,
  autoCraft: false,
  autoQuarry: false,
  autoMine: false,
  autoExtractor: false,
  autoPower: false,
  autoFactory: false,
  autoStorage: false,
  autoNanite: false,
  autoEject: false,
  autoSupply: false,
  autoJobs: false,
  autoGalaxyMarket: false,
  autoGovernment: false,
  autoHell: false,
});

function isEnabled(settings: Record<string, unknown>, key: string): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : (DEFAULT_SETTINGS[key] ?? false);
}

/** Starts the captured runtime from completed game periods, without a debug clone or game object. */
export function startCapturedRuntime({
  pageCapture,
  document: documentValue,
  mouseEvent: mouseEventValue,
  storage,
  settingsHostWindow,
  diagnostics,
  logError = () => {},
}: CapturedRuntimeControlDependencies): () => void {
  const document = documentValue as CapturedDocument;
  const mouseEvent =
    typeof mouseEventValue === "function"
      ? (mouseEventValue as new (type: "mouseover" | "mouseout") => unknown)
      : class {
          constructor(_type: "mouseover" | "mouseout") {}
        };
  const panels = createGamePanelWorkspace({ getDocument: () => document });
  const settingsStore = createSettingsStore({
    storage,
    logError: (message) => logError(message),
  });
  const settingsPanel = createCapturedSettingsPanel({
    capturedPanelWindow: settingsHostWindow,
    settings: settingsStore,
    craftToggles: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    },
    logError: (message) => logError(message),
  });
  // The settings UI is useful even when document-start capture was missed (for example, when a
  // local bundle is loaded after the game). Automation still fails closed below until capture is
  // complete, but configuration should not disappear with it.
  settingsPanel.ensurePanel();
  const reported = new Set<string>();
  const reportOnce = (message: string) => {
    if (reported.has(message)) return;
    reported.add(message);
    logError(message);
  };
  // The demand sample both reads the construction cycle's observations and answers its storage
  // question, so one of the two has to be late-bound. This one is, with a real empty sample until
  // the cycle exists, rather than a mutable object either side could hold a stale reference to.
  let readDemand: () => CapturedDemandSample = () => EMPTY_DEMAND_SAMPLE;
  const buildCosts = createCapturedActionCostReader({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
  });
  const progression = createCapturedProgressionControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    mountSuppression: pageCapture.mountSuppression,
    panels,
    drawnActions: createGameDrawnActionsReader({
      getDocument: () => document,
    }),
    drawnProjects: createGameDrawnProjectsReader({
      getDocument: () => document,
      createMouseEvent: (type) => new mouseEvent(type),
    }),
    costs: buildCosts,
    readSettings: () => settingsStore.readRaw(),
    // The already-granted half of the research draw is only worth its cost to a configured
    // trigger, so the trigger settings decide whether each cycle's pass keeps it.
    needGrantedTechs: () => triggersNeedGrantedTechs(settingsStore.readRaw()),
    readCapturedStorageRequired: (resourceIds) => {
      const sample = readDemand();
      return Object.freeze(
        Object.fromEntries(
          resourceIds.map((id) => [id, sample.storageRequired(id)]),
        ),
      );
    },
    // Reported once per distinct reason: a candidate the cycle cannot price or a catalog it cannot
    // read is otherwise dropped in silence, which is how a composition gap survives a whole session.
    onSkipped: (key, reason) =>
      reportOnce(`progression skipped ${key}: ${reason}`),
    onUnavailable: (reason) => reportOnce(`progression unavailable: ${reason}`),
    nowMs: () => Date.now(),
    diagnostics,
  });
  const gatherResources = createCapturedGatherResourcesControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const tax = createCapturedTaxControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    nowMs: () => Date.now(),
  });
  const government = createCapturedGovernmentAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const hell = createCapturedHellAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const costs = createCapturedCraftCosts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
  });
  const craftsmen = createCapturedCraftsmenAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
  });
  const ordinaryJobs = createCapturedOrdinaryJobsAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    onSkipped: (key, reason) => reportOnce(`jobs skipped ${key}: ${reason}`),
  });
  const fullJobs = createCapturedFullJobsAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    onSkipped: (key, reason) => reportOnce(`jobs skipped ${key}: ${reason}`),
    costs,
    readDemand: () => readDemand(),
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
  });
  const pylon = createCapturedPylonAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const alchemy = createCapturedAlchemyAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const miningDroid = createCapturedMiningDroidAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const graphene = createCapturedGrapheneAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
  });
  const replicator = createCapturedReplicatorAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  // The demand sample is planned at most once per cycle and shared by everything that reads it.
  // The research offer snapshot is already captured by progression; sharing it here keeps queue
  // reservations and demand on one catalog without buying another discovery pass.
  const queueReservations = createCapturedQueueReservationSource({
    rootState: pageCapture.rootState,
    readOfferedTechs: progression.readOfferedTechs,
    costs: createCapturedActionCostReader({
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    }),
  });
  // The rendered shipyard cost is read-only, so one fleet demand reader serves both demand
  // plans below instead of each drawing the panel's cost markup twice.
  const fleetDemand = createCapturedFleetDemand({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    getDocument: () => document,
  });
  // The trigger conditions read what something else is accumulating, which needs the demand
  // commitments without the trigger targets. Sampling the cycle's own demand from a condition
  // would recurse through the trigger sampling it pulls in, so this second plan simply leaves
  // the triggers out; everything else reads the same inputs at the same moment.
  const triggerDemand = createCapturedResourceDemand({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs: buildCosts,
    construction: progression.observations,
    readOfferedTechs: progression.readOfferedTechs,
    reservations: queueReservations,
    readSettings: () => settingsStore.readRaw(),
    craftCosts: costs,
    fleet: fleetDemand,
  });
  let triggerDemandThisCycle: CapturedDemandSample | undefined;
  const readTriggerDemand = () =>
    (triggerDemandThisCycle ??= triggerDemand.sample());
  const triggers = createCapturedTriggers({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs: buildCosts,
    readSettings: () => settingsStore.readRaw(),
    readOfferedTechs: progression.readOfferedTechs,
    readGrantedTechs: progression.readGrantedTechs,
    readOfferedProjects: progression.readProjects,
    readBuildingUnlocks: progression.readBuildingUnlocks,
    // The demand-reading conditions need the commitments without the trigger targets; the
    // cycle's own sample includes them, and the conditions are evaluated inside the sampling
    // it pulls in. Sampled lazily and only for a configured condition, like the granted-techs
    // pass, so other runs never pay for the second demand plan.
    readDemandSample: () =>
      triggersNeedDemandSample(settingsStore.readRaw())
        ? readTriggerDemand()
        : undefined,
    readTechKnowledge: () =>
      triggersNeedTechKnowledge(settingsStore.readRaw())
        ? progression.readKnowledgeRequiredByTechs()
        : undefined,
  });
  // One trigger sample per cycle, shared by the demand model and the trigger phase: what the
  // script saves for and what it clicks must be the same list.
  let triggerTargetsThisCycle:
    readonly Readonly<CapturedTriggerTarget>[] | undefined;
  const readTriggerTargets = () =>
    (triggerTargetsThisCycle ??= triggers.read());
  const triggerActions = createCapturedTriggerActions({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    resources: createCapturedResourceSource(pageCapture.rootState),
    readTargets: readTriggerTargets,
    readSettings: () => settingsStore.readRaw(),
    readOfferedTechs: progression.readOfferedTechs,
    readOfferedProjects: progression.readProjects,
  });
  const demand = createCapturedResourceDemand({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs: buildCosts,
    triggers: Object.freeze({ read: readTriggerTargets }),
    construction: progression.observations,
    readOfferedTechs: progression.readOfferedTechs,
    reservations: queueReservations,
    readSettings: () => settingsStore.readRaw(),
    craftCosts: costs,
    fleet: fleetDemand,
  });
  let demandThisCycle: CapturedDemandSample | undefined;
  readDemand = () => (demandThisCycle ??= demand.sample());
  const storagePorts = createCapturedStoragePorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readStorageRequired: (resourceId) =>
      readDemand().storageRequired(resourceId),
    reservations: queueReservations,
    construction: progression.observations,
    readBuildTargets: progression.readManagedBuildTargets,
    readOfferedTechs: progression.readOfferedTechs,
    readProjects: progression.readProjects,
    costs: buildCosts,
    onSkipped: (key, reason) => reportOnce(`storage skipped ${key}: ${reason}`),
    nowMs: () => Date.now(),
  });
  const storageAutomation = createStorageAllocationAutomation({
    ...storagePorts,
    diagnostics,
  });
  const galaxyMarketPorts = createCapturedGalaxyMarketPorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const galaxyMarketAutomation = Object.freeze({
    run: () =>
      runGalaxyMarketAutomation({
        reader: galaxyMarketPorts.reader,
        executor: galaxyMarketPorts.executor,
      }),
  });
  const marketPorts = createCapturedMarketPorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    onUnavailable: (resourceId, reason) =>
      reportOnce(`market skipped ${resourceId}: ${reason}`),
  });
  const tradeRoutes = createCapturedTradeRoutes({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    onUnavailable: (reason) =>
      reportOnce(`trade routes unavailable: ${reason}`),
  });
  const marketAutomation = Object.freeze({
    run: () =>
      runMarketTradesAutomation(
        {
          reader: marketPorts.reader,
          executor: marketPorts.executor,
          tradeRoutes,
          diagnostics,
        },
        false,
        false,
        true,
      ),
  });
  const ratios = createCapturedProductionRatios({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const craftDependencies = {
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs,
    getDocument: () => document,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  };
  const craft = Object.freeze({
    reader: createCapturedCraftReader(craftDependencies),
    executor: createCapturedCraftExecutor(craftDependencies),
  });
  const civicDiscovery = createCapturedTabDiscovery({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    mountSuppression: pageCapture.mountSuppression,
    panels,
    diagnostics,
  });
  let civicControlsDiscoveryAttempted = false;
  const ensureCivicControls = () => {
    if (civicControlsDiscoveryAttempted) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    civicControlsDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `civic discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };
  let galaxyFleetDiscoveryAttempted = false;
  const ensureGalaxyFleetControls = () => {
    if (pageCapture.controls.resolve("fleet") !== undefined) return;
    if (galaxyFleetDiscoveryAttempted) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const spaceTabs = SUB_TAB_CONTROLS[SPACE_TABS_SETTING];
    if (spaceTabs === undefined) return;
    galaxyFleetDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civilization,
      }),
      Object.freeze({
        setting: SPACE_TABS_SETTING,
        control: spaceTabs,
        index: SPACE_TAB_INDEX.galaxy,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `galaxy fleet discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };
  let cityControlsDiscoveryAttempted = false;
  const ensureCityControls = () => {
    if (cityControlsDiscoveryAttempted) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    cityControlsDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civilization,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `city discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };
  let pylonDiscoveryAttempted = false;
  const ensurePylonControls = () => {
    if (pageCapture.controls.resolve(PYLON_CONTROL) !== undefined) return;
    const root = pageCapture.rootState.readRoot();
    const tech = readProperty(root, "tech");
    const magic = readProperty(tech, "magic");
    if (typeof magic !== "number" || !Number.isFinite(magic) || magic < 3) {
      return;
    }
    if (pylonDiscoveryAttempted) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) {
      return;
    }
    pylonDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civilization,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `pylon discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };
  let alchemyDiscoveryAttempted = false;
  const ensureAlchemyControls = () => {
    if (
      pageCapture.controls
        .capturedElementIds()
        .some((id) => id.startsWith(ALCHEMY_CONTROL_PREFIX))
    ) {
      return;
    }
    const root = pageCapture.rootState.readRoot();
    const tech = readProperty(root, "tech");
    const techLevel = readProperty(tech, "alchemy");
    if (
      typeof techLevel !== "number" ||
      !Number.isFinite(techLevel) ||
      techLevel < 1 ||
      alchemyDiscoveryAttempted
    ) {
      return;
    }
    alchemyDiscoveryAttempted = true;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.alchemy,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `alchemy discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };
  let miningDroidDiscoveryAttempted = false;
  const ensureMiningDroidControls = () => {
    if (pageCapture.controls.resolve(MINING_DROID_CONTROL) !== undefined)
      return;
    const root = pageCapture.rootState.readRoot();
    const interstellar = readProperty(root, "interstellar");
    const droids = readProperty(interstellar, "mining_droid");
    const count = readProperty(droids, "count");
    if (
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count < 1 ||
      miningDroidDiscoveryAttempted
    ) {
      return;
    }
    miningDroidDiscoveryAttempted = true;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `mining-droid discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };
  let grapheneDiscoveryAttempted = false;
  const ensureGrapheneControls = () => {
    if (pageCapture.controls.resolve(GRAPHENE_CONTROL) !== undefined) return;
    const root = pageCapture.rootState.readRoot();
    const race = readProperty(root, "race");
    const interstellar = readProperty(root, "interstellar");
    const plant = readProperty(interstellar, "g_factory");
    const count = readProperty(plant, "count");
    if (
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count < 1 ||
      Boolean(readProperty(race, "truepath")) ||
      Boolean(readProperty(race, "warlord")) ||
      grapheneDiscoveryAttempted
    ) {
      return;
    }
    grapheneDiscoveryAttempted = true;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `graphene discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  let replicatorDiscoveryAttempted = false;
  const ensureReplicatorControls = () => {
    if (
      pageCapture.controls.resolve(REPLICATOR_CONTROL) !== undefined &&
      pageCapture.controls.resolve(GOVERNOR_CONTROL) !== undefined
    )
      return;
    const root = pageCapture.rootState.readRoot();
    const race = readProperty(root, "race");
    const tech = readProperty(root, "tech");
    const techLevel = readProperty(tech, "replicator");
    if (
      !isRecord(readProperty(race, "replicator")) ||
      typeof techLevel !== "number" ||
      !Number.isFinite(techLevel) ||
      techLevel < 1 ||
      replicatorDiscoveryAttempted
    ) {
      return;
    }
    replicatorDiscoveryAttempted = true;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `replicator discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  let factoryDiscoveryAttempted = false;
  let smelterDiscoveryAttempted = false;
  let storageDiscoveryAttempted = false;
  let galaxyMarketDiscoveryAttempted = false;
  let marketDiscoveryAttempted = false;
  const ensureSmelterControls = () => {
    if (pageCapture.controls.resolve(SMELTER_CONTROL) !== undefined) return;
    const city = readProperty(pageCapture.rootState.readRoot(), "city");
    const smelterState = readProperty(city, "smelter");
    const race = readProperty(pageCapture.rootState.readRoot(), "race");
    const count = readProperty(smelterState, "count");
    const exempt =
      Boolean(readProperty(race, "cataclysm")) ||
      Boolean(readProperty(race, "orbit_decayed")) ||
      Boolean(
        readProperty(
          readProperty(pageCapture.rootState.readRoot(), "tech"),
          "isolation",
        ),
      ) ||
      Boolean(readProperty(race, "warlord"));
    if (
      (typeof count !== "number" || !Number.isFinite(count) || count < 1) &&
      !exempt
    ) {
      return;
    }
    if (smelterDiscoveryAttempted) return;
    smelterDiscoveryAttempted = true;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `smelter discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  let naniteDiscoveryAttempted = false;
  const ensureNaniteControls = () => {
    if (pageCapture.controls.resolve(NANITE_CONTROL) !== undefined) return;
    const root = pageCapture.rootState.readRoot();
    const race = readProperty(root, "race");
    const naniteFactory = readProperty(
      readProperty(root, "city"),
      "nanite_factory",
    );
    if (
      !readProperty(race, "deconstructor") ||
      !isRecord(naniteFactory) ||
      naniteDiscoveryAttempted
    ) {
      return;
    }
    naniteDiscoveryAttempted = true;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `nanite discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  let ejectorDiscoveryAttempted = false;
  const ensureEjectorControls = () => {
    if (
      pageCapture.controls
        .capturedElementIds()
        .some((id) => id.startsWith("eject") && id !== EJECTOR_SUMMARY_CONTROL)
    ) {
      return;
    }
    const root = pageCapture.rootState.readRoot();
    const ejector = readProperty(
      readProperty(root, "interstellar"),
      "mass_ejector",
    );
    const count = readProperty(ejector, "count");
    if (
      !isRecord(ejector) ||
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count < 1 ||
      ejectorDiscoveryAttempted
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    ejectorDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.ejector,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `ejector discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  let supplyDiscoveryAttempted = false;
  const ensureSupplyControls = () => {
    if (
      pageCapture.controls
        .capturedElementIds()
        .some((id) => id.startsWith("supply") && id !== SUPPLY_SUMMARY_CONTROL)
    ) {
      return;
    }
    const transport = readProperty(
      readProperty(pageCapture.rootState.readRoot(), "portal"),
      "transport",
    );
    const count = readProperty(transport, "count");
    if (
      !isRecord(transport) ||
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count < 1 ||
      supplyDiscoveryAttempted
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    supplyDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.supply,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `supply discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  const ensureStorageControls = () => {
    if (
      pageCapture.controls.resolve(STORAGE_CONSTRUCTION_CONTROL) !== undefined
    ) {
      return;
    }
    if (storageDiscoveryAttempted) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    if (
      readProperty(
        readProperty(pageCapture.rootState.readRoot(), "settings"),
        "showStorage",
      ) !== true
    ) {
      return;
    }
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    storageDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.storage,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `storage discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  const ensureGalaxyMarketControls = () => {
    if (pageCapture.controls.resolve(GALAXY_MARKET_CONTROL) !== undefined) {
      return;
    }
    if (galaxyMarketDiscoveryAttempted) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const root = pageCapture.rootState.readRoot();
    if (!isRecord(readProperty(readProperty(root, "galaxy"), "trade"))) {
      return;
    }
    if (readProperty(readProperty(root, "settings"), "showMarket") !== true) {
      return;
    }
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    galaxyMarketDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.market,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `galaxy market discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  const ensureMarketControls = () => {
    if (pageCapture.controls.resolve(MARKET_QUANTITY_CONTROL) !== undefined) {
      return;
    }
    if (marketDiscoveryAttempted) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const root = pageCapture.rootState.readRoot();
    if (readProperty(readProperty(root, "settings"), "showMarket") !== true) {
      return;
    }
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    marketDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.market,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `market discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  const ensureFactoryControls = () => {
    if (pageCapture.controls.resolve(FACTORY_CONTROL) !== undefined) return;
    const city = readProperty(pageCapture.rootState.readRoot(), "city");
    const factoryState = readProperty(city, "factory");
    const count = readProperty(factoryState, "count");
    if (
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count < 1 ||
      factoryDiscoveryAttempted
    ) {
      return;
    }
    factoryDiscoveryAttempted = true;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `factory discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };

  let ratioDiscoveryAttempted = false;
  /** The three ratio sliders share the industry panel the droid and graphene plants render into. */
  const ensureRatioControls = (control: string, unlocked: boolean) => {
    if (
      !unlocked ||
      ratioDiscoveryAttempted ||
      pageCapture.controls.resolve(control) !== undefined ||
      pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined
    ) {
      return;
    }
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    ratioDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `production-ratio discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
  };
  const structureCount = (region: string, id: string): number => {
    const value = readProperty(
      readProperty(readProperty(pageCapture.rootState.readRoot(), region), id),
      "count",
    );
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const powerProducers = createCapturedPowerProducerAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
  });
  const powerWarnings = createCapturedPowerWarningAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    getDocument: () => document,
    readSettings: () => settingsStore.readRaw(),
  });
  const smelter = createCapturedSmelterAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const nanite = createCapturedNaniteAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const ejector = createCapturedEjectorAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const supply = createCapturedSupplyAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const factory = createCapturedFactoryAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
  });
  const fleet = createCapturedFleetAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });

  const runCycle = () => {
    demandThisCycle = undefined;
    triggerTargetsThisCycle = undefined;
    triggerDemandThisCycle = undefined;
    progression.resetProjectSample();
    progression.resetBuildingUnlockSample();
    // Drawn before the master-toggle guard below, and before any automation runs: a fresh profile
    // carries no settings at all, so a script that only drew its interface while already enabled
    // could never be switched on.
    settingsPanel.ensurePanel();
    const settings = settingsStore.readRaw();
    if (
      !pageCapture.isComplete() ||
      !isEnabled(settings, "masterScriptToggle")
    ) {
      return;
    }
    // The captured runtime is its own tick loop, so it owns the `tick` phase and the flush the
    // diagnostics adapter counts work ticks against. Without them `window.eaPerformance` records
    // samples on the production path and never emits a single summary.
    const profiling =
      diagnostics?.readPerformanceEnabled() === true ? diagnostics : undefined;
    const workStartedAtMs = profiling?.nowMs();
    try {
      if (isEnabled(settings, "autoTrigger")) {
        // Trigger targets are only the actions whose controls were captured, so the sample the
        // demand model shares has to be taken after construction discovery, not before it.
        progression.ensureBuildControls();
      }
      if (isEnabled(settings, "autoFleet")) {
        const truepath =
          readProperty(
            readProperty(pageCapture.rootState.readRoot(), "race"),
            "truepath",
          ) === true;
        if (truepath) ensureCivicControls();
        else ensureGalaxyFleetControls();
      }
      if (isEnabled(settings, "autoMarket")) {
        ensureMarketControls();
        marketAutomation.run();
      }
      if (isEnabled(settings, "autoGalaxyMarket")) {
        ensureGalaxyMarketControls();
        galaxyMarketAutomation.run();
      }
      if (isEnabled(settings, "autoStorage")) {
        ensureStorageControls();
        storageAutomation.run();
      }
      if (
        isEnabled(settings, "autoBuild") ||
        isEnabled(settings, "buildingAlwaysClick")
      ) {
        gatherResources();
      }
      if (isEnabled(settings, "autoTax")) {
        ensureCivicControls();
        tax.autoTax();
      }
      if (isEnabled(settings, "autoGovernment")) {
        ensureCivicControls();
        runCapturedGovernmentAutomation(government);
      }
      if (isEnabled(settings, "autoHell")) {
        ensureCivicControls();
        hell.run();
      }
      if (isEnabled(settings, "autoMiningDroid")) {
        ensureMiningDroidControls();
        miningDroid.run();
      }
      if (isEnabled(settings, "autoGraphenePlant")) {
        ensureGrapheneControls();
        graphene.run();
      }
      if (isEnabled(settings, "autoReplicator")) {
        ensureReplicatorControls();
        replicator.run();
      }
      if (isEnabled(settings, "autoQuarry")) {
        ensureRatioControls(
          QUARRY_CONTROL,
          Boolean(
            readProperty(
              readProperty(pageCapture.rootState.readRoot(), "race"),
              "smoldering",
            ),
          ) && structureCount("city", "rock_quarry") >= 1,
        );
        ratios.quarry();
      }
      if (isEnabled(settings, "autoMine")) {
        ensureRatioControls(
          TITAN_MINE_CONTROL,
          structureCount("space", "titan_mine") >= 1,
        );
        ratios.titanMine();
      }
      if (isEnabled(settings, "autoExtractor")) {
        ensureRatioControls(
          MINING_SHIP_CONTROL,
          structureCount("tauceti", "mining_ship") >= 1,
        );
        ratios.miningShip();
      }
      if (isEnabled(settings, "autoAlchemy")) {
        ensureAlchemyControls();
        alchemy.run();
      }
      if (isEnabled(settings, "autoPylon")) {
        ensurePylonControls();
        pylon.run();
      }
      const autoJobs = isEnabled(settings, "autoJobs");
      const autoCraftsmen = isEnabled(settings, "autoCraftsmen");
      let combinedJobs = false;
      if (autoJobs && autoCraftsmen) {
        ensureCivicControls();
        combinedJobs = fullJobs.isAvailable();
        if (combinedJobs) runJobsAutomation(fullJobs, false);
      }
      if (autoJobs && !combinedJobs) {
        ensureCivicControls();
        runJobsAutomation(ordinaryJobs, false);
      }
      if (autoCraftsmen && !combinedJobs) {
        ensureCivicControls();
        runJobsAutomation(craftsmen, true);
      }
      if (isEnabled(settings, "autoCraft")) {
        runCraftAutomation(craft);
      }
      // Triggers are commitments: when one of them buys something this cycle, construction and
      // research stand down so they cannot spend what the next trigger is saving for.
      const triggerActive =
        isEnabled(settings, "autoTrigger") &&
        triggerPhaseActive(
          runTriggerAutomation({
            reader: triggerActions.reader,
            executor: triggerActions.executor,
          }),
        );
      if (
        !triggerActive &&
        (isEnabled(settings, "autoBuild") || isEnabled(settings, "autoARPA"))
      ) {
        progression.runConstructionCycle();
      }
      if (isEnabled(settings, "autoNanite")) {
        ensureNaniteControls();
        nanite.run();
      }
      if (isEnabled(settings, "autoSupply")) {
        ensureSupplyControls();
        supply.run();
      }
      if (isEnabled(settings, "autoEject")) {
        ensureEjectorControls();
        ejector.run();
      }
      if (isEnabled(settings, "autoPower")) {
        ensureCityControls();
        powerProducers.run();
        powerWarnings.run();
      }
      if (isEnabled(settings, "autoSmelter")) {
        ensureSmelterControls();
        smelter.run();
      }
      if (isEnabled(settings, "autoFactory")) {
        ensureFactoryControls();
        factory.run();
      }
      if (isEnabled(settings, "autoFleet")) {
        const truepath =
          readProperty(
            readProperty(pageCapture.rootState.readRoot(), "race"),
            "truepath",
          ) === true;
        if (!truepath) {
          ensureGalaxyFleetControls();
          runFleetAutomation({
            reader: fleet.reader,
            executor: fleet.executor,
          });
        }
      }
      if (!triggerActive && isEnabled(settings, "autoResearch")) {
        progression.runResearchCycle();
      }
    } catch (error) {
      logError(String(error));
    } finally {
      if (profiling !== undefined && workStartedAtMs !== undefined) {
        profiling.recordPerformance(
          "tick",
          profiling.nowMs() - workStartedAtMs,
        );
        profiling.flushPerformance();
      }
    }
  };

  // The game wakes the script on every completed period; `tickRate` decides how many of those one
  // working cycle covers. Without this gate every automation decision, and every panel draw a cycle
  // pays for, was re-made four times more often than the setting asks for.
  let pendingPeriods = 0;
  return pageCapture.periods.subscribe((period) => {
    const gate = advancePeriodGate({
      pendingPeriods,
      completedPeriods: period.periods,
      periodsPerCycle: readPeriodsPerScriptCycle(settingsStore.readRaw()),
    });
    pendingPeriods = gate.pendingPeriods;
    if (!gate.run) return;
    runCycle();
  });
}
