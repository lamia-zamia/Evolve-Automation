/**
 * Production composition for the captured build and research families.
 *
 * This seam owns adapter assembly for the captured tick path. The runtime selects it only after
 * document-start capture is complete. It deliberately shares the offered technology reader so a
 * construction reservation sample and a research plan describe one draw.
 */

import { createCapturedResourceSource } from "../adapters/evolve/captured-world-state.ts";
import {
  createDiscoveryScopeCache,
  sameOfferPrices,
} from "../adapters/evolve/discovery-scope-cache.ts";
import { createProgressionEpochReader } from "../adapters/evolve/progression-epoch.ts";
import { finite, isRecord, readProperty } from "../adapters/validation.ts";
import { costFitsStorage } from "../adapters/evolve/captured-affordability.ts";
import {
  createCapturedTabDiscovery,
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_PANELS,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SPACE_TAB_SHOWN_BY,
  SPACE_TAB_SWEEP,
  SUB_TAB_CONTROLS,
} from "../adapters/evolve/captured-tab-discovery.ts";
import {
  createScriptKnowledgeGateReader,
  createScriptStorageRequirementReader,
} from "../adapters/evolve/script-build-gates.ts";
import { createScriptCostReservationSource } from "../adapters/evolve/script-cost-reservations.ts";
import { createScriptBuildPolicyReader } from "../adapters/evolve/progression/build/script-build-policy.ts";
import { createCapturedTechCatalog } from "../adapters/evolve/progression/research/captured-tech-catalog.ts";
import { createCapturedProjectCatalog } from "../adapters/evolve/progression/research/captured-project-catalog.ts";
import {
  createCapturedBuildPolicyReader,
  type CapturedBuildPolicyDependencies,
} from "../adapters/evolve/progression/build/captured-build-policy.ts";
import { createCapturedKnowledgeReader } from "../adapters/evolve/progression/build/captured-knowledge-gate.ts";
import { createCapturedConstructionControl } from "./captured-construction-control.ts";
import { createCapturedResearchControl } from "./captured-research-control.ts";
import { SAVING_CONFLICT_CAUSE } from "../domain/progression/build/build.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type { CostReservationSource } from "../ports/game-cost-reservations.ts";
import type { GameActionCostReader } from "../ports/game-action-costs.ts";
import type { ConstructionObservations } from "../ports/game-construction-observations.ts";
import type { InterfaceSettingsState } from "../domain/interface-settings.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameActivitySink } from "../ports/game-message-log.ts";
import type { GameBuildTarget } from "../ports/game-build-targets.ts";
import type { GameDrawnActionsReader } from "../ports/game-drawn-actions.ts";
import type {
  BuildingUnlockCatalog,
  BuildingUnlockSample,
} from "../ports/game-building-unlocks.ts";
import { createCapturedBuildingUnlocks } from "../adapters/evolve/progression/build/captured-building-unlocks.ts";
import { createCapturedBuildingSwitchStates } from "../adapters/evolve/progression/build/captured-building-switch-states.ts";
import type { CapturedArpaMechanics } from "../ports/captured-arpa-mechanics.ts";
import type { GameMountSuppression } from "../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { CapturedGameMechanics } from "../ports/captured-game-mechanics.ts";
import type { VueBindingObserver } from "../adapters/evolve/vue-capture.ts";
import type { GameKeyboardHandlersPort } from "../ports/game-keyboard-handlers.ts";
import type { GameKeyStateReader } from "../ports/game-key-state.ts";
import type {
  GameProjectCatalog,
  OfferedProject,
} from "../ports/game-project-catalog.ts";
import type {
  OfferedTech,
  TechCatalogSnapshot,
} from "../ports/game-tech-catalog.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import type { BuildResourceScope } from "../domain/progression/build/build.ts";
import { createCapturedBuildCapacity } from "../adapters/evolve/captured-build-capacity.ts";
import { createCapturedMechReservationSource } from "../adapters/evolve/combat/captured-mech-reservations.ts";
import { createCapturedMechDemandSource } from "../adapters/evolve/combat/captured-mech-demand.ts";
import type { CapturedMechDemandSource } from "../ports/captured-mech.ts";
import { CAPTURED_MECH_BUILDINGS } from "../adapters/evolve/progression/build/captured-building-metadata.ts";

export interface CapturedProgressionControlDependencies {
  readonly readMechPowerSupplyHold?: () => boolean | undefined;
  readonly rootState: GameRootStateSource;
  /** Retained native action mechanics used as Building offer authority. */
  readonly mechanics: CapturedGameMechanics;
  readonly controls: GameControlRegistry;
  readonly bindings: VueBindingObserver;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  /** Native queue-key events and observed key state for the semantic build-capacity probe. */
  readonly keyboard?: GameKeyboardHandlersPort;
  readonly keyState?: GameKeyStateReader;
  readonly drawnActions: GameDrawnActionsReader;
  /** The running bundle's own A.R.P.A. project mechanics, captured by the project catalog. */
  readonly arpa: CapturedArpaMechanics;
  /** Prices captured mission controls for the build weighting adapter. */
  readonly costs?: GameActionCostReader;
  /** Persisted script settings. Required: without them nothing is managed and nothing is built. */
  readonly readSettings: () => unknown;
  /** Optional shared authority for construction presentation; omitted callers use readSettings. */
  readonly readInterfacePresentationSettings?: () => Readonly<InterfaceSettingsState>;
  /** Whether the current processed cycle is due for State Log planner details. */
  readonly readStateLogPlannerDetailsDue?: () => boolean;
  /** Commitments that outrank Mech-first construction, excluding the previous saving target. */
  readonly readReservedQuantityForMechPriority?: (resourceId: string) => number;
  /**
   * Whether this cycle's research pass has to keep the already-granted half of the draw, which is
   * the larger part of it. Omitted means no caller needs it, so the pass drops that half.
   */
  readonly needGrantedTechs?: () => boolean;
  /**
   * Compatibility script inputs. The captured path plans its own build policy and uses its typed
   * Mech-first reservation; absent legacy state/resource access still leaves the Knowledge gate
   * ungated and storage requirements unknown.
   */
  readonly getBuildingManager?: () => unknown;
  readonly getState?: () => unknown;
  readonly getResources?: () => unknown;
  /**
   * Captured storage requirements, from the same commitments the demand sample plans over. Absent
   * for a caller with no demand sample; the cycle then leaves storage requirements unknown, which
   * is not the same as zero.
   */
  readonly readCapturedStorageRequired?: (
    resourceIds: readonly string[],
    resourceScopes?: readonly BuildResourceScope[],
  ) => Readonly<Record<string, number>> | undefined;
  /** Injected clock for discovery scopes that still retain drawn samples. */
  readonly nowMs: () => number;
  readonly diagnostics?: TickDiagnostics | undefined;
  /** Reports candidate and executor diagnostics when explicitly enabled by the caller. */
  readonly onDiagnostic?: (message: string) => void;
  /** Reports successful captured activity after the game state changed. */
  readonly onActivity?: GameActivitySink;
  readonly onSkipped?: (key: string, reason: string) => void;
  readonly onUnavailable?: (reason: string) => void;
}

export interface CapturedProgressionControl {
  /** Current progression epoch, for retrying conditional discoveries after a game-state change. */
  readonly readProgressionEpoch: () => string;
  /** Clears prior offer observations and discovery scopes for one processed cycle. */
  readonly beginProcessedCycle: () => void;
  readonly runConstructionCycle: () => CommandExecutionOutcome;
  readonly establishConstructionOrdering: () => boolean;
  readonly runResearchCycle: () => CommandExecutionOutcome;
  /** The most recently captured offered-technology snapshot, if one exists. */
  readonly readOfferedTechs: () => readonly Readonly<OfferedTech>[] | undefined;
  /** Take or reuse the current offer snapshot, running a grant pass when one is required. */
  readonly sampleOfferedTechs: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  /**
   * The granted-technology set from the last catalog pass, or `undefined` when that pass did not
   * keep it. Absent is "not read", never "nothing granted".
   */
  readonly readGrantedTechs: () => ReadonlySet<string> | undefined;
  /** A fresh captured A.R.P.A. project snapshot, if it can be read. */
  readonly readProjects: () => readonly Readonly<OfferedProject>[] | undefined;
  /** Reads current fields and prices from the established native catalog without redrawing a panel. */
  readonly readEstablishedProjects: () =>
    readonly Readonly<OfferedProject>[] | undefined;
  /**
   * Drops the shared A.R.P.A. sample so the next reader takes a fresh one. The trigger phase
   * prices project triggers from this same sample before construction runs, so it is reset once
   * per cycle rather than only after a construction run — otherwise a cycle that skips
   * construction would keep repricing from the previous cycle's panel.
   */
  readonly resetProjectSample: () => void;
  /**
   * Reads native semantic availability for the named regions and establishes that current offer
   * observation. It does not draw a panel.
   */
  readonly readBuildingUnlocks: (
    regions: ReadonlySet<string>,
  ) => Readonly<BuildingUnlockSample> | undefined;
  /** One fresh catalog covering all requested regions; never discovers or joins samples. */
  readonly readEstablishedBuildingUnlocks: (
    regions: ReadonlySet<string>,
  ) => Readonly<BuildingUnlockSample> | undefined;
  /** Existing fresh catalog availability; never draws a tab to answer Power. */
  readonly readCapturedBuildingUnlocked: (
    actionId: string,
    region: string,
  ) => boolean | undefined;
  /** Drops the shared building-unlock sample, for the same reason as the A.R.P.A. one. */
  readonly resetBuildingUnlockSample: () => void;
  /** Construction changed offers without necessarily changing the progression epoch. */
  readonly invalidateConstructionOffers: () => void;
  /** What the last construction cycle was saving for, for the features that read demand. */
  readonly observations: ConstructionObservations;
  /** Managed captured construction targets, used by production modes that weight against builds. */
  readonly readManagedBuildTargets: () => readonly Readonly<GameBuildTarget>[];
  /** Currently offered and managed construction targets used by Storage capacity planning. */
  readonly readUnlockedStorageBuildTargets: () => readonly Readonly<GameBuildTarget>[];
  /** Reads the owning phase's established offer catalog without discovering Building panels. */
  readonly readEstablishedStorageBuildTargets: () =>
    readonly Readonly<GameBuildTarget>[] | undefined;
  /** Whether the compatibility Mech loop would wait for a bay or purifier expansion. */
  readonly readCanExpandMechBay: () => boolean | undefined;
  /** Shared target used by global resource demand and construction reservations. */
  readonly mechDemand: CapturedMechDemandSource;
  /**
   * The Knowledge the most expensive offered technology costs, from the knowledge gate's own
   * sample. 0 when no catalog has been read.
   */
  readonly readKnowledgeRequiredByTechs: () => number;
  /**
   * Discovers the construction action controls for shown space tabs, for features that act on
   * build actions without running the construction cycle.
   */
  readonly ensureBuildControls: () => void;
  /** The game's own answer to whether one more copy of each named building can be queued. */
  readonly readBuildingCapacity: (
    actionIds: ReadonlySet<string>,
  ) => ReadonlyMap<string, boolean | undefined>;
}

/** Research and A.R.P.A. offers still need discovery scopes; Building offers use mechanics. */
const RESEARCH_SCOPE = "research";
const RESEARCH_GRANTED_SCOPE = "research+granted";
const ARPA_SCOPE = "arpa";
/** The one-off sweep that makes the civilization sub-tabs bind their build controls. */
const BUILD_CONTROLS_SCOPE = "build-controls";

const NO_RESERVATIONS = Object.freeze({
  targets: Object.freeze([]),
  unavailable: false,
});

/** Before the construction cycle exists, spending readers must fail closed. */
const NO_OBSERVATIONS: ConstructionObservations = Object.freeze({
  hasCompletedOrdering: () => false,
  readSavingTarget: () => {
    throw new TypeError("construction saving order is not established");
  },
  readKnowledgeRequirement: () => 0,
  readPlannerSnapshot: () => null,
  readStateLogSnapshot: () => null,
});

/** Both sets are in force at once; either being unpriceable makes the whole set incomplete. */
function combineReservations(
  first: CostReservationSource,
  second: CostReservationSource,
): CostReservationSource {
  return Object.freeze({
    readReservations() {
      const left = first.readReservations();
      const right = second.readReservations();
      return Object.freeze({
        unavailable: left.unavailable || right.unavailable,
        ...((left.unavailableReason ?? right.unavailableReason) === undefined
          ? {}
          : {
              unavailableReason:
                left.unavailableReason ?? right.unavailableReason,
            }),
        targets: Object.freeze([...left.targets, ...right.targets]),
      });
    },
  });
}

export function createCapturedProgressionControl(
  dependencies: CapturedProgressionControlDependencies,
): CapturedProgressionControl {
  const {
    rootState,
    mechanics,
    controls,
    bindings,
    mountSuppression,
    panels,
    drawnActions,
    arpa,
    getBuildingManager,
    readSettings,
    getState,
    getResources,
    nowMs,
    diagnostics,
  } = dependencies;
  const readFallbackInterfacePresentation =
    dependencies.readInterfacePresentationSettings ??
    (() => {
      const settings = readSettings();
      return Object.freeze({
        activeTargetsUI: readProperty(settings, "activeTargetsUI") === true,
        buildPlannerUI: readProperty(settings, "buildPlannerUI") === true,
      });
    });
  const onDiagnostic = dependencies.onDiagnostic;
  const onActivity = dependencies.onActivity;
  const onSkipped = dependencies.onSkipped;
  const onUnavailable = dependencies.onUnavailable;
  const resources = createCapturedResourceSource(rootState);
  const discovery = createCapturedTabDiscovery({
    rootState,
    controls,
    mountSuppression,
    panels,
    diagnostics,
  });
  // Research and A.R.P.A. offer samples may be reused within their discovery scopes. Building
  // offers are read directly from retained native mechanics for each owning observation.
  const epoch = createProgressionEpochReader(rootState);
  const buildCapacity =
    dependencies.keyboard === undefined || dependencies.keyState === undefined
      ? undefined
      : createCapturedBuildCapacity({
          rootState,
          controls,
          panels,
          mountSuppression,
          keyboard: dependencies.keyboard,
          keyState: dependencies.keyState,
          readEpoch: epoch.read,
          nowMs,
          diagnostics,
        });
  const scopes = createDiscoveryScopeCache({
    readEpoch: epoch.read,
    nowMs,
    diagnostics,
  });
  /**
   * The space tabs worth a pass: the game is showing them. Each tab owns a separate progression
   * scope below, so a new offer reopens that tab without making the others pay the draw.
   */
  const shownSpaceTabs = (): readonly number[] => {
    const gameSettings = readProperty(rootState.readRoot(), "settings");
    return SPACE_TAB_SWEEP.filter((index) => {
      const shownBy = SPACE_TAB_SHOWN_BY[index];
      return (
        shownBy !== undefined && readProperty(gameSettings, shownBy) === true
      );
    });
  };
  /** One explicit pass over a shown space tab. */
  const sweepBuildControls = (index: number): string => {
    const spaceTabControl = SUB_TAB_CONTROLS[SPACE_TABS_SETTING];
    if (spaceTabControl === undefined) {
      onSkipped?.("build-discovery", "space-tab control is unavailable");
      return "unavailable";
    }
    const main = Object.freeze({
      setting: MAIN_TAB_SETTING,
      control: MAIN_TAB_CONTROL,
      index: MAIN_TAB_INDEX.civilization,
    });
    const report = (result: { readonly outcome: CommandExecutionOutcome }) => {
      if (result.outcome.status === "succeeded") return true;
      onSkipped?.(
        "build-discovery",
        result.outcome.failure?.message ?? result.outcome.status,
      );
      return false;
    };
    // The component render creates the region container and lets `vBind` bind native action
    // controls. This guarded sweep exists for mutation and on_cap capabilities, not offer reads.
    const civilizationPanel = MAIN_TAB_PANELS[MAIN_TAB_INDEX.civilization];
    if (civilizationPanel === undefined) {
      onSkipped?.("build-discovery", "civilization panel is unavailable");
      return "unavailable";
    }
    const result = discovery.discover(
      Object.freeze([
        main,
        Object.freeze({
          setting: SPACE_TABS_SETTING,
          control: spaceTabControl,
          index,
        }),
      ]),
      { mount: Object.freeze([`#${civilizationPanel}`]) },
    );
    return report(result) ? result.discovered.join(",") : "failed";
  };
  const ensureBuildControls = () => {
    if (controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    for (const index of shownSpaceTabs()) {
      scopes.read(
        `${BUILD_CONTROLS_SCOPE} ${index}`,
        () => sweepBuildControls(index),
        (previous, next) => previous === next,
      );
    }
  };
  // The catalog a discovery pass already paid for, shared with the Knowledge gate so it never buys
  // one of its own. It is cleared at the start of every processed cycle.
  let lastOffered: readonly Readonly<OfferedTech>[] | undefined;
  // The already-granted half is only drawn when a configured trigger needs it, so this stays
  // undefined — "not read" — for every player who has not configured one.
  let lastGranted: ReadonlySet<string> | undefined;
  let offeredSampleAttempted = false;
  let grantedSampleAttempted = false;
  let offeredSampleEpoch: string | undefined;
  let heldOfferedSnapshot: Readonly<TechCatalogSnapshot> | undefined;
  const clearResearchSample = () => {
    lastOffered = undefined;
    lastGranted = undefined;
    offeredSampleAttempted = false;
    grantedSampleAttempted = false;
    offeredSampleEpoch = undefined;
    heldOfferedSnapshot = undefined;
  };
  const heldOfferBindingsAreCurrent = (
    snapshot: Readonly<TechCatalogSnapshot>,
  ): boolean =>
    snapshot.offered.every(
      (offer) =>
        (controls.resolve(offer.elementId)?.generation ?? 0) ===
        offer.generation,
    );
  const invalidateStaleCapturedResearchObservation = (currentEpoch: string) => {
    // Research completion changes the progression epoch; a redraw can also rebind an offer row
    // without a detectable epoch change. Either means the held catalog no longer names live offers.
    const epochChanged =
      offeredSampleEpoch !== undefined && offeredSampleEpoch !== currentEpoch;
    const rowBindingsChanged =
      heldOfferedSnapshot !== undefined &&
      !heldOfferBindingsAreCurrent(heldOfferedSnapshot);
    if (!epochChanged && !rowBindingsChanged) return;
    clearResearchSample();
    offeredSampleEpoch = currentEpoch;
    scopes.invalidate(RESEARCH_SCOPE);
    scopes.invalidate(RESEARCH_GRANTED_SCOPE);
  };
  const readCurrentOfferedTechs = () => {
    invalidateStaleCapturedResearchObservation(epoch.read());
    return lastOffered;
  };
  const sampleOfferedTechs = () => {
    const includeGranted = dependencies.needGrantedTechs?.() === true;
    const currentEpoch = epoch.read();
    invalidateStaleCapturedResearchObservation(currentEpoch);
    if (offeredSampleEpoch === undefined) offeredSampleEpoch = currentEpoch;
    // A later caller may need the granted half after the first offer-only read. It is a separate
    // sample by design; never repeat it once that attempt (including a failed one) has happened.
    const needsGrantedSample = includeGranted && !grantedSampleAttempted;
    if (offeredSampleAttempted && !needsGrantedSample) {
      if (heldOfferedSnapshot === undefined) {
        lastOffered = undefined;
        lastGranted = undefined;
        return undefined;
      }
      const value = offered.restate(heldOfferedSnapshot);
      lastOffered = value.offered;
      lastGranted = value.granted;
      return value.offered;
    }
    // The granted half is a different sample, so it is a different scope: a pass that dropped it
    // must never answer the caller that asked for it.
    const held = scopes.read(
      includeGranted ? RESEARCH_GRANTED_SCOPE : RESEARCH_SCOPE,
      () => offered.read(includeGranted ? { includeGranted } : undefined),
      (previous, next) => sameOfferPrices(previous.offered, next.offered),
    );
    offeredSampleAttempted = true;
    offeredSampleEpoch = currentEpoch;
    if (includeGranted) grantedSampleAttempted = true;
    if (held !== undefined) {
      // The only part of a held snapshot that goes stale on its own: the game rebinds an action
      // whenever it redraws the panel — the player opening the Research tab is enough — and the
      // capture records that without being asked. Re-resolving beats re-drawing.
      const value = offered.restate(held);
      heldOfferedSnapshot = held;
      lastOffered = value.offered;
      lastGranted = value.granted;
      return value.offered;
    }
    // A failed current sample must not let the previous pass answer a context-dependent condition.
    heldOfferedSnapshot = undefined;
    lastOffered = undefined;
    lastGranted = undefined;
    return undefined;
  };
  const offered = createCapturedTechCatalog({
    rootState,
    discovery,
    drawnActions,
    bindings,
    controls,
    mechanics,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
  const projectCatalog: GameProjectCatalog = createCapturedProjectCatalog({
    rootState,
    mechanics: arpa,
    ...(onSkipped === undefined
      ? {}
      : { onUnavailable: (reason: string) => onSkipped("arpa", reason) }),
    ...(onDiagnostic === undefined
      ? {}
      : {
          onDiagnostic: (reason: string) =>
            onDiagnostic(`progression diagnostic arpa: ${reason}`),
        }),
  });
  // One sample per processed cycle keeps Trigger and established readers on the same list. That
  // cycle invalidates this cheap native read because ARPA progress can change without a price change;
  // after initial capture, refreshing it reads retained functions, not panels.
  let projectSampled = false;
  let lastProjects: readonly Readonly<OfferedProject>[] | undefined;
  let establishedProjectEpoch: string | undefined;
  const resetProjectSample = () => {
    projectSampled = false;
    lastProjects = undefined;
    establishedProjectEpoch = undefined;
  };
  const beginProcessedCycle = () => {
    clearResearchSample();
    scopes.invalidate(RESEARCH_SCOPE);
    scopes.invalidate(RESEARCH_GRANTED_SCOPE);
    scopes.invalidate(ARPA_SCOPE);
    resetProjectSample();
    resetBuildingUnlockSample();
  };
  // Every field of a row now comes from live game state, so an established sample and a fresh one
  // are the same read; the scope only decides whether a caller may reuse the current cycle's sample.
  const readEstablishedProjects = () => {
    if (projectSampled && establishedProjectEpoch !== epoch.read())
      return undefined;
    const establishedProjects = projectSampled
      ? lastProjects
      : scopes.peek<readonly Readonly<OfferedProject>[]>(ARPA_SCOPE);
    if (establishedProjects === undefined) return undefined;
    const currentProjects = projectCatalog.readProjects();
    if (currentProjects === undefined) {
      lastProjects = undefined;
      scopes.invalidate(ARPA_SCOPE);
      return undefined;
    }
    if (!projectSampled) {
      projectSampled = true;
      establishedProjectEpoch = epoch.read();
    }
    lastProjects = currentProjects;
    return currentProjects;
  };
  const readProjects = () => {
    if (!projectSampled) {
      projectSampled = true;
      establishedProjectEpoch = epoch.read();
      const sampled = scopes.read(
        ARPA_SCOPE,
        () => projectCatalog.readProjects(),
        sameOfferPrices,
      );
      // An unavailable read drops the held offer rather than reusing data the live game could not
      // confirm. A successful sample replaces it with current native state and price.
      lastProjects = sampled;
      if (sampled === undefined) scopes.invalidate(ARPA_SCOPE);
    }
    return lastProjects;
  };
  const buildingUnlocks = createCapturedBuildingUnlocks({
    rootState,
    mechanics,
    controls,
    diagnostics,
    ...(onSkipped === undefined
      ? {}
      : {
          onSkipped: (region: string, reason: string) =>
            onSkipped(`building-unlocks ${region}`, reason),
        }),
  });
  const buildingSwitchStates = createCapturedBuildingSwitchStates({
    rootState,
    controls,
    diagnostics,
  });
  // These semantic snapshots come from one mechanics read each and live only until a processed
  // cycle, root, or Construction invalidation boundary. They never share DiscoveryScopeCache's TTL.
  const establishedBuildingOffers = new Map<
    string,
    Readonly<{
      regions: ReadonlySet<string>;
      epoch: string;
      catalog: Readonly<BuildingUnlockCatalog>;
    }>
  >();
  const buildingOfferScopeKey = (regions: ReadonlySet<string>) =>
    [...regions].sort().join(",");
  const resetBuildingUnlockSample = () => {
    establishedBuildingOffers.clear();
  };
  const invalidateConstructionOffers = () => {
    resetBuildingUnlockSample();
    resetProjectSample();
  };
  rootState.subscribeRootReplaced(() => {
    scopes.invalidateAll();
    clearResearchSample();
    resetProjectSample();
    resetBuildingUnlockSample();
  });
  const readBuildingUnlocks = (regions: ReadonlySet<string>) => {
    const key = buildingOfferScopeKey(regions);
    const catalog = buildingUnlocks.read(regions);
    if (catalog === undefined) {
      // A failed current answer cannot fall back to a prior exact or superset observation for
      // any affected region. Unrelated established regions remain independently readable.
      for (const [establishedKey, sample] of establishedBuildingOffers) {
        if ([...regions].some((region) => sample.regions.has(region))) {
          establishedBuildingOffers.delete(establishedKey);
        }
      }
      return undefined;
    }
    establishedBuildingOffers.delete(key);
    establishedBuildingOffers.set(
      key,
      Object.freeze({
        regions: new Set(regions),
        epoch: epoch.read(),
        catalog,
      }),
    );
    return Object.freeze({
      unlocked: catalog.unlocked,
      regions: catalog.regions,
      switches: new Set(catalog.switches.keys()),
      states: buildingSwitchStates.read(catalog),
    });
  };
  const readEstablishedBuildingUnlocks = (regions: ReadonlySet<string>) => {
    const candidates = [...establishedBuildingOffers.values()].reverse();
    const currentEpoch = epoch.read();
    // One semantic observation answers one compatible region set; independently sampled regions
    // are never combined into a catalog no single mechanics read established.
    for (const exactOnly of [true, false]) {
      for (const sample of candidates) {
        const requestedRegions = sample.regions;
        if (
          (requestedRegions.size === regions.size) !== exactOnly ||
          [...regions].some((region) => !requestedRegions.has(region))
        )
          continue;
        if (sample.epoch !== currentEpoch) continue;
        const catalog = sample.catalog;
        if ([...regions].every((region) => catalog.regions.has(region))) {
          return Object.freeze({
            unlocked: catalog.unlocked,
            regions: catalog.regions,
            switches: new Set(catalog.switches.keys()),
            states: buildingSwitchStates.read(catalog),
          });
        }
      }
    }
    return undefined;
  };
  const readCapturedBuildingUnlocked = (actionId: string, region: string) =>
    readEstablishedBuildingUnlocks(new Set([region]))?.unlocked.has(actionId);
  const readBuildingCapacity = (actionIds: ReadonlySet<string>) => {
    const result = new Map<string, boolean | undefined>();
    for (const actionId of actionIds) {
      result.set(actionId, buildCapacity?.canBuildAnother(actionId));
    }
    return result;
  };
  const readKnowledge = createCapturedKnowledgeReader({
    rootState,
    resources,
    readLastOfferedTechs: () => lastOffered,
    readBuildRequirement: () => readObservations().readKnowledgeRequirement(),
  });
  const createProgressionCapturedPolicy = (
    readCurrentOffers: CapturedBuildPolicyDependencies["readCurrentOffers"],
  ) =>
    createCapturedBuildPolicyReader({
      rootState,
      controls,
      readCurrentOffers,
      getSettings: readSettings,
      readKnowledge,
      ...(dependencies.costs === undefined
        ? {}
        : { costs: dependencies.costs }),
      ...(onSkipped === undefined ? {} : { onSkipped }),
    });
  const readPolicy =
    getBuildingManager === undefined
      ? createProgressionCapturedPolicy(readBuildingUnlocks)
      : createScriptBuildPolicyReader({
          getBuildingManager,
          getSettings: readSettings,
          ...(onSkipped === undefined ? {} : { onSkipped }),
        });
  const readEstablishedBuildPolicy =
    getBuildingManager === undefined
      ? () => {
          let establishedOffersAvailable = true;
          const policy = createProgressionCapturedPolicy((regions) => {
            const catalog = readEstablishedBuildingUnlocks(regions);
            establishedOffersAvailable = catalog !== undefined;
            return catalog;
          })();
          return establishedOffersAvailable ? policy : undefined;
        }
      : readPolicy;
  // The cycle's own saving target is a commitment like any other: without it in force, the cheaper
  // candidates that arrive first spend exactly the resources it is accumulating. It is the previous
  // cycle's judgement, so the target itself is never blocked by it once it becomes affordable —
  // the cycle that finds it affordable stops naming it.
  // Late-bound because the cycle both reads these observations and produces them; the reader is a
  // closure rather than a mutable object so nothing can hold a stale reference to one.
  let readObservations: () => ConstructionObservations = () => NO_OBSERVATIONS;
  const savingReservations: CostReservationSource = Object.freeze({
    readReservations() {
      if (!readObservations().hasCompletedOrdering()) return NO_RESERVATIONS;
      const target = readObservations().readSavingTarget();
      return target === null
        ? NO_RESERVATIONS
        : Object.freeze({
            unavailable: false,
            targets: Object.freeze([
              Object.freeze({
                name: target.name,
                cause: SAVING_CONFLICT_CAUSE,
                ...(target.pool === undefined ? {} : { pool: target.pool }),
                cost: target.cost,
              }),
            ]),
          });
    },
  });
  const stateReservations =
    getState === undefined
      ? undefined
      : createScriptCostReservationSource({ getState });
  // The pursued Mech build reserves its Supply and Soul Gems like any other
  // commitment, so cheaper construction candidates cannot spend them first.
  const mechDemand = createCapturedMechDemandSource({
    ...(dependencies.readMechPowerSupplyHold === undefined
      ? {}
      : { readPowerSupplyHold: dependencies.readMechPowerSupplyHold }),
    rootState,
    controls,
    readSettings,
    readCanExpandBay: () => readEstablishedMechBayExpansion(),
  });
  const mechReservations = createCapturedMechReservationSource({
    demand: mechDemand,
    ...(dependencies.readReservedQuantityForMechPriority === undefined
      ? {}
      : {
          readReservedQuantityForMechPriority:
            dependencies.readReservedQuantityForMechPriority,
        }),
  });
  const queuedAndSaving =
    stateReservations === undefined
      ? savingReservations
      : combineReservations(stateReservations, savingReservations);
  const scriptReservations = combineReservations(
    queuedAndSaving,
    mechReservations,
  );
  const readKnowledgeGate =
    getState === undefined
      ? () => readKnowledge().levels
      : createScriptKnowledgeGateReader({
          getState,
          resources,
          ...(getResources === undefined ? {} : { getResources }),
        });
  const readStorageRequired =
    getResources === undefined
      ? dependencies.readCapturedStorageRequired
      : createScriptStorageRequirementReader({ getResources });
  const construction = createCapturedConstructionControl({
    rootState,
    controls,
    projectCatalog: Object.freeze({ readProjects }),
    arpa,
    readPolicy,
    readSettings,
    readPresentationSettings: readFallbackInterfacePresentation,
    ...(dependencies.readStateLogPlannerDetailsDue === undefined
      ? {}
      : {
          readStateLogPlannerDetailsDue:
            dependencies.readStateLogPlannerDetailsDue,
        }),
    ensureBuildControls,
    scriptReservations,
    readKnowledgeGate,
    ...(readStorageRequired === undefined ? {} : { readStorageRequired }),
    readOfferedTechs: sampleOfferedTechs,
    ...(onDiagnostic === undefined ? {} : { onDiagnostic }),
    ...(onActivity === undefined ? {} : { onActivity }),
    ...(onSkipped === undefined ? {} : { onSkipped }),
    diagnostics,
  });
  const research = createCapturedResearchControl({
    rootState,
    mechanics,
    controls,
    bindings,
    readSettings,
    drawnActions,
    mountSuppression,
    panels,
    readOfferedTechs: sampleOfferedTechs,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
    ...(onActivity === undefined ? {} : { onActivity }),
    diagnostics,
  });

  readObservations = () => construction.observations;

  const readManagedBuildTargets = () => {
    ensureBuildControls();
    return readPolicy().buildings;
  };
  const readEstablishedStorageBuildTargets = () => {
    const gameSettings = readProperty(rootState.readRoot(), "settings");
    // Lazy game starts have not initialized the main-tab setting, so the captured build policy is
    // not established yet. This gate does not determine semantic offer membership.
    if (
      !isRecord(gameSettings) ||
      typeof gameSettings[MAIN_TAB_SETTING] !== "number"
    ) {
      return undefined;
    }
    const policy = readEstablishedBuildPolicy();
    if (policy === undefined) return undefined;
    const targets = policy.buildings;
    // The captured policy reads one authoritative semantic region catalog and filters its own
    // candidates through it. A manager-provided policy needs that established catalog rechecked;
    // narrowing the request mid-read would swap its authority.
    if (getBuildingManager === undefined) return targets;
    if (targets.length === 0) return targets;
    const regions = new Set(targets.map((target) => target.region));
    const offers = readEstablishedBuildingUnlocks(regions);
    if (offers === undefined) return undefined;
    return Object.freeze(
      targets.filter(
        (target) =>
          offers.regions.has(target.region) &&
          offers.unlocked.has(target.elementId),
      ),
    );
  };
  const readUnlockedStorageBuildTargets = () => {
    const gameSettings = readProperty(rootState.readRoot(), "settings");
    if (
      !isRecord(gameSettings) ||
      typeof gameSettings[MAIN_TAB_SETTING] !== "number"
    )
      return Object.freeze([]);
    ensureBuildControls();
    const targets = readPolicy().buildings;
    // The captured policy needs every candidate region at once; a narrower semantic sample would
    // leave later established reads without compatible coverage.
    if (getBuildingManager !== undefined && targets.length > 0)
      readBuildingUnlocks(new Set(targets.map((target) => target.region)));
    return readEstablishedStorageBuildTargets() ?? Object.freeze([]);
  };

  /**
   * Mirrors `src/adapters/evolve/combat/mech.ts`'s `canExpandBay` gate using captured facts. The
   * game owns the semantic offer and adjusted price; managed targets own the script's auto-build
   * switches and cap, `checkAffordable(..., true)` is shared as `costFitsStorage`, and purifier
   * switch state comes from the root plus its captured native `on_cap()` control.
   */
  function readCanExpandMechBay(): boolean | undefined {
    return readCapturedMechBayExpansion(false);
  }

  function readEstablishedMechBayExpansion(): boolean | undefined {
    return readCapturedMechBayExpansion(true);
  }

  function readCapturedMechBayExpansion(
    establishedOnly: boolean,
  ): boolean | undefined {
    const settings = readSettings();
    if (!isRecord(settings)) return undefined;
    if (settings["autoBuild"] !== true || settings["mechBaysFirst"] !== true) {
      return false;
    }
    const targets = establishedOnly
      ? readEstablishedStorageBuildTargets()
      : readManagedBuildTargets();
    const offers = establishedOnly
      ? readEstablishedBuildingUnlocks(
          new Set([CAPTURED_MECH_BUILDINGS.region]),
        )
      : readBuildingUnlocks(new Set([CAPTURED_MECH_BUILDINGS.region]));
    if (
      targets === undefined ||
      offers === undefined ||
      !offers.regions.has(CAPTURED_MECH_BUILDINGS.region)
    ) {
      return undefined;
    }
    const root = rootState.readRoot();
    if (!isRecord(root)) return undefined;
    const targetCanBuild = (elementId: string): boolean | undefined => {
      if (settings[`bat${elementId}`] === false) return false;
      if (!offers.unlocked.has(elementId)) return false;
      const target = targets.find((entry) => entry.elementId === elementId);
      if (target === undefined) return undefined;
      const structure = readProperty(
        readProperty(root, target.region),
        target.id,
      );
      const count = finite(readProperty(structure, "count"));
      if (count === undefined || count < 0) return undefined;
      return count < target.maximum;
    };
    const bayCanBuild = targetCanBuild(CAPTURED_MECH_BUILDINGS.bay);
    if (bayCanBuild !== true) return bayCanBuild;
    const bayPrice = dependencies.costs?.readCost(CAPTURED_MECH_BUILDINGS.bay);
    if (bayPrice === undefined) return undefined;
    const bayFits = costFitsStorage(root, bayPrice.cost, {
      pool: bayPrice.pool,
    });
    if (bayFits !== false) return bayFits;

    const purifierCanBuild = targetCanBuild(CAPTURED_MECH_BUILDINGS.purifier);
    if (purifierCanBuild !== true) return purifierCanBuild;
    const purifierPrice = dependencies.costs?.readCost(
      CAPTURED_MECH_BUILDINGS.purifier,
    );
    if (purifierPrice === undefined) return undefined;
    const purifierFits = costFitsStorage(root, purifierPrice.cost, {
      pool: purifierPrice.pool,
    });
    if (purifierFits !== true) return purifierFits;
    const purifierSwitch = offers.states.get(CAPTURED_MECH_BUILDINGS.purifier);
    return purifierSwitch === undefined ? undefined : purifierSwitch.off === 0;
  }

  return Object.freeze({
    readProgressionEpoch: epoch.read,
    beginProcessedCycle,
    runConstructionCycle: () => {
      try {
        return construction.runCycle();
      } finally {
        resetProjectSample();
      }
    },
    establishConstructionOrdering: construction.establishOrdering,
    runResearchCycle: () => research.runCycle(),
    readOfferedTechs: readCurrentOfferedTechs,
    sampleOfferedTechs,
    readGrantedTechs: () => lastGranted,
    readProjects,
    readEstablishedProjects,
    resetProjectSample,
    readBuildingUnlocks,
    readEstablishedBuildingUnlocks,
    readCapturedBuildingUnlocked,
    readBuildingCapacity,
    resetBuildingUnlockSample,
    invalidateConstructionOffers,
    observations: construction.observations,
    readManagedBuildTargets,
    readUnlockedStorageBuildTargets,
    readEstablishedStorageBuildTargets,
    readCanExpandMechBay,
    mechDemand,
    ensureBuildControls,
    // The Tech Knowledge figure behind the trigger operand of the same name: the knowledge
    // gate's own sample, which shares the cycle's already-captured research catalog.
    readKnowledgeRequiredByTechs: () =>
      readKnowledge().knowledgeRequiredByTechs,
  });
}
