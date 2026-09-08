import { createCapturedProgressionControl } from "./captured-progression-control.ts";
import { runCraftAutomation } from "../application/craft.ts";
import { runJobsAutomation } from "../application/jobs.ts";
import { createCapturedGatherResourcesControl } from "./captured-gather-resources-control.ts";
import { createCapturedTaxControl } from "./captured-tax-control.ts";
import { createCapturedCraftsmenAutomation } from "../adapters/evolve/civic/captured-craftsmen.ts";
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
import { createCapturedResourceDemand } from "../adapters/evolve/economy/resources/captured-resource-demand.ts";
import { createCapturedResourceSource } from "../adapters/evolve/captured-world-state.ts";
import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import { createCapturedQueueReservationSource } from "../adapters/evolve/captured-queue-reservations.ts";
import {
  createCapturedProductionRatios,
  MINING_SHIP_CONTROL,
  QUARRY_CONTROL,
  TITAN_MINE_CONTROL,
} from "../adapters/evolve/economy/resources/captured-production-ratios.ts";
import { createCapturedCraftCosts } from "../adapters/evolve/economy/production/captured-craft-costs.ts";
import {
  createCapturedCraftExecutor,
  createCapturedCraftReader,
  type CraftingDocument,
} from "../adapters/evolve/economy/production/captured-crafting.ts";
import { createGameDrawnActionsReader } from "../adapters/browser/game-drawn-actions.ts";
import { createGameDrawnProjectsReader } from "../adapters/browser/game-drawn-projects.ts";
import { createGamePanelWorkspace } from "../adapters/browser/game-panel-workspace.ts";
import {
  createCapturedTabDiscovery,
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
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
  readonly diagnostics?: TickDiagnostics | undefined;
  readonly logError?: (message: string) => void;
}

function readStoredSettings(storageValue: unknown): Record<string, unknown> {
  if (!isRecord(storageValue)) return {};
  const getItem = readProperty(storageValue, "getItem");
  if (typeof getItem !== "function") return {};
  const raw = Reflect.apply(getItem, storageValue, ["settings"]);
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const DEFAULT_SETTINGS: Readonly<Record<string, boolean>> = Object.freeze({
  masterScriptToggle: true,
  autoBuild: false,
  autoARPA: false,
  autoResearch: false,
  autoTax: false,
  autoMiningDroid: false,
  autoGraphenePlant: false,
  autoAlchemy: false,
  autoCraft: false,
  autoQuarry: false,
  autoMine: false,
  autoExtractor: false,
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
  const reported = new Set<string>();
  const reportOnce = (message: string) => {
    if (reported.has(message)) return;
    reported.add(message);
    logError(message);
  };
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
    readSettings: () => readStoredSettings(storage),
    // Reported once per distinct reason: a candidate the cycle cannot price or a catalog it cannot
    // read is otherwise dropped in silence, which is how a composition gap survives a whole session.
    onSkipped: (key, reason) =>
      reportOnce(`progression skipped ${key}: ${reason}`),
    onUnavailable: (reason) => reportOnce(`progression unavailable: ${reason}`),
    diagnostics,
  });
  const gatherResources = createCapturedGatherResourcesControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => readStoredSettings(storage),
  });
  const tax = createCapturedTaxControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => readStoredSettings(storage),
    nowMs: () => Date.now(),
  });
  const craftsmen = createCapturedCraftsmenAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => readStoredSettings(storage),
  });
  const pylon = createCapturedPylonAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => readStoredSettings(storage),
  });
  const alchemy = createCapturedAlchemyAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => readStoredSettings(storage),
  });
  const miningDroid = createCapturedMiningDroidAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => readStoredSettings(storage),
  });
  const graphene = createCapturedGrapheneAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
  });
  // The demand sample is planned at most once per cycle and shared by everything that reads it.
  // Its reservation source is the player's build queue only: pricing the research queue needs the
  // offered-technology catalog, and that discovery pass belongs to the construction cycle.
  const demand = createCapturedResourceDemand({
    rootState: pageCapture.rootState,
    savingTarget: progression.savingTarget,
    reservations: createCapturedQueueReservationSource({
      rootState: pageCapture.rootState,
      resources: createCapturedResourceSource(pageCapture.rootState),
      costs: createCapturedActionCostReader({
        rootState: pageCapture.rootState,
        controls: pageCapture.controls,
      }),
    }),
    readSettings: () => readStoredSettings(storage),
  });
  let demandThisCycle: ReturnType<typeof demand.sample> | undefined;
  const ratios = createCapturedProductionRatios({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => readStoredSettings(storage),
    readDemand: () => (demandThisCycle ??= demand.sample()),
  });
  let completedPeriods = 1;
  const craftDependencies = {
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs: createCapturedCraftCosts({
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    }),
    getDocument: () => document,
    readSettings: () => readStoredSettings(storage),
    readPeriods: () => completedPeriods,
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
        index: 2,
      }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `civic discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
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
        index: 1,
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
    const marketTabs = SUB_TAB_CONTROLS.marketTabs;
    if (marketTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: 4,
      }),
      Object.freeze({ setting: "marketTabs", control: marketTabs, index: 4 }),
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
    const govTabs = SUB_TAB_CONTROLS.govTabs;
    if (govTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: 2,
      }),
      Object.freeze({ setting: "govTabs", control: govTabs, index: 1 }),
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
    const govTabs = SUB_TAB_CONTROLS.govTabs;
    if (govTabs === undefined) return;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: 2,
      }),
      Object.freeze({ setting: "govTabs", control: govTabs, index: 1 }),
    ]);
    if (result.outcome.status !== "succeeded") {
      logError(
        `graphene discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
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
    const govTabs = SUB_TAB_CONTROLS.govTabs;
    if (govTabs === undefined) return;
    ratioDiscoveryAttempted = true;
    const result = civicDiscovery.discover([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: 2,
      }),
      Object.freeze({ setting: "govTabs", control: govTabs, index: 1 }),
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

  const runCycle = () => {
    demandThisCycle = undefined;
    const settings = readStoredSettings(storage);
    if (
      !pageCapture.isComplete() ||
      !isEnabled(settings, "masterScriptToggle")
    ) {
      return;
    }
    try {
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
      if (isEnabled(settings, "autoMiningDroid")) {
        ensureMiningDroidControls();
        miningDroid.run();
      }
      if (isEnabled(settings, "autoGraphenePlant")) {
        ensureGrapheneControls();
        graphene.run();
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
      if (isEnabled(settings, "autoCraftsmen")) {
        ensureCivicControls();
        runJobsAutomation(craftsmen, true);
      }
      if (isEnabled(settings, "autoCraft")) {
        runCraftAutomation(craft);
      }
      if (isEnabled(settings, "autoBuild") || isEnabled(settings, "autoARPA")) {
        progression.runConstructionCycle();
      }
      if (isEnabled(settings, "autoResearch")) {
        progression.runResearchCycle();
      }
    } catch (error) {
      logError(String(error));
    }
  };

  return pageCapture.periods.subscribe((period) => {
    completedPeriods = period.periods;
    runCycle();
  });
}
