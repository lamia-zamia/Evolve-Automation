/**
 * Composes the captured research slice: page capture in, one research cycle out.
 *
 * Input from the game's own research panel, decision by the existing pure planner, execution
 * through one captured game method. The runtime selects it only after document-start capture is
 * complete; callers that cannot provide that capture reject before touching the game-facing readers.
 */

import { runResearchAutomation } from "../application/research.ts";
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
import type { OfferedTech } from "../ports/game-tech-catalog.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

export interface CapturedResearchControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
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
}

export interface CapturedResearchControl {
  /** Runs one research cycle. Safe to call before the game has created its state. */
  runCycle(): CommandExecutionOutcome;
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
    controls,
    drawnActions,
    mountSuppression,
    panels,
    diagnostics,
  } = dependencies;
  const onUnavailable = dependencies.onUnavailable;
  const onActivity = dependencies.onActivity;
  const sharedReadOfferedTechs = dependencies.readOfferedTechs;
  const resources = createCapturedResourceSource(rootState);
  const catalog = createCapturedTechCatalog({
    rootState,
    discovery: createCapturedTabDiscovery({
      rootState,
      controls,
      mountSuppression,
      panels,
    }),
    drawnActions,
    controls,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
  // One catalog read per cycle serves the planner and the research queue's own reservations; the
  // cycle stores it here before either asks.
  let offeredThisCycle: readonly Readonly<OfferedTech>[] | undefined;
  const reservations = createCapturedQueueReservationSource({
    rootState,
    readOfferedTechs: () => offeredThisCycle,
    costs: createCapturedActionCostReader({
      rootState,
      controls,
      ...(onUnavailable === undefined
        ? {}
        : {
            onUnavailable: (id: string, reason: string) =>
              onUnavailable(`${id}: ${reason}`),
          }),
    }),
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
  const onRejected = (techId: string, reason: string) => {
    if (onUnavailable === undefined) return;
    const message = `${techId}: research excluded (${reason})`;
    if (reportedRejections.has(message)) return;
    reportedRejections.add(message);
    onUnavailable(message);
  };

  return Object.freeze({
    runCycle(): CommandExecutionOutcome {
      if (rootState.readRoot() === undefined) return NOT_CAPTURED;
      // One offered-technology snapshot per cycle: read, plan and execute all see the same list,
      // and it goes out of scope with the cycle rather than ageing into the next one.
      offeredThisCycle =
        sharedReadOfferedTechs === undefined
          ? catalog.read()?.offered
          : sharedReadOfferedTechs();
      try {
        const { reader, executor } = createCapturedResearchAdapter({
          rootState,
          offered: offeredThisCycle,
          resources,
          conflicts,
          techConflicts,
          controls,
          onRejected,
          ...(onActivity === undefined ? {} : { onActivity }),
        });
        return runResearchAutomation({ reader, executor, diagnostics });
      } finally {
        offeredThisCycle = undefined;
      }
    },
  });
}
