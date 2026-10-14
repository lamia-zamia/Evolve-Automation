/**
 * Research on the captured page surface: the game's own offer list in, the existing pure research
 * planner deciding, one captured game method out.
 *
 * The offered technologies and their prices are one snapshot of the game's own `drawTech` output,
 * taken when the cycle began and belonging to that cycle alone. Prices in it are a snapshot and
 * that is the right shape for them — a tech's price changes only when the game's own cost inputs
 * change — but numeric affordability is recomputed every read against live holdings, because
 * Knowledge moves every tick. The drawn row's native verdict also gates synthetic costs such as
 * Unification's `Bool()` price, which cannot be reconstructed from numeric markup.
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
  ResearchExecutionDisposition,
  ResearchExecutionResult,
  ResearchReader,
} from "../../../../ports/research.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameActivitySink } from "../../../../ports/game-message-log.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import type { CapturedCostConflictReader } from "../../captured-cost-conflict.ts";
import type { CapturedTechConflictReader } from "./captured-tech-conflicts.ts";
import { readCapturedTechnologyLevel } from "../../captured-tech-state.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import { readCapturedControlLabel } from "../../captured-control-label.ts";

export interface CapturedResearchDependencies {
  readonly rootState: GameRootStateSource;
  /** This cycle's offered technologies, or `undefined` when the catalog could not be read. */
  readonly offered: readonly Readonly<OfferedTech>[] | undefined;
  readonly resources: GameResourceSource;
  readonly conflicts: CapturedCostConflictReader;
  /** Research exclusions, applied to every candidate before one is chosen. */
  readonly techConflicts: CapturedTechConflictReader;
  readonly controls: GameControlRegistry;
  /** Reports a candidate the exclusions rejected, and why. */
  readonly onRejected?: (techId: string, reason: string) => void;
  /** Reports a successful research after the captured technology state changed. */
  readonly onActivity?: GameActivitySink;
  /** Retain component affordability/exclusion evidence only for the opt-in owner diagnostic. */
  readonly observeOwner?: boolean;
  readonly testShadowObserver?:
    ((observation: Readonly<ResearchShadowObservation>) => void) | undefined;
}

export interface ResearchShadowObservation {
  readonly actionId: string;
  readonly offerGeneration: number;
  readonly offerSetIdentity: string | undefined;
  readonly offerObservationId: string | undefined;
  readonly displayedManaPrice: number | undefined;
  readonly manaStockBefore: number | undefined;
  readonly manaStockAfter: number | undefined;
  readonly expectedGrantOccurred: boolean;
  readonly invocation: "returned" | "failed";
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
  disposition: ResearchExecutionDisposition,
): ResearchExecutionResult {
  return Object.freeze({ outcome, disposition });
}

export function createCapturedResearchAdapter(
  dependencies: CapturedResearchDependencies,
): CapturedResearchAdapter {
  const { rootState, offered, resources, conflicts, techConflicts, controls } =
    dependencies;
  const reportActivity = dependencies.onActivity ?? (() => {});
  const reportRejected = dependencies.onRejected ?? (() => {});
  const testShadowObserver = dependencies.testShadowObserver;
  const readShadowManaStock = () => {
    try {
      return resources.readResources(["Mana"])?.resources.get("Mana")?.amount;
    } catch {
      return undefined;
    }
  };
  const reportShadowObservation = (
    tech: Readonly<OfferedTech>,
    actionId: string,
    manaStockBefore: number | undefined,
    expectedGrantOccurred: boolean,
    invocation: ResearchShadowObservation["invocation"],
  ) => {
    if (testShadowObserver === undefined) return;
    try {
      testShadowObserver(
        Object.freeze({
          actionId,
          offerGeneration: tech.generation,
          offerSetIdentity: tech.offerSetIdentity,
          offerObservationId: tech.offerObservationId,
          displayedManaPrice:
            typeof tech.cost.Mana === "number" ? tech.cost.Mana : undefined,
          manaStockBefore,
          manaStockAfter: readShadowManaStock(),
          expectedGrantOccurred,
          invocation,
        } satisfies ResearchShadowObservation),
      );
    } catch {
      // Shadow diagnostics must not change the native action's result.
    }
  };

  /**
   * Whether a research exclusion rejects this candidate. An exclusion the reader could not decide
   * rejects too: a fact it cannot establish is never permission to click.
   */
  function readTechConflict(tech: Readonly<OfferedTech>) {
    const decision = techConflicts.evaluate(tech);
    if (decision.status === "none") return decision;
    reportRejected(
      tech.elementId,
      decision.status === "conflict"
        ? decision.conflict.code
        : `unavailable: ${decision.reason}${decision.field === undefined ? "" : ` (${decision.field})`}`,
    );
    return decision;
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
        const resourceSample = tech.nativeAffordable
          ? resources.readResources(Object.keys(tech.cost))
          : undefined;
        const resourceAffordable =
          resourceSample === undefined
            ? undefined
            : canAfford(resourceSample, tech.cost);
        const affordable = tech.nativeAffordable && resourceAffordable === true;
        let costConflictEvidence:
          "none" | "conflict" | "unavailable" | "not-evaluated" =
          "not-evaluated";
        let costConflictRejected = false;
        let exclusionEvidence:
          "none" | "excluded" | "unavailable" | "not-evaluated" =
          "not-evaluated";
        let reservationReason: string | undefined;
        let exclusionReason: string | undefined;
        if (affordable) {
          const conflict = conflicts.evaluate(tech.cost);
          costConflictRejected = conflict.status !== "none";
          costConflictEvidence =
            conflict.status === "none" &&
            "evidence" in conflict &&
            conflict.evidence === "unavailable"
              ? "unavailable"
              : conflict.status;
          reservationReason =
            conflict.status === "conflict"
              ? `${conflict.conflict.targetCause}:${conflict.conflict.targetName}`
              : conflict.status === "unavailable" ||
                  ("evidence" in conflict &&
                    conflict.evidence === "unavailable")
                ? "reservation or holdings evidence unavailable"
                : undefined;
        }
        let techConflict = false;
        if (affordable) {
          const decision = readTechConflict(tech);
          exclusionEvidence =
            decision.status === "none"
              ? "none"
              : decision.status === "conflict"
                ? "excluded"
                : "unavailable";
          exclusionReason =
            decision.status === "conflict"
              ? decision.conflict.code
              : decision.status === "unavailable"
                ? `unavailable:${decision.reason}${decision.field === undefined ? "" : `:${decision.field}`}`
                : undefined;
          techConflict = decision.status !== "none";
        }
        const view = Object.freeze({
          index,
          id: tech.elementId,
          affordable,
          // Match the legacy gate: what a reservation is saving for only matters for something
          // that could otherwise be bought right now.
          hasCostConflict: affordable && costConflictRejected,
          // The same applies to exclusions: an unaffordable technology is not a decision yet, and
          // sampling guard and achievement facts for it would be work the cycle cannot use.
          hasTechConflict: affordable && techConflict,
          ...(dependencies.observeOwner === true
            ? {
                nativeAffordable: tech.nativeAffordable,
                resourceAffordable,
                ...(resourceSample === undefined
                  ? {}
                  : {
                      observedResources: Object.freeze(
                        Object.fromEntries(
                          Array.from(
                            resourceSample.resources.entries(),
                            ([id, resource]) => [
                              id,
                              Object.freeze({
                                amount: resource.amount,
                                max: resource.max,
                                rateOfChange: resource.rateOfChange,
                              }),
                            ],
                          ),
                        ),
                      ),
                    }),
                costConflictEvidence,
                exclusionEvidence,
                ...(reservationReason === undefined
                  ? {}
                  : { reservationReason }),
                ...(exclusionReason === undefined ? {} : { exclusionReason }),
              }
            : {}),
        });
        techs.push(view);
        if (view.affordable && !view.hasCostConflict && !view.hasTechConflict) {
          break;
        }
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
          "stopped",
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
          "stopped",
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
          "stopped",
        );
      }
      const before = readCapturedTechnologyLevel(
        rootState.readRoot(),
        tech.grantTechnology,
      );
      if (before === undefined || !Number.isFinite(tech.grantLevel)) {
        return executionResult(
          stale(
            "stale-research-grant",
            `native grant evidence for ${decision.techId} is unavailable`,
            { techId: decision.techId },
          ),
          "stopped",
        );
      }
      const manaStockBefore =
        testShadowObserver === undefined ? undefined : readShadowManaStock();
      const result = controls.invoke(handle, "action");
      if (!result.ok) {
        if (testShadowObserver !== undefined) {
          const afterFailure = readCapturedTechnologyLevel(
            rootState.readRoot(),
            tech.grantTechnology,
          );
          reportShadowObservation(
            tech,
            decision.techId,
            manaStockBefore,
            before < tech.grantLevel &&
              afterFailure !== undefined &&
              afterFailure >= tech.grantLevel,
            "failed",
          );
        }
        return executionResult(
          result.reason === "stale-control"
            ? stale("stale-research-control", result.detail ?? result.reason, {
                techId: decision.techId,
              })
            : rejected("research-click-failed", result.detail ?? result.reason),
          "stopped",
        );
      }
      // DeadSpace's action wrapper returns no useful result; only its declared grant changing to
      // the expected level confirms this invocation. Other technology mutations do not count.
      const after = readCapturedTechnologyLevel(
        rootState.readRoot(),
        tech.grantTechnology,
      );
      const researched =
        before < tech.grantLevel &&
        after !== undefined &&
        after >= tech.grantLevel;
      reportShadowObservation(
        tech,
        decision.techId,
        manaStockBefore,
        researched,
        "returned",
      );
      if (researched) {
        const label = readCapturedControlLabel(handle, decision.techId);
        reportActivity({
          message: `Researched ${label}`,
          color: "success",
          tags: Object.freeze(["queue", "research_queue"]),
        });
      }
      return executionResult(
        SUCCEEDED,
        researched ? "researched" : "no-observed-research",
      );
    },
  });

  return Object.freeze({ reader, executor });
}
