/**
 * Composes the captured research slice: page capture in, one research cycle out.
 *
 * Input from the game's own research panel, decision by the existing pure planner, execution
 * through one captured game method. The runtime selects it only after document-start capture is
 * complete; callers that cannot provide that capture reject before touching the game-facing readers.
 */

import { runResearchAutomation } from "../application/research.ts";
import { planResearch } from "../domain/progression/research/research.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { createCapturedCostConflictReader } from "../adapters/evolve/captured-cost-conflict.ts";
import { createCapturedQueueReservationSource } from "../adapters/evolve/captured-queue-reservations.ts";
import { createCapturedResourceSource } from "../adapters/evolve/captured-world-state.ts";
import { createCapturedTabDiscovery } from "../adapters/evolve/captured-tab-discovery.ts";
import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import { createCapturedTechCatalog } from "../adapters/evolve/progression/research/captured-tech-catalog.ts";
import { createCapturedResearchAdapter } from "../adapters/evolve/progression/research/captured-research.ts";
import { createCapturedTechConflictReader } from "../adapters/evolve/progression/research/captured-tech-conflicts.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameActivitySink } from "../ports/game-message-log.ts";
import type { GameDrawnActionsReader } from "../ports/game-drawn-actions.ts";
import type { GameMountSuppression } from "../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { CapturedGameMechanics } from "../ports/captured-game-mechanics.ts";
import type { VueBindingObserver } from "../adapters/evolve/vue-capture.ts";
import type { OfferedTech } from "../ports/game-tech-catalog.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import type { ResearchOwnerSelectionObservation } from "../domain/progression/research/research.ts";
import type { ResearchOwnerSelectionResult } from "../domain/progression/research/research.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

export interface CapturedResearchControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly mechanics: Pick<
    CapturedGameMechanics,
    "captureTechDefinitionsDuring" | "readTechDefinitions"
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
}

export interface CapturedResearchControl {
  /** Runs one research cycle. Safe to call before the game has created its state. */
  runCycle(): CommandExecutionOutcome;
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
  const resources = createCapturedResourceSource(rootState);
  const costs = createCapturedActionCostReader({
    rootState,
    controls,
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

  return Object.freeze({
    ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
      ? {
          readLastOwnerOffers: () => lastOwnerOffers,
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
      const currentRoot = rootState.readRoot();
      if (currentRoot === undefined) return NOT_CAPTURED;
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
      try {
        const { reader, executor } = createCapturedResearchAdapter({
          rootState,
          offered: offeredThisCycle,
          resources,
          conflicts,
          techConflicts,
          controls,
          onRejected,
          observeOwner:
            diagnostics?.readPerformanceEnabled() === true ||
            testOnlyIntervention !== undefined,
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
          ...(diagnostics?.readPerformanceEnabled() === true
            ? { onSelection: dependencies.onOwnerSelection }
            : {}),
          ...(diagnostics?.readPerformanceEnabled() === true ||
          testOnlyIntervention !== undefined
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
        });
      } finally {
        offeredThisCycle = undefined;
      }
    },
  });
}
