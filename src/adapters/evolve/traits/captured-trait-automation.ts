import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import {
  type GeneticsMinorTraitCandidate,
  type GeneticsMinorTraitInput,
  type GeneticsMinorTraitUpgradeDecision,
} from "../../../domain/traits/minor-trait.ts";
import {
  type GeneticsMutationInput,
  type GeneticsMutationOperation,
  type GeneticsMutationDecision,
  type MutationKind,
} from "../../../domain/traits/mutation.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
  GameControlResult,
} from "../../../ports/game-control-registry.ts";
import type { GameKeyStateReader } from "../../../ports/game-key-state.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { GeneticsMinorTraitReader } from "../../../ports/minor-trait.ts";
import type { GeneticsMutationReader } from "../../../ports/mutation.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";
import { readCapturedClickMultiplierState } from "./captured-genetics.ts";

/** The one Genetics 2.0 binding created by `genetics()` for the live breakdown. */
export const GENETICS_BREAKDOWN_CONTROL = "geneticBreakdown";

interface MinorTarget {
  readonly candidate: GeneticsMinorTraitCandidate;
  readonly handle: GameControlHandle;
  readonly minor: Record<PropertyKey, unknown>;
  readonly race: Record<PropertyKey, unknown>;
  readonly expectedTotalRank: number;
}

interface MinorSession {
  readonly root: unknown;
  readonly genes: Record<PropertyKey, unknown>;
  readonly targets: readonly MinorTarget[];
}

interface MutationAction {
  readonly traitId: string;
  readonly operation: MutationKind;
  readonly rowIndex: number;
}

interface MutationTarget {
  readonly operation: GeneticsMutationOperation;
  readonly handle: GameControlHandle;
  readonly race: Record<PropertyKey, unknown>;
  readonly bank: Record<PropertyKey, unknown>;
}

interface MutationSession {
  readonly root: unknown;
  readonly race: Record<PropertyKey, unknown>;
  readonly bank: Record<PropertyKey, unknown>;
  readonly reserve: number;
  readonly targets: readonly MutationTarget[];
}

interface MinorBlock {
  readonly root: unknown;
  readonly generation: number;
  readonly expectedGenes: number;
}

interface MutationBlock {
  readonly root: unknown;
  readonly generation: number;
  readonly expectedCurrencyQuantity: number;
}

export interface CapturedTraitAutomationDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly keyState: GameKeyStateReader;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
  /**
   * Optional structured numeric mutation-cost capability supplied by a game-owned adapter.
   * `addCost` and `removeCost` are deliberately not used: the public Vue methods return localized
   * presentation strings. Without this capability the executor can only safely act with a zero
   * reserve, where the game's `gain`/`purge` method remains the affordability authority.
   */
  readonly readMutationCost?: (
    root: unknown,
    traitId: string,
    operation: MutationKind,
  ) => unknown;
}

export interface CapturedTraitAutomation {
  readonly minor: {
    readonly reader: GeneticsMinorTraitReader;
    readonly executor: DecisionExecutor<GeneticsMinorTraitUpgradeDecision>;
  };
  readonly mutation: {
    readonly reader: GeneticsMutationReader;
    readonly executor: DecisionExecutor<GeneticsMutationDecision>;
  };
}

function queryOne(owner: unknown, selector: string): unknown {
  const query = readProperty(owner, "querySelector");
  if (typeof query !== "function") return undefined;
  try {
    return Reflect.apply(query, owner, [selector]);
  } catch {
    return undefined;
  }
}

function queryMany(
  owner: unknown,
  selector: string,
): readonly unknown[] | undefined {
  const query = readProperty(owner, "querySelectorAll");
  if (typeof query !== "function") return undefined;
  let result: unknown;
  try {
    result = Reflect.apply(query, owner, [selector]);
  } catch {
    return undefined;
  }
  const length = finite(readProperty(result, "length"));
  if (length === undefined || !Number.isSafeInteger(length) || length < 0) {
    return undefined;
  }
  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const value = readProperty(result, String(index));
    if (value !== undefined && value !== null) values.push(value);
  }
  return Object.freeze(values);
}

function readElementText(element: unknown): string | undefined {
  for (const key of ["textContent", "innerText"]) {
    const value = readProperty(element, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function classTokens(element: unknown): readonly string[] {
  const className = readProperty(element, "className");
  return typeof className === "string"
    ? Object.freeze(className.split(/\s+/).filter((token) => token.length > 0))
    : Object.freeze([]);
}

function own(record: Record<PropertyKey, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function invoke(
  controls: GameControlRegistry,
  handle: GameControlHandle,
  method: string,
  args: readonly unknown[] = [],
): GameControlResult | undefined {
  if (!handle.methods.includes(method)) return undefined;
  try {
    return controls.invoke(handle, method, args);
  } catch {
    return undefined;
  }
}

function invokeBoolean(
  controls: GameControlRegistry,
  handle: GameControlHandle,
  method: string,
  args: readonly unknown[] = [],
): boolean | undefined {
  const result = invoke(controls, handle, method, args);
  return result?.ok === true && typeof result.value === "boolean"
    ? result.value
    : undefined;
}

function unavailableMinor(): GeneticsMinorTraitInput {
  return Object.freeze({
    available: false,
    currentGenes: 0,
    traits: Object.freeze([]),
  });
}

function unavailableMutation(): GeneticsMutationInput {
  return Object.freeze({
    available: false,
    currency: null,
    operations: Object.freeze([]),
  });
}

function readTraitGeneticsLevel(root: unknown): number | undefined {
  return finite(readProperty(readProperty(root, "tech"), "genetics"));
}

function readGenes(root: unknown): Record<PropertyKey, unknown> | undefined {
  const resource = readProperty(root, "resource");
  const genes = readProperty(resource, "Genes");
  return isRecord(genes) ? genes : undefined;
}

function readRace(root: unknown): Record<PropertyKey, unknown> | undefined {
  const race = readProperty(root, "race");
  return isRecord(race) ? race : undefined;
}

function readMinorOrder(root: unknown): readonly string[] | undefined {
  const order = readProperty(readProperty(root, "settings"), "mtorder");
  if (!Array.isArray(order)) return undefined;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of order) {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
      return undefined;
    }
    seen.add(value);
    result.push(value);
  }
  return Object.freeze(result);
}

function readMinorRows(document: unknown): readonly unknown[] | undefined {
  return queryMany(document, "#geneticBreakdown #geneticMinor .traitRow");
}

function readMinorTraitId(row: unknown): string | undefined {
  return readElementText(queryOne(row, "h4"));
}

function readRaceRank(
  race: Record<PropertyKey, unknown>,
  traitId: string,
): number | undefined {
  const value = readProperty(race, traitId);
  if (value === undefined) return 0;
  const rank = finite(value);
  return rank !== undefined && Number.isSafeInteger(rank) && rank >= 0
    ? rank
    : undefined;
}

function isBlockedMinor(
  blocked: MinorBlock | null,
  root: unknown,
  handle: GameControlHandle,
  genes: number,
): boolean {
  return (
    blocked !== null &&
    blocked.root === root &&
    blocked.generation === handle.generation &&
    blocked.expectedGenes === genes
  );
}

function readMutationAction(
  row: unknown,
  rowIndex: number,
): MutationAction | undefined {
  const descendants = queryMany(row, "*");
  const elements = descendants === undefined ? [row] : [row, ...descendants];
  for (const element of elements) {
    for (const token of classTokens(element)) {
      if (token.startsWith("add") && token.length > 3) {
        return Object.freeze({
          traitId: token.slice(3),
          operation: "gain",
          rowIndex,
        });
      }
      if (token.startsWith("remove") && token.length > 6) {
        return Object.freeze({
          traitId: token.slice(6),
          operation: "purge",
          rowIndex,
        });
      }
    }
  }
  return undefined;
}

function readMutationActions(
  document: unknown,
): readonly MutationAction[] | undefined {
  const rows = queryMany(document, "#geneticBreakdown .traitRow");
  if (rows === undefined) return undefined;
  const actions: MutationAction[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const action = readMutationAction(rows[index], index);
    if (action !== undefined) actions.push(action);
  }
  return Object.freeze(actions);
}

function readMutationReserve(
  settings: unknown,
  root: unknown,
): number | undefined {
  const rawMinimum = readProperty(settings, "minimumPlasmidsToPreserve");
  const minimum = rawMinimum === undefined ? 0 : finite(rawMinimum);
  if (minimum === undefined || minimum < 0) return undefined;

  const rawSoftcap = readProperty(settings, "doNotGoBelowPlasmidSoftcap");
  const softcap = rawSoftcap === undefined ? true : rawSoftcap;
  if (typeof softcap !== "boolean") return undefined;
  if (!softcap) return minimum;

  const phage = readProperty(readProperty(root, "prestige"), "Phage");
  const phageCount = finite(readProperty(phage, "count"));
  return phageCount === undefined || phageCount < 0
    ? undefined
    : Math.max(minimum, phageCount + 250);
}

function readOptionalFlag(settings: unknown, key: string): boolean | undefined {
  const value = readProperty(settings, key);
  return value === undefined
    ? false
    : typeof value === "boolean"
      ? value
      : undefined;
}

function readPriority(settings: unknown, traitId: string): number | undefined {
  return finite(readProperty(settings, `mutableTrait_p_${traitId}`));
}

function readAuthoritativeMutationCost(
  dependencies: CapturedTraitAutomationDependencies,
  root: unknown,
  traitId: string,
  operation: MutationKind,
): number | null {
  const readCost = dependencies.readMutationCost;
  if (readCost === undefined) return null;
  try {
    const value = finite(readCost(root, traitId, operation));
    return value !== undefined && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function readCurrentMutationEligibility(
  settings: unknown,
  race: Record<PropertyKey, unknown>,
  action: MutationAction,
  handle: GameControlHandle,
): boolean | null {
  if (!handle.methods.includes(action.operation)) return null;
  const gain = readOptionalFlag(
    settings,
    `mutableTrait_gain_${action.traitId}`,
  );
  const purge = readOptionalFlag(
    settings,
    `mutableTrait_purge_${action.traitId}`,
  );
  if (gain === undefined || purge === undefined) return null;
  if (gain && purge) return false;
  if (action.operation === "gain") {
    return gain && !own(race, action.traitId) ? true : false;
  }
  return purge && own(race, action.traitId) ? true : false;
}

export function createCapturedTraitAutomation(
  dependencies: CapturedTraitAutomationDependencies,
): CapturedTraitAutomation {
  let minorSession: MinorSession | null = null;
  let mutationSession: MutationSession | null = null;
  let blockedMinor: MinorBlock | null = null;
  let blockedMutation: MutationBlock | null = null;

  const minorReader: GeneticsMinorTraitReader = Object.freeze({
    read(): GeneticsMinorTraitInput {
      const root = dependencies.rootState.readRoot();
      const level = readTraitGeneticsLevel(root);
      const genes = readGenes(root);
      const race = readRace(root);
      const minor = readProperty(race, "minor");
      const order = readMinorOrder(root);
      const document = dependencies.getDocument();
      const handle = dependencies.controls.resolve(GENETICS_BREAKDOWN_CONTROL);
      if (
        level === undefined ||
        level <= 2 ||
        genes === undefined ||
        race === undefined ||
        !isRecord(minor) ||
        order === undefined ||
        document === undefined ||
        document === null ||
        handle === undefined ||
        !handle.methods.includes("gene") ||
        !handle.methods.includes("genePurchasable")
      ) {
        minorSession = null;
        return unavailableMinor();
      }
      const currentGenes = finite(readProperty(genes, "amount"));
      if (currentGenes === undefined || currentGenes < 0) {
        minorSession = null;
        return unavailableMinor();
      }
      const rows = readMinorRows(document);
      if (rows === undefined) {
        minorSession = null;
        return unavailableMinor();
      }

      const rowsByTrait = new Map<string, unknown>();
      for (const row of rows) {
        const traitId = readMinorTraitId(row);
        if (traitId === undefined || rowsByTrait.has(traitId)) {
          minorSession = null;
          return unavailableMinor();
        }
        rowsByTrait.set(traitId, row);
      }

      const targets: MinorTarget[] = [];
      const candidates: GeneticsMinorTraitCandidate[] = [];
      for (const traitId of order) {
        const row = rowsByTrait.get(traitId);
        if (row === undefined) continue;
        const rank = finite(readProperty(minor, traitId));
        const expectedTotalRank = readRaceRank(race, traitId);
        if (
          rank === undefined ||
          !Number.isSafeInteger(rank) ||
          rank < 0 ||
          expectedTotalRank === undefined
        ) {
          minorSession = null;
          return unavailableMinor();
        }
        const eligible = isBlockedMinor(
          blockedMinor,
          root,
          handle,
          currentGenes,
        )
          ? false
          : (invokeBoolean(dependencies.controls, handle, "genePurchasable", [
              traitId,
            ]) ?? null);
        const candidate = Object.freeze({
          traitId,
          source: "genetic-breakdown" as const,
          rank,
          // geneCost() is localized; genePurchasable()/gene() own affordability and spending.
          cost: null,
          eligible,
        });
        candidates.push(candidate);
        targets.push({
          candidate,
          handle,
          minor,
          race,
          expectedTotalRank,
        });
      }

      minorSession = Object.freeze({
        root,
        genes,
        targets: Object.freeze(targets),
      });
      return Object.freeze({
        available: true,
        currentGenes,
        traits: Object.freeze(candidates),
      });
    },
  });

  const minorExecutor: DecisionExecutor<GeneticsMinorTraitUpgradeDecision> =
    Object.freeze({
      execute(
        decision: Readonly<GeneticsMinorTraitUpgradeDecision>,
      ): CommandExecutionOutcome {
        const active = minorSession;
        if (active === null) {
          return stale(
            "minor-trait-session-missing",
            "minor-trait session is missing",
          );
        }
        if (dependencies.rootState.readRoot() !== active.root) {
          return stale(
            "minor-trait-root-changed",
            "captured game root changed",
          );
        }
        const actualGenes = finite(readProperty(active.genes, "amount"));
        if (actualGenes !== decision.expectedGenes) {
          return stale("minor-trait-genes-changed", "Genes balance changed");
        }
        const target = active.targets.find(
          ({ candidate }) => candidate.traitId === decision.traitId,
        );
        if (target === undefined) {
          return stale(
            "minor-trait-target-changed",
            "minor-trait target changed",
          );
        }
        const currentHandle = dependencies.controls.resolve(
          GENETICS_BREAKDOWN_CONTROL,
        );
        if (
          currentHandle === undefined ||
          currentHandle.generation !== target.handle.generation
        ) {
          return stale(
            "minor-trait-control-stale",
            "genetics breakdown control was rebound",
          );
        }
        const currentRank = finite(
          readProperty(target.minor, target.candidate.traitId),
        );
        if (currentRank !== decision.expectedRank) {
          return stale("minor-trait-rank-changed", "minor-trait rank changed");
        }
        const legal = invokeBoolean(
          dependencies.controls,
          target.handle,
          "genePurchasable",
          [decision.traitId],
        );
        if (legal !== true) {
          return stale(
            "minor-trait-capability-changed",
            "minor-trait capability changed",
          );
        }
        const multiplier = readCapturedClickMultiplierState(
          active.root,
          dependencies.keyState,
        );
        if (multiplier !== false) {
          return stale(
            multiplier === true
              ? "minor-trait-click-multiplier-held"
              : "minor-trait-click-multiplier-unknown",
            multiplier === true
              ? "click multiplier is held"
              : "click multiplier state is unavailable",
          );
        }
        const result = invoke(dependencies.controls, target.handle, "gene", [
          decision.traitId,
        ]);
        if (result?.ok !== true) {
          blockedMinor = Object.freeze({
            root: active.root,
            generation: target.handle.generation,
            expectedGenes: decision.expectedGenes,
          });
          return stale(
            "minor-trait-invocation-failed",
            result?.reason ?? "minor-trait invocation failed",
          );
        }
        const afterGenes = finite(readProperty(active.genes, "amount"));
        const afterRank = finite(
          readProperty(target.minor, target.candidate.traitId),
        );
        const afterTotalRank = readRaceRank(
          target.race,
          target.candidate.traitId,
        );
        if (
          afterGenes === undefined ||
          afterGenes >= decision.expectedGenes ||
          afterRank !== decision.expectedRank + 1 ||
          afterTotalRank !== target.expectedTotalRank + 1
        ) {
          blockedMinor = Object.freeze({
            root: active.root,
            generation: target.handle.generation,
            expectedGenes: decision.expectedGenes,
          });
          return stale(
            "minor-trait-noop",
            "minor-trait invocation produced no verified upgrade",
          );
        }
        blockedMinor = null;
        return SUCCEEDED;
      },
    });

  const mutationReader: GeneticsMutationReader = Object.freeze({
    read(): GeneticsMutationInput {
      const root = dependencies.rootState.readRoot();
      const level = readTraitGeneticsLevel(root);
      const race = readRace(root);
      const prestige = readProperty(root, "prestige");
      const universe = readProperty(race, "universe");
      const currencyId = universe === "antimatter" ? "AntiPlasmid" : "Plasmid";
      const bank = readProperty(prestige, currencyId);
      const handle = dependencies.controls.resolve(GENETICS_BREAKDOWN_CONTROL);
      const reserve = readMutationReserve(dependencies.readSettings(), root);
      const currentQuantity = finite(readProperty(bank, "count"));
      const document = dependencies.getDocument();
      if (
        level === undefined ||
        level <= 2 ||
        race === undefined ||
        typeof universe !== "string" ||
        !isRecord(bank) ||
        reserve === undefined ||
        currentQuantity === undefined ||
        currentQuantity < 0 ||
        handle === undefined ||
        document === undefined ||
        document === null ||
        (!handle.methods.includes("gain") && !handle.methods.includes("purge"))
      ) {
        mutationSession = null;
        return unavailableMutation();
      }
      const actions = readMutationActions(document);
      if (actions === undefined) {
        mutationSession = null;
        return unavailableMutation();
      }

      const settings = dependencies.readSettings();
      const orderedActions = actions
        .map((action) => {
          const priority = readPriority(settings, action.traitId);
          return priority === undefined ? undefined : { action, priority };
        })
        .filter(
          (value): value is { action: MutationAction; priority: number } =>
            value !== undefined,
        )
        .sort(
          (left, right) =>
            left.priority - right.priority ||
            left.action.rowIndex - right.action.rowIndex,
        );

      const targets: MutationTarget[] = [];
      const operations: GeneticsMutationOperation[] = [];
      for (const { action } of orderedActions) {
        const eligible = readCurrentMutationEligibility(
          settings,
          race,
          action,
          handle,
        );
        const operation = Object.freeze({
          traitId: action.traitId,
          kind: action.operation,
          cost: readAuthoritativeMutationCost(
            dependencies,
            root,
            action.traitId,
            action.operation,
          ),
          eligible,
          fromPresent: action.operation === "purge",
        });
        operations.push(operation);
        targets.push({ operation, handle, race, bank });
      }
      const visibleOperations = operations.map((operation) => {
        const blocked =
          blockedMutation !== null &&
          blockedMutation.root === root &&
          blockedMutation.generation === handle.generation &&
          blockedMutation.expectedCurrencyQuantity === currentQuantity;
        return blocked
          ? Object.freeze({ ...operation, eligible: false })
          : operation;
      });
      mutationSession = Object.freeze({
        root,
        race,
        bank,
        reserve,
        targets: Object.freeze(targets),
      });
      return Object.freeze({
        available: true,
        currency: Object.freeze({
          id: currencyId,
          currentQuantity,
          reserve,
        }),
        operations: Object.freeze(visibleOperations),
      });
    },
  });

  const mutationExecutor: DecisionExecutor<GeneticsMutationDecision> =
    Object.freeze({
      execute(
        decision: Readonly<GeneticsMutationDecision>,
      ): CommandExecutionOutcome {
        const active = mutationSession;
        if (active === null) {
          return stale(
            "mutation-session-missing",
            "mutation session is missing",
          );
        }
        if (dependencies.rootState.readRoot() !== active.root) {
          return stale("mutation-root-changed", "captured game root changed");
        }
        const actualUniverse = readProperty(active.race, "universe");
        const actualCurrencyId =
          actualUniverse === "antimatter" ? "AntiPlasmid" : "Plasmid";
        const actualQuantity = finite(readProperty(active.bank, "count"));
        const currentReserve = readMutationReserve(
          dependencies.readSettings(),
          active.root,
        );
        if (
          typeof actualUniverse !== "string" ||
          actualCurrencyId !== decision.currencyId ||
          actualQuantity !== decision.expectedCurrencyQuantity ||
          currentReserve !== decision.reserve
        ) {
          return stale("mutation-state-changed", "mutation state changed");
        }
        const target = active.targets.find(
          ({ operation }) =>
            operation.traitId === decision.traitId &&
            operation.kind === decision.operation,
        );
        if (target === undefined) {
          return stale("mutation-target-changed", "mutation target changed");
        }
        const currentHandle = dependencies.controls.resolve(
          GENETICS_BREAKDOWN_CONTROL,
        );
        if (
          currentHandle === undefined ||
          currentHandle.generation !== target.handle.generation
        ) {
          return stale(
            "mutation-control-stale",
            "genetics breakdown control was rebound",
          );
        }
        if (own(active.race, decision.traitId) !== decision.fromPresent) {
          return stale("mutation-trait-changed", "mutation trait changed");
        }
        const currentActions = readMutationActions(dependencies.getDocument());
        const currentAction = currentActions?.find(
          (action) =>
            action.traitId === decision.traitId &&
            action.operation === decision.operation,
        );
        if (currentAction === undefined) {
          return stale(
            "mutation-capability-changed",
            "mutation is no longer offered",
          );
        }
        const currentEligibility = readCurrentMutationEligibility(
          dependencies.readSettings(),
          active.race,
          currentAction,
          target.handle,
        );
        if (currentEligibility !== true) {
          return stale(
            "mutation-policy-changed",
            "mutation policy or capability changed",
          );
        }
        if (decision.cost !== null) {
          const currentCost = readAuthoritativeMutationCost(
            dependencies,
            active.root,
            decision.traitId,
            decision.operation,
          );
          if (
            currentCost === null ||
            currentCost !== decision.cost ||
            actualQuantity - currentCost < decision.reserve
          ) {
            return stale(
              "mutation-cost-changed",
              "mutation cost or reserve changed",
            );
          }
        } else if (decision.reserve !== 0) {
          return stale(
            "mutation-cost-unknown",
            "mutation cost is unknown while a reserve is configured",
          );
        }
        const multiplier = readCapturedClickMultiplierState(
          active.root,
          dependencies.keyState,
        );
        if (multiplier !== false) {
          return stale(
            multiplier === true
              ? "mutation-click-multiplier-held"
              : "mutation-click-multiplier-unknown",
            multiplier === true
              ? "click multiplier is held"
              : "click multiplier state is unavailable",
          );
        }
        const result = invoke(
          dependencies.controls,
          target.handle,
          decision.operation,
          [decision.traitId],
        );
        if (result?.ok !== true) {
          blockedMutation = Object.freeze({
            root: active.root,
            generation: target.handle.generation,
            expectedCurrencyQuantity: decision.expectedCurrencyQuantity,
          });
          return stale(
            "mutation-invocation-failed",
            result?.reason ?? "mutation invocation failed",
          );
        }
        const afterQuantity = finite(readProperty(active.bank, "count"));
        const afterPresent = own(active.race, decision.traitId);
        const postcondition =
          afterQuantity !== undefined &&
          afterQuantity >= decision.reserve &&
          afterPresent === decision.toPresent &&
          (decision.cost === null
            ? afterQuantity <= decision.expectedCurrencyQuantity
            : afterQuantity ===
              decision.expectedCurrencyQuantity - decision.cost);
        if (!postcondition) {
          blockedMutation = Object.freeze({
            root: active.root,
            generation: target.handle.generation,
            expectedCurrencyQuantity: decision.expectedCurrencyQuantity,
          });
          return stale(
            "mutation-noop",
            "mutation invocation produced no verified state change",
          );
        }
        blockedMutation = null;
        return SUCCEEDED;
      },
    });

  return Object.freeze({
    minor: Object.freeze({ reader: minorReader, executor: minorExecutor }),
    mutation: Object.freeze({
      reader: mutationReader,
      executor: mutationExecutor,
    }),
  });
}
