/**
 * Bounded manual crafting through the captured `res<Resource>` rows.
 *
 * The pure craft policy is reused unchanged, and it is now fed the demand model it was written for
 * rather than a stand-in for it. A material something else is accumulating blocks the craft; one the
 * player has less of than the plan needs stored blocks it too; a craftable that is itself demanded
 * spends its material's spare quantity; and everything else trickles from the income of the periods
 * just completed. This replaces the at-cap gate that stood in while no demand model existed, which
 * only ever converted overflow.
 *
 * One legacy check has no captured input and is left out: the usefulness ratio that compared a
 * material against the craftable it feeds. Its absence makes crafting slightly more permissive, and
 * the demand and storage checks around it still bound what can be spent. The captured demand sample
 * is also narrower than the legacy one — it sees the player's queues and the construction cycle's
 * saving target, not every weighted build target — so a material wanted only by an ordinary
 * weighted candidate can still be crafted from.
 *
 * Candidates come from the root and the page rather than from a copied recipe catalog: a resource
 * is manually craftable when the game gives it an uncapped row and renders its own craft-all
 * button. That is the same button a player would click, so this never crafts something the game
 * does not offer (`Scarletite`, `Quantium` and `Super_Fuel` have rows but no buttons).
 */

import type {
  CraftCandidateInput,
  CraftDecision,
  CraftGateInput,
  CraftMaterialView,
} from "../../../../domain/economy/production/craft.ts";
import type { CraftReader } from "../../../../ports/craft.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";
import {
  CRAFT_ROW_PREFIX,
  type CapturedCraftCosts,
} from "./captured-craft-costs.ts";
import type { CapturedDemandSample } from "../resources/captured-resource-demand.ts";

/** The game's worker period is 250 ms, so four game periods complete per second. */
const PERIODS_PER_SECOND = 4;

/** The game marks a manually craftable resource with an uncapped storage maximum. */
const UNCAPPED_MAXIMUM = -1;

/** `<span id="inc<Resource>A">` wraps the craft-all button the game renders for that row. */
const CRAFT_ALL_BUTTON_PREFIX = "inc";
const CRAFT_ALL_BUTTON_SUFFIX = "A";

/** The script's own headroom above the preserve threshold before spare quantity is used instead. */
const DEMAND_HEADROOM = 0.05;

/** Tolerated floating-point drift when confirming what the game actually spent. */
const SPEND_EPSILON = 1e-6;

/** The subset of the page this adapter touches. */
export interface CraftingDocument {
  getElementById(elementId: string): unknown;
}

export interface CapturedCraftingDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly costs: CapturedCraftCosts;
  readonly getDocument: () => CraftingDocument;
  readonly readSettings: () => unknown;
  /** Game periods completed since the last run, as the game reported them. */
  readonly readPeriods: () => number;
  /** The cycle's demand sample, shared with the other features that read it. */
  readonly readDemand: () => CapturedDemandSample;
}

interface CraftingSession {
  readonly root: unknown;
  readonly candidates: readonly string[];
  readonly ticksPerSecond: number;
  readonly demand: CapturedDemandSample;
}

/** The two questions about the craftable itself that decide how its materials are judged. */
interface CraftableDemandView {
  readonly craftableDemanded: boolean;
  readonly craftableBelowRequirement: boolean;
}

function readSettingsRecord(value: unknown): Record<PropertyKey, unknown> {
  return isRecord(value) ? value : {};
}

function craftEnabled(
  settings: Record<PropertyKey, unknown>,
  id: string,
): boolean {
  const value = settings[`craft${id}`];
  // Lazily absent per-resource settings default to enabled, as the game's own defaults do.
  return typeof value === "boolean" ? value : true;
}

function craftPreserve(
  settings: Record<PropertyKey, unknown>,
  id: string,
): number {
  const value = finite(settings[`foundry_p_${id}`]);
  return value !== undefined && value >= 0 && value <= 1 ? value : 0;
}

function craftAllButtonRendered(
  getDocument: () => CraftingDocument,
  id: string,
): boolean {
  const element = getDocument().getElementById(
    `${CRAFT_ALL_BUTTON_PREFIX}${id}${CRAFT_ALL_BUTTON_SUFFIX}`,
  );
  return element !== null && element !== undefined;
}

function readCandidates(
  dependencies: CapturedCraftingDependencies,
  root: unknown,
): readonly string[] {
  const resources = readProperty(root, "resource");
  if (!isRecord(resources)) return [];
  const settings = readSettingsRecord(dependencies.readSettings());
  const candidates: string[] = [];
  for (const id of Object.keys(resources)) {
    const resource = resources[id];
    if (
      readProperty(resource, "max") !== UNCAPPED_MAXIMUM ||
      readProperty(resource, "display") !== true ||
      !craftEnabled(settings, id) ||
      dependencies.controls.resolve(`${CRAFT_ROW_PREFIX}${id}`) === undefined ||
      !craftAllButtonRendered(dependencies.getDocument, id)
    ) {
      continue;
    }
    candidates.push(id);
  }
  return Object.freeze(candidates);
}

function readMaterials(
  dependencies: CapturedCraftingDependencies,
  session: CraftingSession & CraftableDemandView,
  craftableId: string,
): readonly CraftMaterialView[] | undefined {
  const costs = dependencies.costs.read(craftableId);
  if (costs === undefined) return undefined;
  const resources = readProperty(session.root, "resource");
  if (!isRecord(resources)) return undefined;
  const settings = readSettingsRecord(dependencies.readSettings());
  const preserve = craftPreserve(settings, craftableId);

  const materials: CraftMaterialView[] = [];
  for (const [resourceId, costPerCraft] of costs) {
    const resource = readProperty(resources, resourceId);
    const currentQuantity = finite(readProperty(resource, "amount"));
    const maxQuantity = finite(readProperty(resource, "max"));
    const rateOfChange = finite(readProperty(resource, "diff"));
    if (
      currentQuantity === undefined ||
      maxQuantity === undefined ||
      rateOfChange === undefined
    ) {
      return undefined;
    }
    const base = {
      resourceId,
      costPerCraft,
      currentQuantity,
      maxQuantity,
      craftPreserve: preserve,
    };
    const capped = maxQuantity > 0 && currentQuantity >= maxQuantity;
    const spareQuantity =
      currentQuantity - session.demand.requestedQuantity(resourceId);
    materials.push(
      Object.freeze(
        session.craftableDemanded
          ? {
              ...base,
              mode: "demanded" as const,
              // Below the preserve threshold the whole holding is available; above it, only what
              // nothing else has spoken for.
              availableQuantity:
                currentQuantity < maxQuantity * (preserve + DEMAND_HEADROOM)
                  ? currentQuantity
                  : spareQuantity,
            }
          : session.demand.isDemanded(resourceId)
            ? { ...base, mode: "blocked" as const }
            : session.craftableBelowRequirement
              ? {
                  ...base,
                  mode: "required" as const,
                  availableQuantity: spareQuantity,
                }
              : currentQuantity < session.demand.storageRequired(resourceId) &&
                  !capped
                ? { ...base, mode: "blocked" as const }
                : {
                    ...base,
                    mode: "income" as const,
                    rateOfChange,
                    ticksPerSecond: session.ticksPerSecond,
                  },
      ),
    );
  }
  return Object.freeze(materials);
}

export function createCapturedCraftReader(
  dependencies: CapturedCraftingDependencies,
): CraftReader {
  let session: CraftingSession | null = null;

  return Object.freeze({
    readGate(): CraftGateInput {
      const root = dependencies.rootState.readRoot();
      const race = readProperty(root, "race");
      const resources = readProperty(root, "resource");
      const species = readProperty(race, "species");
      const citizens =
        typeof species === "string"
          ? readProperty(resources, species)
          : undefined;
      const periods = finite(dependencies.readPeriods());
      session = Object.freeze({
        root,
        demand: dependencies.readDemand(),
        candidates: readCandidates(dependencies, root),
        ticksPerSecond:
          periods !== undefined && periods >= 1
            ? PERIODS_PER_SECOND / periods
            : PERIODS_PER_SECOND,
      });
      return Object.freeze({
        populationUnlocked: readProperty(citizens, "display") === true,
        noCraft: Boolean(readProperty(race, "no_craft")),
      });
    },

    readCandidate(index: number): CraftCandidateInput | null {
      if (session === null || index >= session.candidates.length) return null;
      const craftableId = session.candidates[index];
      if (craftableId === undefined) return null;
      const craftable = readProperty(
        readProperty(session.root, "resource"),
        craftableId,
      );
      const craftableAmount = finite(readProperty(craftable, "amount")) ?? 0;
      const materials = readMaterials(
        dependencies,
        {
          ...session,
          craftableDemanded: session.demand.isDemanded(craftableId),
          // A craftable the plan wants more of in storage is worth spending spare materials on,
          // rather than only the income they happen to be producing.
          craftableBelowRequirement:
            craftableAmount < session.demand.storageRequired(craftableId),
        },
        craftableId,
      );
      // An unreadable recipe leaves the resource alone for this run; it never guesses a cost.
      if (materials === undefined) {
        return Object.freeze({
          index,
          craftableId: null,
          unlocked: true,
          autoCraftEnabled: false,
          materials: Object.freeze([]),
        });
      }
      return Object.freeze({
        index,
        craftableId,
        unlocked: true,
        autoCraftEnabled: true,
        materials,
      });
    },
  });
}

export function createCapturedCraftExecutor(
  dependencies: Pick<CapturedCraftingDependencies, "rootState" | "controls">,
): DecisionExecutor<CraftDecision> {
  return Object.freeze({
    execute(decision: Readonly<CraftDecision>) {
      if (!Number.isSafeInteger(decision.count) || decision.count < 1) {
        return rejected(
          "invalid-craft-count",
          "craft count must be a positive safe integer",
        );
      }
      const handle = dependencies.controls.resolve(
        `${CRAFT_ROW_PREFIX}${decision.craftableId}`,
      );
      if (handle === undefined) {
        return stale(
          "craft-control-missing",
          "captured craft row is unavailable",
          { craftableId: decision.craftableId },
        );
      }

      const resources = readProperty(
        dependencies.rootState.readRoot(),
        "resource",
      );
      for (const spend of decision.spend) {
        const actual = finite(
          readProperty(readProperty(resources, spend.resourceId), "amount"),
        );
        if (actual !== spend.expectedCurrentQuantity) {
          return stale(
            "stale-craft-material",
            "craft material amount changed",
            {
              resourceId: spend.resourceId,
              expected: spend.expectedCurrentQuantity,
              actual: actual ?? null,
            },
          );
        }
      }

      const result = dependencies.controls.invoke(handle, "craft", [
        decision.craftableId,
        decision.count,
      ]);
      if (!result.ok) {
        return rejected("craft-control-failed", result.detail ?? result.reason);
      }

      // The game owns the amounts it spends; this only confirms it stayed inside the plan, which
      // it would not if the player's craft multiplier changed between the cost read and the craft.
      for (const spend of decision.spend) {
        const actual = finite(
          readProperty(readProperty(resources, spend.resourceId), "amount"),
        );
        if (
          actual === undefined ||
          actual + SPEND_EPSILON < spend.expectedCurrentQuantity - spend.amount
        ) {
          return stale("craft-overspent", "craft spent more than planned", {
            resourceId: spend.resourceId,
            planned: spend.amount,
            actual: actual ?? null,
          });
        }
      }
      return SUCCEEDED;
    },
  });
}
