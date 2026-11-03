/**
 * Composes the captured research slice: page capture in, one research cycle out.
 *
 * Input from the game's own research panel, decision by the existing pure planner, execution
 * through one captured game method. The runtime selects it only after document-start capture is
 * complete; callers that cannot provide that capture reject before touching the game-facing readers.
 */

import { runResearchAutomation } from "../application/research.ts";
import { planResearch } from "../domain/progression/research/research.ts";
import { canAfford } from "../domain/game-world.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { createCapturedCostConflictReader } from "../adapters/evolve/captured-cost-conflict.ts";
import { createCapturedQueueReservationSource } from "../adapters/evolve/captured-queue-reservations.ts";
import { createCapturedResourceSource } from "../adapters/evolve/captured-world-state.ts";
import { createCapturedTabDiscovery } from "../adapters/evolve/captured-tab-discovery.ts";
import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import { createCapturedTechCatalog } from "../adapters/evolve/progression/research/captured-tech-catalog.ts";
import { createCapturedResearchAdapter } from "../adapters/evolve/progression/research/captured-research.ts";
import type { ResearchShadowObservation } from "../adapters/evolve/progression/research/captured-research.ts";
import { readCapturedTechnologyLevel } from "../adapters/evolve/captured-tech-state.ts";
import { createCapturedTechConflictReader } from "../adapters/evolve/progression/research/captured-tech-conflicts.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameActivitySink } from "../ports/game-message-log.ts";
import type { GameDrawnActionsReader } from "../ports/game-drawn-actions.ts";
import type { GameMountSuppression } from "../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { CapturedGameMechanics } from "../ports/captured-game-mechanics.ts";
import type { CapturedComputedTechRequirementsContext } from "../ports/captured-game-mechanics.ts";
import type { VueBindingObserver } from "../adapters/evolve/vue-capture.ts";
import type { OfferedTech } from "../ports/game-tech-catalog.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import type { ResearchOwnerSelectionObservation } from "../domain/progression/research/research.ts";
import type { ResearchOwnerSelectionResult } from "../domain/progression/research/research.ts";
import type { ResearchInput } from "../domain/progression/research/research.ts";
import type { GatherMaterialTarget } from "../ports/gather-resources.ts";
import { readProperty } from "../adapters/validation.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

export interface CapturedResearchControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly mechanics: Pick<
    CapturedGameMechanics,
    | "captureTechDefinitionsDuring"
    | "readTechDefinitions"
    | "readComputedTechRequirements"
  >;
  readonly controls: GameControlRegistry;
  readonly bindings: VueBindingObserver;
  /** The effective settings the research exclusions decide on. */
  readonly readSettings: () => unknown;
  readonly drawnActions: GameDrawnActionsReader;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  /** Optional shared offer snapshot source supplied by a surrounding composition root. */
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  /** Current cached offer snapshot only; unlike readOfferedTechs, this never samples the panel. */
  readonly readCurrentOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  readonly diagnostics?: TickDiagnostics | undefined;
  /** Reports successful captured research after the technology state changed. */
  readonly onActivity?: GameActivitySink;
  /** Reports a catalog or price the capture could not supply. */
  readonly onUnavailable?: (reason: string) => void;
  readonly onOwnerSelection?:
    | ((selection: Readonly<ResearchOwnerSelectionObservation>) => void)
    | undefined;
  readonly onOwnerSelectionResult?:
    ((result: Readonly<ResearchOwnerSelectionResult>) => void) | undefined;
  /** Reads only a test-sandbox intervention installed behind the compile-time test surface. */
  readonly readTestOnlyIntervention?: () =>
    Readonly<{ deferActionId: string; targetActionId: string }> | undefined;
  readonly readTestShadowObserver?: () =>
    ((observation: Readonly<ResearchShadowObservation>) => void) | undefined;
  readonly readOwnerObservationIdentity?: () => Readonly<{
    rootGeneration: number;
    progressionGeneration: string;
  }>;
  readonly readOwnerEvidenceEnabled?: () => boolean;
  readonly onOwnerOffersForTest?: (
    observation: Readonly<{
      rootGeneration: number;
      progressionGeneration: string;
      offerMembership: "complete" | "unknown";
      offers: readonly Readonly<OfferedTech>[] | undefined;
    }>,
  ) => void;
  readonly onOwnerReadForTest?: (input: Readonly<ResearchInput>) => void;
  readonly readComputedRequirementsContext?: () =>
    CapturedComputedTechRequirementsContext | undefined;
}

export interface CapturedResearchControl {
  /** Runs one research cycle. Safe to call before the game has created its state. */
  runCycle(): CommandExecutionOutcome;
  /** Current material shortage of the Research owner's next eligible native offer. */
  readMaterialGatherTarget(): GatherMaterialTarget | undefined;
  /** Test-surface-only reader for exclusions on a current native offer. */
  readCurrentOfferEligibility?(
    actionId: string,
  ): "eligible" | "excluded" | "unavailable" | "not-offered";
  /** Test-surface-only exact offer list consumed by the most recent owner cycle. */
  readLastOwnerOffers?(): readonly Readonly<OfferedTech>[] | undefined;
  /** Test-surface-only exclusion result for one offer from that exact owner sample. */
  readOwnerOfferEligibility?(
    offer: Readonly<OfferedTech>,
  ): "eligible" | "excluded" | "unavailable";
  /** Test-surface-only view of the per-action uncertain mutation quarantine. */
  readMutationUncertainForTest?(actionId: string): boolean;
}

const NOT_CAPTURED: CommandExecutionOutcome = Object.freeze({
  status: "rejected",
  failure: Object.freeze({
    code: "game-state-not-captured",
    message: "the game root has not been captured yet",
  }),
});

export function createCapturedResearchControl(
  dependencies: CapturedResearchControlDependencies,
): CapturedResearchControl {
  const {
    rootState,
    mechanics,
    controls,
    bindings,
    drawnActions,
    mountSuppression,
    panels,
    diagnostics,
  } = dependencies;
  const onUnavailable = dependencies.onUnavailable;
  const onActivity = dependencies.onActivity;
  const sharedReadOfferedTechs = dependencies.readOfferedTechs;
  const readCurrentOfferedTechs = dependencies.readCurrentOfferedTechs;
  const resources = createCapturedResourceSource(rootState);
  const costs = createCapturedActionCostReader({
    rootState,
    controls,
    ...(dependencies.readComputedRequirementsContext === undefined
      ? {}
      : {
          readComputedRequirementsContext:
            dependencies.readComputedRequirementsContext,
        }),
    ...(onUnavailable === undefined
      ? {}
      : {
          onUnavailable: (id: string, reason: string) =>
            onUnavailable(`${id}: ${reason}`),
        }),
  });
  const catalog = createCapturedTechCatalog({
    rootState,
    mechanics,
    discovery: createCapturedTabDiscovery({
      rootState,
      controls,
      mountSuppression,
      panels,
    }),
    drawnActions,
    bindings,
    controls,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
  // One catalog read per cycle serves the planner and the research queue's own reservations; the
  // cycle stores it here before either asks.
  let offeredThisCycle: readonly Readonly<OfferedTech>[] | undefined;
  let lastOwnerOffers: readonly Readonly<OfferedTech>[] | undefined;
  const reservations = createCapturedQueueReservationSource({
    rootState,
    readOfferedTechs: () => offeredThisCycle,
    costs,
    ...(onUnavailable === undefined
      ? {}
      : {
          onUnavailable: (id: string, reason: string) =>
            onUnavailable(`${id}: ${reason}`),
        }),
  });
  const conflicts = createCapturedCostConflictReader({
    resources,
    reservations,
  });
  const techConflicts = createCapturedTechConflictReader({
    rootState,
    readSettings: dependencies.readSettings,
    resources,
  });
  // A rejected candidate is reported once per technology and reason. The exclusions that fail closed
  // do so for as long as the game keeps offering that technology, and a line per cycle would bury
  // everything else.
  const reportedRejections = new Set<string>();
  const uncertainMutations = new Map<
    string,
    Readonly<{
      rootIdentity: number | undefined;
      grantTechnology: string | undefined;
      grantLevel: number | undefined;
    }>
  >();
  const rootIdentities = new WeakMap<object, number>();
  let nextRootIdentity = 0;
  const identifyRoot = (root: unknown): number | undefined => {
    if (
      root === null ||
      (typeof root !== "object" && typeof root !== "function")
    )
      return undefined;
    const object = root as object;
    const existing = rootIdentities.get(object);
    if (existing !== undefined) return existing;
    const identity = ++nextRootIdentity;
    rootIdentities.set(object, identity);
    return identity;
  };
  let rootGeneration = 0;
  rootState.subscribeRootReplaced(() => {
    rootGeneration += 1;
  });
  let testInterventionRootObserved = false;
  let testInterventionDisabled = false;
  let testInterventionComplete = false;
  const onRejected = (techId: string, reason: string) => {
    if (onUnavailable === undefined) return;
    const message = `${techId}: research excluded (${reason})`;
    if (reportedRejections.has(message)) return;
    reportedRejections.add(message);
    onUnavailable(message);
  };

  const readMaterialGatherTarget = (): GatherMaterialTarget | undefined => {
    const settings = dependencies.readSettings();
    if (readProperty(settings, "autoResearch") !== true) return undefined;
    const root = rootState.readRoot();
    const offers = offeredThisCycle ?? readCurrentOfferedTechs?.();
    if (root === undefined || offers === undefined) return undefined;
    const rootGenerationAtRead = rootGeneration;
    const materialIds = ["Lumber", "Stone", "Chrysotile"] as const;

    for (const offer of offers) {
      if (uncertainMutations.has(offer.elementId)) continue;
      const nativeControl = controls.resolve(offer.elementId);
      if (
        nativeControl === undefined ||
        !nativeControl.methods.includes("action") ||
        nativeControl.generation !== offer.generation
      )
        continue;
      if (techConflicts.evaluate(offer).status !== "none") continue;
      const sample = resources.readResources(Object.keys(offer.cost));
      if (sample === undefined) continue;
      if (offer.nativeAffordable && canAfford(sample, offer.cost))
        return undefined;

      let unsupportedShortage = false;
      for (const [resourceId, price] of Object.entries(offer.cost)) {
        if (!Number.isFinite(price) || price < 0) {
          unsupportedShortage = true;
          break;
        }
        if (
          price === 0 ||
          materialIds.includes(resourceId as (typeof materialIds)[number])
        )
          continue;
        const held = sample.resources.get(resourceId);
        if (held === undefined || held.amount < price) {
          unsupportedShortage = true;
          break;
        }
      }
      if (unsupportedShortage) continue;

      let selectedResource: (typeof materialIds)[number] | undefined;
      let selectedPrice: number | undefined;
      for (const resourceId of materialIds) {
        const price = offer.cost[resourceId];
        if (price === undefined || price <= 0) continue;
        const held = sample.resources.get(resourceId);
        if (held === undefined || (held.max > 0 && held.max < price)) {
          unsupportedShortage = true;
          break;
        }
        if (held.amount < price && selectedResource === undefined) {
          selectedResource = resourceId;
          selectedPrice = price;
        }
      }
      if (
        unsupportedShortage ||
        selectedResource === undefined ||
        selectedPrice === undefined
      )
        continue;

      const actionId = offer.elementId;
      const resourceId = selectedResource;
      const quantity = selectedPrice;
      const targetGeneration = offer.generation;
      const targetCost = offer.cost;
      const isCurrent = () => {
        const currentSettings = dependencies.readSettings();
        const currentRoot = rootState.readRoot();
        const currentOffer = (
          offeredThisCycle ?? readCurrentOfferedTechs?.()
        )?.find((candidate) => candidate.elementId === actionId);
        const currentControl = controls.resolve(actionId);
        const currentSample = resources.readResources(Object.keys(targetCost));
        return (
          readProperty(currentSettings, "autoResearch") === true &&
          rootGeneration === rootGenerationAtRead &&
          currentRoot === root &&
          currentOffer !== undefined &&
          currentOffer.generation === targetGeneration &&
          Object.keys(targetCost).length ===
            Object.keys(currentOffer.cost).length &&
          Object.entries(targetCost).every(
            ([id, price]) => currentOffer.cost[id] === price,
          ) &&
          currentControl?.methods.includes("action") === true &&
          currentControl.generation === targetGeneration &&
          currentSample !== undefined &&
          techConflicts.evaluate(currentOffer).status === "none"
        );
      };
      return Object.freeze({
        source: "research",
        targetId: actionId,
        resourceId,
        quantity,
        generation: targetGeneration,
        isCurrent,
      });
    }
    return undefined;
  };

  return Object.freeze({
    readMaterialGatherTarget,
    ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
      ? {
          readLastOwnerOffers: () => lastOwnerOffers,
          readMutationUncertainForTest: (actionId: string) =>
            uncertainMutations.has(actionId),
          readOwnerOfferEligibility(offer: Readonly<OfferedTech>) {
            const decision = techConflicts.evaluate(offer);
            return decision.status === "none"
              ? ("eligible" as const)
              : decision.status === "conflict"
                ? ("excluded" as const)
                : ("unavailable" as const);
          },
          readCurrentOfferEligibility(actionId: string) {
            const currentOffers =
              offeredThisCycle ?? sharedReadOfferedTechs?.();
            const offer = currentOffers?.find(
              (candidate) => candidate.elementId === actionId,
            );
            if (offer === undefined) return "not-offered" as const;
            const decision = techConflicts.evaluate(offer);
            return decision.status === "none"
              ? ("eligible" as const)
              : decision.status === "conflict"
                ? ("excluded" as const)
                : ("unavailable" as const);
          },
        }
      : {}),
    runCycle(): CommandExecutionOutcome {
      lastOwnerOffers = undefined;
      const currentRootGeneration = rootGeneration;
      const currentRoot = rootState.readRoot();
      if (currentRoot === undefined) return NOT_CAPTURED;
      const currentRootIdentity = identifyRoot(currentRoot);
      let testOnlyIntervention:
        Readonly<{ deferActionId: string; targetActionId: string }> | undefined;
      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
      ) {
        if (!testInterventionRootObserved) {
          testInterventionRootObserved = true;
          rootState.subscribeRootReplaced(() => {
            testInterventionDisabled = true;
          });
        }
        testOnlyIntervention =
          testInterventionDisabled || testInterventionComplete
            ? undefined
            : dependencies.readTestOnlyIntervention?.();
      }
      // One offered-technology snapshot per cycle: read, plan and execute all see the same list,
      // and it goes out of scope with the cycle rather than ageing into the next one.
      offeredThisCycle =
        sharedReadOfferedTechs === undefined
          ? catalog.read()?.offered
          : sharedReadOfferedTechs();
      lastOwnerOffers = offeredThisCycle;
      for (const [actionId, mutation] of uncertainMutations) {
        if (
          mutation.rootIdentity !== undefined &&
          currentRootIdentity !== undefined &&
          mutation.rootIdentity !== currentRootIdentity
        ) {
          uncertainMutations.delete(actionId);
          continue;
        }
        if (
          mutation.grantTechnology !== undefined &&
          mutation.grantLevel !== undefined
        ) {
          const grant = readCapturedTechnologyLevel(
            currentRoot,
            mutation.grantTechnology,
          );
          if (grant !== undefined && grant >= mutation.grantLevel)
            uncertainMutations.delete(actionId);
        }
      }
      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true &&
        dependencies.readOwnerEvidenceEnabled?.() === true &&
        dependencies.onOwnerOffersForTest !== undefined
      ) {
        const identity = dependencies.readOwnerObservationIdentity?.();
        if (identity !== undefined) {
          try {
            dependencies.onOwnerOffersForTest(
              Object.freeze({
                ...identity,
                offerMembership:
                  offeredThisCycle === undefined ? "unknown" : "complete",
                offers: offeredThisCycle,
              }),
            );
          } catch {
            // Test-only offer publication cannot change the Research owner.
          }
        }
      }
      try {
        const { reader, executor } = createCapturedResearchAdapter({
          rootState,
          currentRoot,
          currentRootGeneration,
          readRootGeneration: () => rootGeneration,
          readSettings: dependencies.readSettings,
          isMutationUncertain: (actionId) => uncertainMutations.has(actionId),
          offered: offeredThisCycle,
          resources,
          conflicts,
          techConflicts,
          controls,
          onRejected,
          observeOwner:
            diagnostics?.readPerformanceEnabled() === true ||
            testOnlyIntervention !== undefined ||
            (typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
              __EA_TEST_SURFACE_ENABLED__ === true &&
              dependencies.readOwnerEvidenceEnabled?.() === true &&
              dependencies.onOwnerReadForTest !== undefined),
          ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
          __EA_TEST_SURFACE_ENABLED__ === true
            ? {
                testShadowObserver: dependencies.readTestShadowObserver?.(),
              }
            : {}),
          ...(onActivity === undefined ? {} : { onActivity }),
        });
        let researchReader = reader;
        if (
          typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
          __EA_TEST_SURFACE_ENABLED__ === true &&
          testOnlyIntervention !== undefined
        ) {
          researchReader = Object.freeze({
            read(startIndex: number) {
              const original = reader.read(startIndex);
              const selected = planResearch(original);
              if (selected?.techId !== testOnlyIntervention.deferActionId)
                return original;

              const observed = [...original.techs];
              let target = observed.find(
                (candidate) =>
                  candidate.id === testOnlyIntervention.targetActionId,
              );
              let nextIndex =
                Math.max(
                  startIndex - 1,
                  ...observed.map((candidate) => candidate.index),
                ) + 1;
              let scanCount = 0;
              while (target === undefined && scanCount < 512) {
                const next = reader.read(nextIndex);
                if (next.techs.length === 0) break;
                observed.push(...next.techs);
                target = next.techs.find(
                  (candidate) =>
                    candidate.id === testOnlyIntervention.targetActionId,
                );
                nextIndex =
                  Math.max(
                    nextIndex,
                    ...next.techs.map((candidate) => candidate.index),
                  ) + 1;
                scanCount += next.techs.length;
              }

              if (target === undefined)
                return Object.freeze({
                  techs: Object.freeze([]),
                  interventionResult: Object.freeze({
                    index: selected.index,
                    actionId: selected.techId,
                    disposition: "experiment-stopped" as const,
                    reason: `native offer ${testOnlyIntervention.targetActionId} could not be verified`,
                  }),
                });

              if (
                target.nativeAffordable !== true ||
                target.resourceAffordable !== true ||
                target.hasCostConflict !== false ||
                target.hasTechConflict !== false ||
                target.costConflictEvidence !== "none" ||
                target.exclusionEvidence !== "none"
              )
                return Object.freeze({
                  techs: Object.freeze([]),
                  interventionResult: Object.freeze({
                    index: selected.index,
                    actionId: selected.techId,
                    disposition: "experiment-deferred" as const,
                    reason: `${testOnlyIntervention.targetActionId} remains unaffordable, reserved, or excluded`,
                  }),
                });

              return Object.freeze({ techs: Object.freeze([target]) });
            },
          });
        }
        return runResearchAutomation({
          reader: researchReader,
          executor,
          diagnostics,
          ...(dependencies.onOwnerSelection === undefined
            ? {}
            : { onSelection: dependencies.onOwnerSelection }),
          onUncertainMutation: ({ index, techId }) => {
            const offer = offeredThisCycle?.[index];
            uncertainMutations.set(
              techId,
              Object.freeze({
                rootIdentity: currentRootIdentity,
                grantTechnology:
                  offer?.elementId === techId
                    ? offer.grantTechnology
                    : undefined,
                grantLevel:
                  offer?.elementId === techId ? offer.grantLevel : undefined,
              }),
            );
          },
          ...(diagnostics?.readPerformanceEnabled() === true ||
          testOnlyIntervention !== undefined ||
          (typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
            __EA_TEST_SURFACE_ENABLED__ === true &&
            dependencies.onOwnerSelectionResult !== undefined)
            ? {
                onSelectionResult: (
                  result: Readonly<ResearchOwnerSelectionResult>,
                ) => {
                  if (
                    result.decision.techId ===
                    testOnlyIntervention?.targetActionId
                  ) {
                    if (result.disposition === "researched")
                      testInterventionComplete = true;
                    else testInterventionDisabled = true;
                  }
                  dependencies.onOwnerSelectionResult?.(result);
                },
              }
            : {}),
          ...(typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
          __EA_TEST_SURFACE_ENABLED__ !== true ||
          dependencies.onOwnerReadForTest === undefined
            ? {}
            : {
                onRead: (input: Readonly<ResearchInput>) => {
                  if (dependencies.readOwnerEvidenceEnabled?.() === true)
                    dependencies.onOwnerReadForTest?.(input);
                },
              }),
        });
      } finally {
        offeredThisCycle = undefined;
      }
    },
  });
}
