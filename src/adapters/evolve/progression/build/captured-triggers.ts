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
 * - A technology the current path never draws — one belonging to another tech path, say — is in
 *   neither half of the research panel, so a trigger naming it is dropped. The compatibility
 *   runtime's DOM read reported the same technology as simply not researched.
 * - Conditions are limited to the operands `../../captured-conditions.ts` answers. `ProjectUnlocked`
 *   is answered from the same drawn panel the A.R.P.A. prices come from, so a trigger naming one
 *   draws the panel even when no trigger buys a project. `BuildingUnlocked` likewise draws the
 *   region panels its conditions name, and only those.
 */

import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { BuildingUnlockSample } from "../../../../ports/game-building-unlocks.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { OfferedProject } from "../../../../ports/game-project-catalog.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import {
  type CapturedConditionDemand,
  evaluateCapturedCondition,
  SWARM_SATELLITE_ACTION_ID,
} from "../../captured-conditions.ts";
import { costFitsStorage } from "../../captured-affordability.ts";
import {
  finite,
  isRecord,
  readProperty,
  splitActionId,
} from "../../../validation.ts";

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
  /**
   * The granted-technology set from that same pass, when it was asked for. Absent means the pass
   * did not keep it, not that nothing is granted.
   */
  readonly readGrantedTechs?: () => ReadonlySet<string> | undefined;
  /** The A.R.P.A. snapshot this cycle already captured, if any. */
  readonly readOfferedProjects?: () =>
    readonly Readonly<OfferedProject>[] | undefined;
  /**
   * Draws and reads the building region panels named by the configured `BuildingUnlocked`
   * conditions. Absent leaves those conditions unanswered.
   */
  readonly readBuildingUnlocks?: (
    regions: ReadonlySet<string>,
  ) => Readonly<BuildingUnlockSample> | undefined;
  /**
   * The cycle's resource-demand commitments without the trigger targets, for the conditions that
   * read what something else is accumulating. The cycle's own trigger-including sample cannot
   * serve: the conditions are evaluated inside the sampling it pulls in. Absent leaves those
   * conditions unanswered.
   */
  readonly readDemandSample?: () => CapturedConditionDemand | undefined;
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

/**
 * The building whose current cost a condition needs priced: the named building itself for
 * `BuildingAffordable`, the dotted pair's building half for `BuildingCost`, and the swarm
 * satellite for `Other/satcost`. Anything else needs no price.
 */
function costConditionBuildingId(row: TriggerRow): string | undefined {
  if (row.requirementType === "BuildingAffordable") {
    return typeof row.requirementId === "string"
      ? row.requirementId
      : undefined;
  }
  if (row.requirementType === "BuildingCost") {
    if (typeof row.requirementId !== "string") return undefined;
    const dot = row.requirementId.indexOf(".");
    return dot > 0 ? row.requirementId.slice(0, dot) : undefined;
  }
  if (row.requirementType === "Other" && row.requirementId === "satcost") {
    return SWARM_SATELLITE_ACTION_ID;
  }
  return undefined;
}

/**
 * Validates one stored trigger. The editor writes every field, so a row missing one is a broken
 * setting rather than a game state this has to tolerate: it is dropped.
 */
function readRow(raw: unknown): TriggerRow | undefined {
  if (!isRecord(raw)) return undefined;
  const priority = finite(readProperty(raw, "priority"));
  const requirementType = readProperty(raw, "requirementType");
  const actionType = readProperty(raw, "actionType");
  const actionId = readProperty(raw, "actionId");
  const actionCount = finite(readProperty(raw, "actionCount"));
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

/**
 * Whether this cycle's research pass has to keep the already-granted half of the draw.
 *
 * Only two things need it: a `research` trigger, whose completion is otherwise undecidable, and a
 * `ResearchComplete` condition. Everything else the research panel answers comes from the offer
 * set the pass reads anyway, and keeping the granted half costs the larger part of the draw, so a
 * player who configures neither never pays for it.
 */
export function triggersNeedGrantedTechs(settings: unknown): boolean {
  if (readProperty(settings, "autoTrigger") !== true) return false;
  return readRows(settings).some(
    (row) =>
      row.actionType === "research" ||
      row.requirementType === "ResearchComplete",
  );
}

/** The operand types whose answer needs the cycle's demand commitments. */
const DEMAND_CONDITION_TYPES: ReadonlySet<string> = new Set([
  "ResourceDemanded",
  "ResourceSatisfied",
  "ResourceSatisfyRatio",
  "ResourceMaxCost",
]);

/**
 * Whether this cycle's trigger sample has to carry the trigger-excluding demand commitments.
 *
 * Only four operands need them — the ones that read what something else is accumulating — and
 * the demand pass prices queues and reads catalogs, so a player who configures none of them
 * never pays for it.
 */
export function triggersNeedDemandSample(settings: unknown): boolean {
  if (readProperty(settings, "autoTrigger") !== true) return false;
  return readRows(settings).some((row) =>
    DEMAND_CONDITION_TYPES.has(row.requirementType),
  );
}

/** The structure record behind a build action id: `city-farm` is `city.farm`. */
export function readTriggerActionStructure(
  root: unknown,
  actionId: string,
): unknown {
  const parts = splitActionId(actionId);
  if (parts === undefined) return undefined;
  const region = readProperty(root, parts.region);
  return readProperty(region, parts.id);
}

/**
 * Whether every cost fits in the storage the game currently has, the script's `isAffordable(true)`.
 *
 * A cost the comparison cannot judge — a non-resource price such as Morale, or a resource the root
 * has no entry for — is treated as not fitting, so an unjudgeable target raises no demand instead
 * of being saved for. The condition operand over the same comparison keeps that case unanswered
 * instead, because there a guess would be the answer rather than a missed opportunity.
 */
function fitsInStorage(
  root: unknown,
  cost: Readonly<Record<string, number>>,
): boolean {
  return costFitsStorage(root, cost) === true;
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
      const grantedTechs = dependencies.readGrantedTechs?.();
      // The project panel is the most expensive read on this path, so it is only drawn when a
      // configured trigger actually needs it: an A.R.P.A. action to price, or a `ProjectUnlocked`
      // condition to answer. The sample is the cycle's shared one, so a construction cycle later
      // in the tick reuses these prices.
      const needProjects = rows.some(
        (row) =>
          row.actionType === "arpa" ||
          row.requirementType === "ProjectUnlocked",
      );
      // An unreadable panel stays `undefined` rather than collapsing to an empty sample: a panel
      // that drew no projects is a real answer to `ProjectUnlocked`, and one that could not be
      // read is not.
      const drawnProjects =
        dependencies.readOfferedProjects === undefined || !needProjects
          ? undefined
          : dependencies.readOfferedProjects();
      const offeredProjectsById =
        drawnProjects === undefined
          ? undefined
          : new Map(
              drawnProjects.map((project) => [project.elementId, project]),
            );
      // Each building region is behind its own sub-tab and costs a pass to draw, so only the
      // regions a configured `BuildingUnlocked` condition actually names are sampled. A row whose
      // argument is not a `<region>-<id>` pair names no panel and is left to go unanswered.
      const buildingRegions = new Set<string>();
      for (const row of rows) {
        if (row.requirementType !== "BuildingUnlocked") continue;
        if (typeof row.requirementId !== "string") continue;
        const parts = splitActionId(row.requirementId);
        if (parts === undefined) continue;
        buildingRegions.add(parts.region);
      }
      const buildingUnlocks =
        dependencies.readBuildingUnlocks === undefined ||
        buildingRegions.size === 0
          ? undefined
          : dependencies.readBuildingUnlocks(buildingRegions);
      // A cost operand is answered from the same prices the targets are chosen with. Only the
      // buildings a condition actually names are priced, and a control the game never bound is
      // not one the cost reader can probe, so it stays unanswered.
      const buildingCosts = new Map<string, Readonly<Record<string, number>>>();
      for (const row of rows) {
        const buildingId = costConditionBuildingId(row);
        if (buildingId === undefined || buildingCosts.has(buildingId)) {
          continue;
        }
        if (controls.resolve(buildingId) === undefined) continue;
        const cost = costs.readCost(buildingId);
        if (cost !== undefined) buildingCosts.set(buildingId, cost);
      }
      // The condition evaluator answers the research, project and building operands from the same
      // passes the actions are priced from, so a trigger's requirement and its target describe one
      // moment. The stored settings travel with them for the operands that read the player's own
      // configuration rather than game state.
      const storedSettings = isRecord(settings) ? settings : undefined;
      // The demand commitments travel only when the supplier carries them: the sample excludes
      // the trigger targets, which the cycle's own trigger-including sample cannot supply here.
      const demandSample = dependencies.readDemandSample?.();
      const conditionContext = Object.freeze({
        ...(offeredTechs === undefined
          ? {}
          : { offeredTechs: new Set(offeredTechs.keys()) }),
        ...(grantedTechs === undefined ? {} : { grantedTechs }),
        ...(offeredProjectsById === undefined
          ? {}
          : { unlockedProjects: new Set(offeredProjectsById.keys()) }),
        ...(buildingUnlocks === undefined ? {} : { buildingUnlocks }),
        ...(buildingCosts.size === 0 ? {} : { buildingCosts }),
        ...(storedSettings === undefined ? {} : { settings: storedSettings }),
        ...(demandSample === undefined ? {} : { demand: demandSample }),
      });
      const byPriority = new Map(rows.map((row) => [row.priority, row]));

      /** Whether the trigger's action has already been carried out, if that is knowable. */
      const isComplete = (row: TriggerRow): boolean | undefined => {
        if (row.actionType === "build") {
          const count = finite(
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
          const rank = finite(
            readProperty(
              readProperty(readProperty(root, "arpa"), projectId ?? ""),
              "rank",
            ),
          );
          return rank === undefined ? undefined : rank >= row.actionCount;
        }
        if (row.actionType === "research") {
          // The research panel draws every technology on the current path in one of two halves:
          // granted, or offered. Either answer is the game's own. A technology in neither — off
          // the current tech path — is not one this can decide.
          if (grantedTechs?.has(row.actionId) === true) return true;
          if (offeredTechs?.has(row.actionId) === true) return false;
          return undefined;
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
          conditionContext,
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
