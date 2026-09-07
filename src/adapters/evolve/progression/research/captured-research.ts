/**
 * Research on the captured page surface: the game's own offer list in, the existing pure research
 * planner deciding, one captured game method out.
 *
 * The offered technologies and their prices come from `GameTechCatalog`, which is the game's own
 * `drawTech` output. Prices there are a snapshot taken when the panel was last drawn, and that is
 * the right shape for them — a tech's price changes only when the game's own cost inputs change —
 * but **affordability is recomputed every read** against live holdings, because Knowledge moves
 * every tick.
 *
 * `runAction` reports nothing a caller can use, so a research is confirmed by the only thing that
 * proves it: the game's tech state moved. That also matches how the catalog decides to refresh, so
 * a successful research is picked up on the next read without an explicit invalidation.
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
import type {
  GameTechCatalog,
  OfferedTech,
} from "../../../../ports/game-tech-catalog.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import type { CapturedCostConflictReader } from "../../captured-cost-conflict.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";

export interface CapturedResearchDependencies {
  readonly rootState: GameRootStateSource;
  readonly catalog: GameTechCatalog;
  readonly resources: GameResourceSource;
  readonly conflicts: CapturedCostConflictReader;
  readonly controls: GameControlRegistry;
}

export interface CapturedResearchAdapter {
  readonly reader: ResearchReader;
  readonly executor: ResearchCommandExecutor;
}

const NOTHING_OFFERED: ResearchInput = Object.freeze({
  techs: Object.freeze([]),
});

/**
 * What the game's technology state currently is, in one comparable value. Any grant moves it, and
 * nothing else does, so a change across a click is proof the click researched something.
 */
function techState(root: unknown): string {
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return "none";
  const parts: string[] = [];
  for (const key of Object.keys(tech).sort()) {
    parts.push(`${key}:${String(tech[key])}`);
  }
  return parts.join(",");
}

function executionResult(
  outcome: ResearchExecutionResult["outcome"],
  researched: boolean,
): ResearchExecutionResult {
  return Object.freeze({ outcome, researched });
}

export function createCapturedResearchAdapter(
  dependencies: CapturedResearchDependencies,
): CapturedResearchAdapter {
  const { rootState, catalog, resources, conflicts, controls } = dependencies;

  function offeredAt(index: number): Readonly<OfferedTech> | undefined {
    return catalog.readOffered()?.[index];
  }

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
      const offered = catalog.readOffered();
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
      const tech = offeredAt(decision.index);
      if (tech === undefined || tech.elementId !== decision.techId) {
        return executionResult(
          stale("stale-research-target", "the offered research list changed", {
            techId: decision.techId,
            index: decision.index,
            actualTechId: tech?.elementId ?? null,
          }),
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
      const before = techState(rootState.readRoot());
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
      return executionResult(
        SUCCEEDED,
        techState(rootState.readRoot()) !== before,
      );
    },
  });

  return Object.freeze({ reader, executor });
}
