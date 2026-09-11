/**
 * The player's own triggers, resolved against the captured page surface.
 *
 * A trigger is a stored rule — when this condition holds, buy that action — and the automation
 * treats the actions it currently wants as commitments: they are prioritized, and the resources
 * they cost are held for them. This module answers only the first half of that, which is what the
 * demand model needs: which configured triggers the game could act on right now, and what each one
 * costs at the game's own current price.
 *
 * Three things are read per trigger, in the script's own order: whether it is already done,
 * whether its requirement holds, and whether its action is possible at all. A trigger the captured
 * surface cannot answer is dropped rather than guessed at, so a missing part of the model can only
 * leave a resource looking undemanded.
 *
 * Known gaps, each of which drops the trigger instead of approximating it:
 *
 * - A trigger buys the whole remaining project, priced from the drawn panel's per-percent cost
 *   multiplied by the remaining percent. The drawn 1% price is rounded for display while the game
 *   charges the unrounded fraction per step, so the product slightly overstates the charge — the
 *   safe direction for both saving and the executor's affordability gate.
 * - Research completion is not captured: the game's grant keys live in its private action catalog,
 *   so a technology is only known to be incomplete while the research panel still offers it. A
 *   trigger chained behind a research trigger is therefore dropped until that one is offered.
 * - Conditions are limited to the operands `../../captured-conditions.ts` answers from the root.
 */

import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { OfferedProject } from "../../../../ports/game-project-catalog.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import { evaluateCapturedCondition } from "../../captured-conditions.ts";
import { isRecord, readProperty } from "../../../validation.ts";

/**
 * One trigger action the game could buy now, priced at the game's own current cost.
 *
 * A.R.P.A. targets carry the sampled project state the executor's stale checks and the demand
 * model's project rule need: a trigger buys the whole remaining project, so `cost` is the drawn
 * per-percent price times `steps` and `progress` is the `complete` percent it was priced from.
 */
export type CapturedTriggerTarget =
  | {
      readonly actionId: string;
      readonly actionType: "build" | "research";
      readonly cost: Readonly<Record<string, number>>;
    }
  | {
      readonly actionId: string;
      readonly actionType: "arpa";
      readonly cost: Readonly<Record<string, number>>;
      /** The project id the game's own `build` method takes, e.g. `lhc`. */
      readonly projectId: string;
      /** The whole remaining project in percent: the steps one press buys. */
      readonly steps: number;
      /** The project's current `complete` percent. */
      readonly progress: number;
      readonly generation: number;
    };

export interface CapturedTriggers {
  /** The actionable triggers in the player's priority order. Sampled once per cycle. */
  read(): readonly Readonly<CapturedTriggerTarget>[];
}

export interface CapturedTriggersDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly costs: GameActionCostReader;
  readonly readSettings: () => unknown;
  /** The offered-technology snapshot this cycle already captured, if any. */
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  /** The A.R.P.A. snapshot this cycle already captured, if any. */
  readonly readOfferedProjects?: () =>
    readonly Readonly<OfferedProject>[] | undefined;
}

interface TriggerRow {
  readonly priority: number;
  readonly requirementType: string;
  readonly requirementId: unknown;
  readonly requirementCount: unknown;
  readonly actionType: string;
  readonly actionId: string;
  readonly actionCount: number;
}

const NO_TARGETS: readonly Readonly<CapturedTriggerTarget>[] = Object.freeze(
  [],
);

const ARPA_PREFIX = "arpa";

function finiteValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Validates one stored trigger. The editor writes every field, so a row missing one is a broken
 * setting rather than a game state this has to tolerate: it is dropped.
 */
function readRow(raw: unknown): TriggerRow | undefined {
  if (!isRecord(raw)) return undefined;
  const priority = finiteValue(readProperty(raw, "priority"));
  const requirementType = readProperty(raw, "requirementType");
  const actionType = readProperty(raw, "actionType");
  const actionId = readProperty(raw, "actionId");
  const actionCount = finiteValue(readProperty(raw, "actionCount"));
  if (
    priority === undefined ||
    typeof requirementType !== "string" ||
    typeof actionType !== "string" ||
    typeof actionId !== "string" ||
    actionId.length === 0 ||
    actionCount === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    priority,
    requirementType,
    requirementId: readProperty(raw, "requirementId"),
    requirementCount: readProperty(raw, "requirementCount"),
    actionType,
    actionId,
    actionCount,
  });
}

function readRows(settings: unknown): readonly TriggerRow[] {
  const stored = readProperty(settings, "triggers");
  if (!Array.isArray(stored)) return Object.freeze([]);
  const rows: TriggerRow[] = [];
  for (const raw of stored) {
    const row = readRow(raw);
    if (row !== undefined) rows.push(row);
  }
  return Object.freeze(rows.sort((a, b) => a.priority - b.priority));
}

/** The structure record behind a build action id: `city-farm` is `city.farm`. */
export function readTriggerActionStructure(
  root: unknown,
  actionId: string,
): unknown {
  const separator = actionId.indexOf("-");
  if (separator <= 0) return undefined;
  const region = readProperty(root, actionId.slice(0, separator));
  return readProperty(region, actionId.slice(separator + 1));
}

/** Whether every cost fits in the storage the game currently has, the script's `isAffordable(true)`. */
function fitsInStorage(
  root: unknown,
  cost: Readonly<Record<string, number>>,
): boolean {
  const resources = readProperty(root, "resource");
  for (const [resourceId, amount] of Object.entries(cost)) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const maximum = finiteValue(
      readProperty(readProperty(resources, resourceId), "max"),
    );
    // A cost naming something the root has no holdings for — a stored resource the game has not
    // created yet, or a non-resource price such as Morale — cannot be judged here, so the trigger
    // is not treated as possible.
    if (maximum === undefined) return false;
    if (maximum >= 0 && maximum < amount) return false;
  }
  return true;
}

export function createCapturedTriggers(
  dependencies: CapturedTriggersDependencies,
): CapturedTriggers {
  const { rootState, controls, costs, readSettings } = dependencies;

  return Object.freeze({
    read(): readonly Readonly<CapturedTriggerTarget>[] {
      const settings = readSettings();
      if (readProperty(settings, "autoTrigger") !== true) return NO_TARGETS;
      const rows = readRows(settings);
      if (rows.length === 0) return NO_TARGETS;

      const root = rootState.readRoot();
      const offered = dependencies.readOfferedTechs?.();
      const offeredTechs =
        offered === undefined
          ? undefined
          : new Map(offered.map((tech) => [tech.elementId, tech]));
      // The project panel is the most expensive read on this path, so it is only drawn when a
      // configured trigger actually names an A.R.P.A. action. The sample is the cycle's shared
      // one, so a construction cycle later in the tick reuses these prices.
      const offeredProjectsById =
        dependencies.readOfferedProjects === undefined ||
        !rows.some((row) => row.actionType === "arpa")
          ? undefined
          : new Map(
              (dependencies.readOfferedProjects() ?? []).map((project) => [
                project.elementId,
                project,
              ]),
            );
      const byPriority = new Map(rows.map((row) => [row.priority, row]));

      /** Whether the trigger's action has already been carried out, if that is knowable. */
      const isComplete = (row: TriggerRow): boolean | undefined => {
        if (row.actionType === "build") {
          const count = finiteValue(
            readProperty(
              readTriggerActionStructure(root, row.actionId),
              "count",
            ),
          );
          return count === undefined ? undefined : count >= row.actionCount;
        }
        if (row.actionType === "arpa") {
          // A.R.P.A. ids are stored as the panel binding, `arpa` followed by the project id.
          const projectId = row.actionId.startsWith(ARPA_PREFIX)
            ? row.actionId.slice(ARPA_PREFIX.length)
            : undefined;
          const rank = finiteValue(
            readProperty(
              readProperty(readProperty(root, "arpa"), projectId ?? ""),
              "rank",
            ),
          );
          return rank === undefined ? undefined : rank >= row.actionCount;
        }
        if (row.actionType === "research") {
          // An offered technology has demonstrably not been researched. Anything else — already
          // researched, or not yet available — is indistinguishable without the game's own grant
          // keys, so it stays unknown.
          return offeredTechs?.has(row.actionId) === true ? false : undefined;
        }
        return undefined;
      };

      const requirementMet = (row: TriggerRow): boolean | undefined => {
        if (row.requirementType === "chain") {
          if (row.priority < 1) return true;
          const previous = byPriority.get(row.priority - 1);
          return previous === undefined ? undefined : isComplete(previous);
        }
        return evaluateCapturedCondition(
          root,
          row.requirementType,
          row.requirementId,
          row.requirementCount,
        );
      };

      /** The game's current price for the action, when it is one the game could buy now. */
      const price = (
        row: TriggerRow,
      ): Readonly<Record<string, number>> | undefined => {
        if (row.actionType === "research") {
          return offeredTechs?.get(row.actionId)?.cost;
        }
        if (row.actionType !== "build") return undefined;
        // A control the game has never built is an action it is not offering; the cost reader
        // prices the catalog entry whether or not its panel is drawn.
        if (controls.resolve(row.actionId) === undefined) return undefined;
        return costs.readCost(row.actionId);
      };

      /**
       * A trigger buys the whole remaining project, priced from the drawn panel's per-percent
       * cost. A project the panel is not offering — locked, or finished past its rank gate — is
       * not one the game could buy now, so it raises no demand rather than guessing a price.
       */
      const priceArpa = (
        row: TriggerRow,
      ): Readonly<CapturedTriggerTarget> | undefined => {
        const project = offeredProjectsById?.get(row.actionId);
        if (project === undefined) return undefined;
        // The target list only carries actions whose control was captured, so the executor can
        // press them; the panel draw above captures the project controls as it prices them.
        if (controls.resolve(row.actionId) === undefined) return undefined;
        const remaining = 100 - project.progress;
        if (
          !Number.isSafeInteger(remaining) ||
          remaining < 1 ||
          remaining > 100
        ) {
          return undefined;
        }
        const cost: Record<string, number> = {};
        for (const [resourceId, perPercent] of Object.entries(project.cost)) {
          if (!Number.isFinite(perPercent) || perPercent <= 0) {
            return undefined;
          }
          cost[resourceId] = perPercent * remaining;
        }
        if (Object.keys(cost).length === 0) return undefined;
        const total = Object.freeze(cost);
        if (!fitsInStorage(root, total)) return undefined;
        return Object.freeze({
          actionId: row.actionId,
          actionType: "arpa",
          cost: total,
          projectId: project.projectId,
          steps: remaining,
          progress: project.progress,
          generation: project.generation,
        } as const);
      };

      const targets: CapturedTriggerTarget[] = [];
      const claimed = new Set<string>();
      /** The script's own conflict rule: two triggers saving for the same resource would each
       * hold it against the other, so only the higher-priority one is a target. */
      const claim = (target: Readonly<CapturedTriggerTarget>): boolean => {
        const resourceIds = Object.keys(target.cost);
        if (resourceIds.some((resourceId) => claimed.has(resourceId))) {
          return false;
        }
        for (const resourceId of resourceIds) claimed.add(resourceId);
        targets.push(target);
        return true;
      };
      for (const row of rows) {
        const actionType =
          row.actionType === "build" ||
          row.actionType === "research" ||
          row.actionType === "arpa"
            ? row.actionType
            : undefined;
        if (actionType === undefined) continue;
        if (isComplete(row) !== false) continue;
        if (requirementMet(row) !== true) continue;
        if (actionType === "arpa") {
          const target = priceArpa(row);
          if (target === undefined) continue;
          claim(target);
          continue;
        }
        const cost = price(row);
        if (cost === undefined || !fitsInStorage(root, cost)) continue;
        claim(Object.freeze({ actionId: row.actionId, actionType, cost }));
      }
      return Object.freeze(targets);
    },
  });
}
