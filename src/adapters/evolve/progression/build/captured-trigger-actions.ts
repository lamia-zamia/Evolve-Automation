/**
 * Clicking the player's own triggers on the captured page surface.
 *
 * `./captured-triggers.ts` answers which configured triggers the game could act on right now;
 * this is the other half — running that list in priority order through the existing pure trigger
 * policy and the game's own action closures. The list is the cycle's, sampled once and shared with
 * the demand model, so a trigger that is being saved for and a trigger that is being clicked are
 * always the same trigger.
 *
 * A trigger click is a single press, and it is only made when the cost is already covered.
 * Upstream's `runAction` does not simply decline a purchase it cannot pay for: once the build or
 * research queue is unlocked it enqueues the action instead, so pressing an unaffordable trigger
 * every cycle would quietly fill the player's queue with it. The only honest record of what a press
 * did is the state it moved — a building's count, a project's rank or progress, or the technology
 * bag. A press the game declined anyway is a decision that bought nothing, not a failure, and it
 * leaves the tick free to research and build. Project triggers press the project's own `build`
 * method with the whole remaining percent, the way the construction cycle does.
 */

import { canAfford } from "../../../../domain/game-world.ts";
import type { TriggerClickDecision } from "../../../../domain/progression/build/trigger.ts";
import type {
  TriggerCommandExecutor,
  TriggerExecutionResult,
  TriggerReader,
} from "../../../../ports/trigger.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { OfferedProject } from "../../../../ports/game-project-catalog.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { readCapturedTechState } from "../../captured-tech-state.ts";
import { readCapturedInflationSaveMoney } from "../../economy/resources/captured-inflation-assist.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import {
  readTriggerActionStructure,
  type CapturedTriggerTarget,
} from "./captured-triggers.ts";

export interface CapturedTriggerActionsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly resources: GameResourceSource;
  /** This cycle's trigger targets, in the player's priority order. */
  readonly readTargets: () => readonly Readonly<CapturedTriggerTarget>[];
  readonly readSettings: () => unknown;
  /** The offered-technology snapshot the research triggers were priced from, if any. */
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  /** The A.R.P.A. snapshot the project triggers were priced from, if any. */
  readonly readOfferedProjects?: () =>
    readonly Readonly<OfferedProject>[] | undefined;
}

export interface CapturedTriggerActions {
  readonly reader: TriggerReader;
  readonly executor: TriggerCommandExecutor;
}

const NO_TARGET = Object.freeze({ target: null });

function triggerExecutionResult(
  outcome: TriggerExecutionResult["outcome"],
  clicked: boolean,
): TriggerExecutionResult {
  return Object.freeze({ outcome, clicked });
}

/** The build action's current count, or `undefined` when the root does not carry one. */
function readActionCount(root: unknown, actionId: string): number | undefined {
  const count = readProperty(
    readTriggerActionStructure(root, actionId),
    "count",
  );
  return typeof count === "number" && Number.isFinite(count)
    ? count
    : undefined;
}

/** An A.R.P.A. project's current rank and completion percent, if the root carries both. */
function readProjectState(
  root: unknown,
  projectId: string,
): { rank: number; progress: number } | undefined {
  const state = readProperty(readProperty(root, "arpa"), projectId);
  if (!isRecord(state)) return undefined;
  const rank = readProperty(state, "rank");
  const progress = readProperty(state, "complete");
  return typeof rank === "number" &&
    Number.isFinite(rank) &&
    typeof progress === "number" &&
    Number.isFinite(progress)
    ? { rank, progress }
    : undefined;
}

export function createCapturedTriggerActions(
  dependencies: CapturedTriggerActionsDependencies,
): CapturedTriggerActions {
  const { rootState, controls, resources, readTargets, readSettings } =
    dependencies;

  const reader: TriggerReader = Object.freeze({
    read(index: number) {
      if (!Number.isSafeInteger(index) || index < 0) {
        throw new TypeError("trigger index must be a non-negative integer");
      }
      const target = readTargets()[index];
      if (target === undefined) return NO_TARGET;

      const settings = readSettings();
      // Preserve the legacy && gate: cost is not read when Inflation saving is inactive, while
      // the saving decision is recomputed for every target.
      const shouldSaveMoney = readCapturedInflationSaveMoney(
        rootState.readRoot(),
        isRecord(settings) ? settings : {},
      );
      return Object.freeze({
        target: Object.freeze({
          index,
          id: target.actionId,
          shouldSaveMoney,
          hasPositiveMoneyCost:
            shouldSaveMoney && (target.cost["Money"] ?? 0) > 0,
        }),
      });
    },
  });

  const executor: TriggerCommandExecutor = Object.freeze({
    execute(decision: Readonly<TriggerClickDecision>) {
      const target = readTargets()[decision.index];
      if (target === undefined || target.actionId !== decision.targetId) {
        return triggerExecutionResult(
          stale("stale-trigger-target", "trigger target list changed", {
            targetId: decision.targetId,
            index: decision.index,
            actualTargetId: target?.actionId ?? null,
          }),
          false,
        );
      }
      const sample = resources.readResources(Object.keys(target.cost));
      if (sample === undefined || !canAfford(sample, target.cost)) {
        // Not a failure, and not a press: the target is one the cycle is saving for, and pressing
        // it now would enqueue it rather than buy it.
        return triggerExecutionResult(SUCCEEDED, false);
      }
      const handle = controls.resolve(target.actionId);
      if (handle === undefined) {
        // Never silently: the target list only carries actions whose control was captured, so a
        // control that has gone missing since is a diagnosable gap, not a locked feature.
        return triggerExecutionResult(
          rejected(
            "trigger-control-missing",
            `no captured control for ${target.actionId}`,
          ),
          false,
        );
      }
      if (target.actionType === "research") {
        const offer = dependencies
          .readOfferedTechs?.()
          ?.find((tech) => tech.elementId === target.actionId);
        if (offer === undefined) {
          return triggerExecutionResult(
            stale(
              "stale-trigger-offer",
              `${target.actionId} is no longer offered`,
              { targetId: decision.targetId, index: decision.index },
            ),
            false,
          );
        }
        if (handle.generation !== offer.generation) {
          // The game redrew this action after the snapshot was taken, so what it offers now was
          // decided by predicates this cycle never saw. The old closure would still click.
          return triggerExecutionResult(
            stale(
              "stale-trigger-control",
              `${target.actionId} generation ${offer.generation}, current ${handle.generation}`,
              { targetId: decision.targetId },
            ),
            false,
          );
        }
      }

      if (target.actionType === "arpa") {
        const offer = dependencies
          .readOfferedProjects?.()
          ?.find((project) => project.elementId === target.actionId);
        if (offer === undefined) {
          return triggerExecutionResult(
            stale(
              "stale-trigger-offer",
              `${target.actionId} is no longer offered`,
              { targetId: decision.targetId, index: decision.index },
            ),
            false,
          );
        }
        if (handle.generation !== target.generation) {
          // The game redrew this action after the snapshot was taken, so what it offers now was
          // decided by predicates this cycle never saw. The old closure would still click.
          return triggerExecutionResult(
            stale(
              "stale-trigger-control",
              `${target.actionId} generation ${offer.generation}, current ${handle.generation}`,
              { targetId: decision.targetId },
            ),
            false,
          );
        }
        const state = readProjectState(rootState.readRoot(), target.projectId);
        if (
          state === undefined ||
          state.rank !== offer.rank ||
          state.progress !== offer.progress
        ) {
          // The project moved after the target was priced, so the sampled whole-remaining cost
          // no longer describes it. The next cycle reprices.
          return triggerExecutionResult(
            stale(
              "stale-trigger-state",
              `${target.projectId} moved after sampling`,
              { targetId: decision.targetId },
            ),
            false,
          );
        }
      }

      const research = target.actionType === "research";
      const project = target.actionType === "arpa" ? target : undefined;
      const beforeTech = research
        ? readCapturedTechState(rootState.readRoot())
        : "";
      const beforeCount =
        research || project !== undefined
          ? undefined
          : readActionCount(rootState.readRoot(), target.actionId);
      const beforeProject =
        project === undefined
          ? undefined
          : readProjectState(rootState.readRoot(), project.projectId);
      // A trigger buys the whole remaining project through the project's own `build` method,
      // the way the construction cycle does; anything else presses the game's action closure.
      const invocation =
        project === undefined
          ? controls.invoke(handle, "action")
          : controls.invoke(handle, "build", [
              project.projectId,
              project.steps,
            ]);
      if (!invocation.ok) {
        return triggerExecutionResult(
          invocation.reason === "stale-control"
            ? stale(
                "stale-trigger-control",
                invocation.detail ?? invocation.reason,
                { targetId: decision.targetId },
              )
            : rejected(
                "trigger-click-failed",
                invocation.detail ?? invocation.reason,
              ),
          false,
        );
      }
      // The game's own action reports nothing useful; the state it moved does. A count the root
      // never carried cannot prove a purchase, so it reports none.
      if (research) {
        return triggerExecutionResult(
          SUCCEEDED,
          readCapturedTechState(rootState.readRoot()) !== beforeTech,
        );
      }
      if (project !== undefined) {
        const afterProject = readProjectState(
          rootState.readRoot(),
          project.projectId,
        );
        return triggerExecutionResult(
          SUCCEEDED,
          beforeProject !== undefined &&
            afterProject !== undefined &&
            (afterProject.rank > beforeProject.rank ||
              afterProject.progress > beforeProject.progress),
        );
      }
      const afterCount = readActionCount(rootState.readRoot(), target.actionId);
      return triggerExecutionResult(
        SUCCEEDED,
        beforeCount !== undefined &&
          afterCount !== undefined &&
          afterCount > beforeCount,
      );
    },
  });

  return Object.freeze({ reader, executor });
}
