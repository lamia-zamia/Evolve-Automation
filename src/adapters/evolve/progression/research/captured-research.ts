/**
 * Research on the captured page surface: the game's own offer list in, the existing pure research
 * planner deciding, one captured game method out.
 *
 * The offered technologies and their prices are one snapshot of the game's own `drawTech` output,
 * taken when the cycle began and belonging to that cycle alone. Prices in it are a snapshot and
 * that is the right shape for them — a tech's price changes only when the game's own cost inputs
 * change — but **affordability is recomputed every read** against live holdings, because Knowledge
 * moves every tick.
 *
 * `runAction` reports nothing a caller can use, so a research is confirmed by the only thing that
 * proves it: the game's tech state moved. Nothing here carries over between cycles; whether the
 * next snapshot costs a fresh pass is the catalog's business, not this adapter's.
 */

import type {
  ResearchDecision,
  ResearchInput,
  ResearchTechView,
} from "../../../../domain/progression/research/research.ts";
import { canAfford } from "../../../../domain/game-world.ts";
import type {
  ResearchCommandExecutor,
  ResearchExecutionResult,
  ResearchReader,
} from "../../../../ports/research.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import type { CapturedCostConflictReader } from "../../captured-cost-conflict.ts";
import { readCapturedTechState } from "../../captured-tech-state.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";

export interface CapturedResearchDependencies {
  readonly rootState: GameRootStateSource;
  /** This cycle's offered technologies, or `undefined` when the catalog could not be read. */
  readonly offered: readonly Readonly<OfferedTech>[] | undefined;
  readonly resources: GameResourceSource;
  readonly conflicts: CapturedCostConflictReader;
  readonly controls: GameControlRegistry;
  /** Reports a successful research after the captured technology state changed. */
  readonly onActivity?: (message: string) => void;
}

export interface CapturedResearchAdapter {
  readonly reader: ResearchReader;
  readonly executor: ResearchCommandExecutor;
}

const NOTHING_OFFERED: ResearchInput = Object.freeze({
  techs: Object.freeze([]),
});

function executionResult(
  outcome: ResearchExecutionResult["outcome"],
  researched: boolean,
): ResearchExecutionResult {
  return Object.freeze({ outcome, researched });
}

export function createCapturedResearchAdapter(
  dependencies: CapturedResearchDependencies,
): CapturedResearchAdapter {
  const { rootState, offered, resources, conflicts, controls } = dependencies;
  const reportActivity = dependencies.onActivity ?? (() => {});

  function isAffordable(cost: Readonly<Record<string, number>>): boolean {
    const sample = resources.readResources(Object.keys(cost));
    return sample !== undefined && canAfford(sample, cost);
  }

  const reader: ResearchReader = Object.freeze({
    read(startIndex: number): ResearchInput {
      if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
        throw new TypeError(
          "research start index must be a non-negative integer",
        );
      }
      // No catalog is not "nothing is researchable": it is "this tick cannot tell", and the
      // catalog has already reported why. Planning on an empty list simply researches nothing.
      if (offered === undefined) return NOTHING_OFFERED;

      const techs: ResearchTechView[] = [];
      for (let index = startIndex; index < offered.length; index++) {
        const tech = offered[index];
        if (tech === undefined) continue;
        const affordable = isAffordable(tech.cost);
        const view = Object.freeze({
          index,
          id: tech.elementId,
          affordable,
          // Match the legacy gate: what a reservation is saving for only matters for something
          // that could otherwise be bought right now.
          hasCostConflict:
            affordable && conflicts.evaluate(tech.cost).status !== "none",
        });
        techs.push(view);
        if (view.affordable && !view.hasCostConflict) break;
      }
      return Object.freeze({ techs: Object.freeze(techs) });
    },
  });

  const executor: ResearchCommandExecutor = Object.freeze({
    execute(decision: Readonly<ResearchDecision>): ResearchExecutionResult {
      const tech = offered?.[decision.index];
      if (tech === undefined || tech.elementId !== decision.techId) {
        return executionResult(
          stale(
            "stale-research-target",
            "the decision names no offer of this cycle",
            {
              techId: decision.techId,
              index: decision.index,
              actualTechId: tech?.elementId ?? null,
            },
          ),
          false,
        );
      }
      const handle = controls.resolve(decision.techId);
      if (handle === undefined) {
        // Never silently: the game offered this technology, so a control it never bound is a
        // diagnosable gap in the capture, not a locked feature.
        return executionResult(
          rejected(
            "research-control-missing",
            `no captured control for ${decision.techId}`,
          ),
          false,
        );
      }
      if (handle.generation !== tech.generation) {
        // The game redrew this action after the snapshot was taken, so what it offers now was
        // decided by predicates this cycle never saw. The old closure would still click.
        return executionResult(
          stale(
            "stale-research-control",
            `${decision.techId} generation ${tech.generation}, current ${handle.generation}`,
            { techId: decision.techId },
          ),
          false,
        );
      }
      const before = readCapturedTechState(rootState.readRoot());
      const result = controls.invoke(handle, "action");
      if (!result.ok) {
        return executionResult(
          result.reason === "stale-control"
            ? stale("stale-research-control", result.detail ?? result.reason, {
                techId: decision.techId,
              })
            : rejected("research-click-failed", result.detail ?? result.reason),
          false,
        );
      }
      // The game's own action reports nothing useful; the state it changed does. A click the game
      // declined is a decision that produced no research, not a failure.
      const researched = readCapturedTechState(rootState.readRoot()) !== before;
      if (researched) reportActivity(`Researched ${decision.techId}`);
      return executionResult(SUCCEEDED, researched);
    },
  });

  return Object.freeze({ reader, executor });
}
