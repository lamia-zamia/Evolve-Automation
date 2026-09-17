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

/** The live Genetics 2.0 ecosystem panels owned by `drawEcosystem()`. */
export const GENETICS_ECOSYSTEM_TYPES = Object.freeze([
  "trees",
  "herbivores",
  "carnivores",
  "scavengers",
] as const);

/** The `geneSlotPanel()` binding that owns ranking and mutation methods. */
export const GENE_SLOTS_CONTROL = "geneSlots";

interface MinorTarget {
  readonly candidate: GeneticsMinorTraitCandidate;
  readonly handle: GameControlHandle;
  readonly surface: Record<PropertyKey, unknown>;
  readonly traits: Record<PropertyKey, unknown>;
}

interface MinorSession {
  readonly root: unknown;
  readonly genes: Record<PropertyKey, unknown>;
  readonly targets: readonly MinorTarget[];
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

function invokeFinite(
  controls: GameControlRegistry,
  handle: GameControlHandle,
  method: string,
  args: readonly unknown[] = [],
): number | undefined {
  const result = invoke(controls, handle, method, args);
  return result?.ok === true ? finite(result.value) : undefined;
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

function readEcoType(row: unknown): string | undefined {
  const heading = queryOne(row, "h4");
  const text = readElementText(heading);
  return text === undefined ? undefined : text;
}

function readMinorRows(
  document: unknown,
  ecosystem: string,
): readonly unknown[] | undefined {
  return queryMany(document, `#geneticMinor_${ecosystem} .traitRow`);
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
): { readonly traitId: string; readonly operation: MutationKind } | undefined {
  const descendants = queryMany(row, "*");
  const elements = descendants === undefined ? [row] : [row, ...descendants];
  for (const element of elements) {
    for (const token of classTokens(element)) {
      if (token.startsWith("add") && token.length > 3) {
        return Object.freeze({
          traitId: token.slice(3),
          operation: "gain",
        });
      }
      if (token.startsWith("remove") && token.length > 6) {
        return Object.freeze({
          traitId: token.slice(6),
          operation: "purge",
        });
      }
    }
  }
  return undefined;
}

function readMutationActions(
  document: unknown,
):
  | readonly { readonly traitId: string; readonly operation: MutationKind }[]
  | undefined {
  const rows = queryMany(document, "#geneSlots .traitRow");
  if (rows === undefined) return undefined;
  const actions: Array<{
    readonly traitId: string;
    readonly operation: MutationKind;
  }> = [];
  for (const row of rows) {
    const action = readMutationAction(row);
    if (action !== undefined) actions.push(action);
  }
  // Legacy intent preferred adding a trait before removing one. The rows within either group
  // remain in the order the current Genetics 2.0 panel rendered them.
  return Object.freeze([
    ...actions.filter(({ operation }) => operation === "gain"),
    ...actions.filter(({ operation }) => operation === "purge"),
  ]);
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
      const document = dependencies.getDocument();
      if (
        level === undefined ||
        level <= 2 ||
        genes === undefined ||
        document === undefined ||
        document === null
      ) {
        minorSession = null;
        return unavailableMinor();
      }
      const currentGenes = finite(readProperty(genes, "amount"));
      if (currentGenes === undefined || currentGenes < 0) {
        minorSession = null;
        return unavailableMinor();
      }

      const targets: MinorTarget[] = [];
      const candidates: GeneticsMinorTraitCandidate[] = [];
      for (const ecosystem of GENETICS_ECOSYSTEM_TYPES) {
        const surface = readProperty(readProperty(root, "surface"), ecosystem);
        const traits = readProperty(surface, "traits");
        const handle = dependencies.controls.resolve(
          `geneticMinor_${ecosystem}`,
        );
        if (!isRecord(surface) || !isRecord(traits) || handle === undefined) {
          continue;
        }
        const rows = readMinorRows(document, ecosystem);
        if (rows === undefined) continue;
        for (const row of rows) {
          const ecosystemTrait = readEcoType(row);
          if (ecosystemTrait === undefined) continue;
          const rank = finite(readProperty(traits, ecosystemTrait));
          if (rank === undefined || rank < 0) continue;
          const cost = invokeFinite(dependencies.controls, handle, "geneCost", [
            ecosystem,
            ecosystemTrait,
          ]);
          const legal = invokeBoolean(
            dependencies.controls,
            handle,
            "genePurchasable",
            [ecosystem, ecosystemTrait],
          );
          const candidate = Object.freeze({
            traitId: `${ecosystem}:${ecosystemTrait}`,
            source: "ecosystem" as const,
            ecosystem,
            ecosystemTrait,
            rank,
            cost: cost ?? null,
            eligible: isBlockedMinor(blockedMinor, root, handle, currentGenes)
              ? false
              : (legal ?? null),
          });
          candidates.push(candidate);
          targets.push({ candidate, handle, surface, traits });
        }
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
        const genes = readGenes(active.root);
        const actualGenes = finite(readProperty(genes, "amount"));
        if (genes !== active.genes || actualGenes !== decision.expectedGenes) {
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
          `geneticMinor_${target.candidate.ecosystem}`,
        );
        if (
          currentHandle === undefined ||
          currentHandle.generation !== target.handle.generation
        ) {
          return stale(
            "minor-trait-control-stale",
            "minor-trait control was rebound",
          );
        }
        const currentRank = finite(
          readProperty(target.traits, target.candidate.ecosystemTrait),
        );
        if (currentRank !== decision.expectedRank) {
          return stale("minor-trait-rank-changed", "minor-trait rank changed");
        }
        const legal = invokeBoolean(
          dependencies.controls,
          target.handle,
          "genePurchasable",
          [target.candidate.ecosystem, target.candidate.ecosystemTrait],
        );
        const cost = invokeFinite(
          dependencies.controls,
          target.handle,
          "geneCost",
          [target.candidate.ecosystem, target.candidate.ecosystemTrait],
        );
        if (legal !== true || cost !== decision.expectedCost) {
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
          target.candidate.ecosystem,
          target.candidate.ecosystemTrait,
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
          readProperty(target.traits, target.candidate.ecosystemTrait),
        );
        if (
          afterGenes !== decision.expectedGenes - decision.expectedCost ||
          afterRank !== decision.expectedRank + 1
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
      const race = readProperty(root, "race");
      const prestige = readProperty(root, "prestige");
      const universe = readProperty(race, "universe");
      const currencyId = universe === "antimatter" ? "AntiPlasmid" : "Plasmid";
      const bank = readProperty(prestige, currencyId);
      const handle = dependencies.controls.resolve(GENE_SLOTS_CONTROL);
      const reserve = readMutationReserve(dependencies.readSettings(), root);
      const currentQuantity = finite(readProperty(bank, "count"));
      const document = dependencies.getDocument();
      if (
        level === undefined ||
        level <= 2 ||
        !isRecord(race) ||
        typeof universe !== "string" ||
        !isRecord(bank) ||
        reserve === undefined ||
        currentQuantity === undefined ||
        currentQuantity < 0 ||
        handle === undefined ||
        document === undefined ||
        document === null
      ) {
        mutationSession = null;
        return unavailableMutation();
      }
      const actions = readMutationActions(document);
      if (actions === undefined) {
        mutationSession = null;
        return unavailableMutation();
      }

      const targets: MutationTarget[] = [];
      const gains: GeneticsMutationOperation[] = [];
      const purges: GeneticsMutationOperation[] = [];
      for (const action of actions) {
        const fromPresent = action.operation === "purge";
        if (own(race, action.traitId) !== fromPresent) continue;
        const costMethod =
          action.operation === "gain" ? "addCost" : "removeCost";
        const cost = invokeFinite(dependencies.controls, handle, costMethod, [
          action.traitId,
        ]);
        const operation = Object.freeze({
          traitId: action.traitId,
          kind: action.operation,
          cost: cost ?? null,
          eligible: cost === undefined ? null : true,
          fromPresent,
        });
        (action.operation === "gain" ? gains : purges).push(operation);
        targets.push({ operation, handle, race, bank });
      }
      const operations = Object.freeze([...gains, ...purges]);
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
        const currentHandle = dependencies.controls.resolve(GENE_SLOTS_CONTROL);
        if (
          currentHandle === undefined ||
          currentHandle.generation !== target.handle.generation
        ) {
          return stale(
            "mutation-control-stale",
            "mutation control was rebound",
          );
        }
        if (own(active.race, decision.traitId) !== decision.fromPresent) {
          return stale("mutation-trait-changed", "mutation trait changed");
        }
        const currentActions = readMutationActions(dependencies.getDocument());
        if (
          currentActions === undefined ||
          !currentActions.some(
            (action) =>
              action.traitId === decision.traitId &&
              action.operation === decision.operation,
          )
        ) {
          return stale(
            "mutation-capability-changed",
            "mutation is no longer offered",
          );
        }
        const costMethod =
          decision.operation === "gain" ? "addCost" : "removeCost";
        const currentCost = invokeFinite(
          dependencies.controls,
          target.handle,
          costMethod,
          [decision.traitId],
        );
        if (
          currentCost === undefined ||
          currentCost !== decision.cost ||
          actualQuantity - currentCost < decision.reserve
        ) {
          return stale(
            "mutation-cost-changed",
            "mutation cost or reserve changed",
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
        if (
          afterQuantity !== decision.expectedCurrencyQuantity - decision.cost ||
          afterPresent !== decision.toPresent
        ) {
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
