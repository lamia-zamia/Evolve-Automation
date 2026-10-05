import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type {
  GeneticsMinorTraitCandidate,
  GeneticsMinorTraitInput,
  GeneticsMinorTraitUpgradeDecision,
} from "../../../domain/traits/minor-trait.ts";
import type {
  GeneticsMutationInput,
  GeneticsMutationOperation,
  GeneticsMutationDecision,
  MutationKind,
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

/** Bound by the pinned game's `geneSlotPanel()`. */
export const GENE_SLOTS_CONTROL = "geneSlots";

interface SlotIdentity {
  readonly index: number;
  readonly gene: string | null;
  readonly rank: number | null;
}

interface MinorTarget {
  readonly candidate: GeneticsMinorTraitCandidate;
  readonly slot: SlotIdentity;
}

interface MutationTarget {
  readonly operation: GeneticsMutationOperation;
  readonly slot: SlotIdentity;
  readonly priority: number;
}

interface SlotSession {
  readonly root: unknown;
  readonly handle: GameControlHandle;
  readonly slots: readonly unknown[];
}

interface MinorSession extends SlotSession {
  readonly genes: Record<PropertyKey, unknown>;
  readonly targets: readonly MinorTarget[];
}

interface MutationSession extends SlotSession {
  readonly race: Record<PropertyKey, unknown>;
  readonly bank: Record<PropertyKey, unknown>;
  readonly reserve: number;
  readonly targets: readonly MutationTarget[];
}

export interface CapturedTraitAutomationDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly keyState: GameKeyStateReader;
  readonly readSettings: () => unknown;
  /** Native cost authority, when available; an unknown cost cannot promise a nonzero reserve. */
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

function slotIdentity(
  slots: readonly unknown[],
  index: number,
): SlotIdentity | undefined {
  const raw = slots[index];
  if (raw === false || raw === null || raw === undefined) {
    return Object.freeze({ index, gene: null, rank: null });
  }
  const gene = readProperty(raw, "g");
  const rank = finite(readProperty(raw, "r"));
  if (
    typeof gene !== "string" ||
    gene.length === 0 ||
    rank === undefined ||
    !Number.isSafeInteger(rank) ||
    rank < 0
  )
    return undefined;
  return Object.freeze({ index, gene, rank });
}

function sameSlot(slots: readonly unknown[], expected: SlotIdentity): boolean {
  const actual = slotIdentity(slots, expected.index);
  return actual?.gene === expected.gene && actual.rank === expected.rank;
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

function nativeBoolean(
  controls: GameControlRegistry,
  handle: GameControlHandle,
  method: string,
  index: number,
): boolean | undefined {
  const result = invoke(controls, handle, method, [index]);
  return result?.ok === true && typeof result.value === "boolean"
    ? result.value
    : undefined;
}

function nativeChoices(
  controls: GameControlRegistry,
  handle: GameControlHandle,
  index: number,
): readonly string[] | undefined {
  const result = invoke(controls, handle, "pickable", [index]);
  if (
    result?.ok !== true ||
    !Array.isArray(result.value) ||
    !result.value.every(
      (item: unknown) => typeof item === "string" && item.length > 0,
    )
  )
    return undefined;
  return result.value;
}

function captureSlots(
  dependencies: CapturedTraitAutomationDependencies,
): SlotSession | undefined {
  const root = dependencies.rootState.readRoot();
  const level = finite(readProperty(readProperty(root, "tech"), "genetics"));
  if (level === undefined || level <= 2) return undefined;
  const slots = readProperty(readProperty(root, "race"), "geneSlots");
  const handle = dependencies.controls.resolve(GENE_SLOTS_CONTROL);
  if (!Array.isArray(slots) || handle === undefined) return undefined;
  return { root, slots, handle };
}

function activeGeneSlotControl(
  dependencies: CapturedTraitAutomationDependencies,
  session: SlotSession,
): boolean {
  const handle = dependencies.controls.resolve(GENE_SLOTS_CONTROL);
  return (
    dependencies.rootState.readRoot() === session.root &&
    readProperty(readProperty(session.root, "race"), "geneSlots") ===
      session.slots &&
    handle !== undefined &&
    handle.generation === session.handle.generation
  );
}

/** Native genetics redraws its binding after a successful purchase. */
function coherentAfterAction(
  dependencies: CapturedTraitAutomationDependencies,
  session: SlotSession,
): boolean {
  const handle = dependencies.controls.resolve(GENE_SLOTS_CONTROL);
  return (
    dependencies.rootState.readRoot() === session.root &&
    readProperty(readProperty(session.root, "race"), "geneSlots") ===
      session.slots &&
    handle !== undefined &&
    handle.elementId === session.handle.elementId &&
    Number.isSafeInteger(handle.generation) &&
    handle.generation >= session.handle.generation
  );
}

function minorPolicy(
  settings: unknown,
  gene: string,
): {
  enabled: boolean | null;
  priority: number | null;
  weighting: number | null;
} {
  const enabled = readProperty(settings, `mTrait_${gene}`);
  const priority = finite(readProperty(settings, `mTrait_p_${gene}`));
  const weighting = finite(readProperty(settings, `mTrait_w_${gene}`));
  return {
    enabled: typeof enabled === "boolean" ? enabled : null,
    priority: priority !== undefined && priority >= 0 ? priority : null,
    weighting: weighting !== undefined && weighting >= 0 ? weighting : null,
  };
}

function mutationReserve(settings: unknown, root: unknown): number | undefined {
  const minimumRaw = readProperty(settings, "minimumPlasmidsToPreserve");
  const minimum = minimumRaw === undefined ? 0 : finite(minimumRaw);
  const softcapRaw = readProperty(settings, "doNotGoBelowPlasmidSoftcap");
  if (
    minimum === undefined ||
    minimum < 0 ||
    (softcapRaw !== undefined && typeof softcapRaw !== "boolean")
  )
    return undefined;
  if (softcapRaw === false) return minimum;
  const phage = finite(
    readProperty(
      readProperty(readProperty(root, "prestige"), "Phage"),
      "count",
    ),
  );
  return phage === undefined || phage < 0
    ? undefined
    : Math.max(minimum, phage + 250);
}

function mutationCost(
  dependencies: CapturedTraitAutomationDependencies,
  root: unknown,
  traitId: string,
  kind: MutationKind,
): number | null {
  try {
    const value = finite(dependencies.readMutationCost?.(root, traitId, kind));
    return value !== undefined && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function mutationPolicy(
  settings: unknown,
  traitId: string,
  kind: MutationKind,
): boolean {
  const gain = readProperty(settings, `mutableTrait_gain_${traitId}`);
  const purge = readProperty(settings, `mutableTrait_purge_${traitId}`);
  return kind === "gain"
    ? gain === true && purge !== true
    : purge === true && gain !== true;
}

export function createCapturedTraitAutomation(
  dependencies: CapturedTraitAutomationDependencies,
): CapturedTraitAutomation {
  let minorSession: MinorSession | null = null;
  let mutationSession: MutationSession | null = null;
  let blockedMinor: {
    root: unknown;
    generation: number;
    slotIndex: number;
    traitId: string;
    rank: number;
    genes: number;
    bank: number | undefined;
  } | null = null;
  let blockedMutation: {
    root: unknown;
    generation: number;
    currency: number;
  } | null = null;

  const minorReader: GeneticsMinorTraitReader = Object.freeze({
    read(): GeneticsMinorTraitInput {
      const session = captureSlots(dependencies);
      const genes = readProperty(
        readProperty(session?.root, "resource"),
        "Genes",
      );
      const currentGenes = finite(readProperty(genes, "amount"));
      if (
        session === undefined ||
        !isRecord(genes) ||
        currentGenes === undefined ||
        currentGenes < 0 ||
        !["isGene", "canRank", "rankUp"].every((method) =>
          session.handle.methods.includes(method),
        )
      ) {
        minorSession = null;
        return { available: false, currentGenes: 0, traits: [] };
      }
      const settings = dependencies.readSettings();
      const candidates: GeneticsMinorTraitCandidate[] = [];
      const targets: MinorTarget[] = [];
      for (let index = 0; index < session.slots.length; index += 1) {
        const slot = slotIdentity(session.slots, index);
        if (slot?.gene === null || slot === undefined || slot.rank === null)
          continue;
        if (
          nativeBoolean(
            dependencies.controls,
            session.handle,
            "isGene",
            index,
          ) !== true
        )
          continue;
        const policy = minorPolicy(settings, slot.gene);
        const bankId =
          readProperty(readProperty(session.root, "race"), "universe") ===
          "antimatter"
            ? "AntiPlasmid"
            : "Plasmid";
        const currentBank = finite(
          readProperty(
            readProperty(readProperty(session.root, "prestige"), bankId),
            "count",
          ),
        );
        const eligible =
          blockedMinor !== null &&
          blockedMinor.root === session.root &&
          blockedMinor.generation === session.handle.generation &&
          blockedMinor.slotIndex === index &&
          blockedMinor.traitId === slot.gene &&
          blockedMinor.rank === slot.rank &&
          blockedMinor.bank === currentBank &&
          blockedMinor.genes === currentGenes
            ? false
            : (nativeBoolean(
                dependencies.controls,
                session.handle,
                "canRank",
                index,
              ) ?? null);
        const candidate: GeneticsMinorTraitCandidate = Object.freeze({
          slotIndex: index,
          controlGeneration: session.handle.generation,
          traitId: slot.gene,
          source: "gene-slot",
          rank: slot.rank,
          cost: null,
          eligible,
          ...policy,
        });
        candidates.push(candidate);
        targets.push({ candidate, slot });
      }
      minorSession = { ...session, genes, targets };
      return {
        available: true,
        currentGenes,
        traits: Object.freeze(candidates),
      };
    },
  });

  const minorExecutor: DecisionExecutor<GeneticsMinorTraitUpgradeDecision> =
    Object.freeze({
      execute(
        decision: Readonly<GeneticsMinorTraitUpgradeDecision>,
      ): CommandExecutionOutcome {
        const session = minorSession;
        if (
          session === null ||
          decision.controlGeneration !== session.handle.generation ||
          !activeGeneSlotControl(dependencies, session)
        )
          return stale(
            "minor-trait-control-stale",
            "gene-slot control or root changed",
          );
        const target = session.targets.find(
          ({ candidate }) =>
            candidate.slotIndex === decision.slotIndex &&
            candidate.traitId === decision.traitId,
        );
        if (
          target === undefined ||
          target.slot.rank !== decision.expectedRank ||
          !sameSlot(session.slots, target.slot)
        )
          return stale(
            "minor-trait-slot-changed",
            "gene slot identity or rank changed",
          );
        if (
          finite(readProperty(session.genes, "amount")) !==
          decision.expectedGenes
        )
          return stale("minor-trait-genes-changed", "Genes balance changed");
        const policy = minorPolicy(
          dependencies.readSettings(),
          decision.traitId,
        );
        if (
          policy.enabled !== target.candidate.enabled ||
          policy.priority !== target.candidate.priority ||
          policy.weighting !== target.candidate.weighting
        )
          return stale(
            "minor-trait-policy-changed",
            "minor-trait policy changed",
          );
        if (
          nativeBoolean(
            dependencies.controls,
            session.handle,
            "isGene",
            decision.slotIndex,
          ) !== true ||
          nativeBoolean(
            dependencies.controls,
            session.handle,
            "canRank",
            decision.slotIndex,
          ) !== true
        )
          return stale(
            "minor-trait-capability-changed",
            "native gene rank is unavailable",
          );
        const multiplier = readCapturedClickMultiplierState(
          session.root,
          dependencies.keyState,
        );
        if (multiplier !== false)
          return stale(
            "minor-trait-click-multiplier-held",
            "click multiplier is held or unavailable",
          );
        const bankId =
          readProperty(readProperty(session.root, "race"), "universe") ===
          "antimatter"
            ? "AntiPlasmid"
            : "Plasmid";
        const beforeBank = finite(
          readProperty(
            readProperty(readProperty(session.root, "prestige"), bankId),
            "count",
          ),
        );
        const result = invoke(dependencies.controls, session.handle, "rankUp", [
          decision.slotIndex,
        ]);
        const after = slotIdentity(session.slots, decision.slotIndex);
        const afterGenes = finite(readProperty(session.genes, "amount"));
        const afterBank = finite(
          readProperty(
            readProperty(readProperty(session.root, "prestige"), bankId),
            "count",
          ),
        );
        if (
          result?.ok === true &&
          coherentAfterAction(dependencies, session) &&
          after?.gene === decision.traitId &&
          after.rank === decision.expectedRank &&
          afterGenes === decision.expectedGenes &&
          afterBank === beforeBank
        ) {
          blockedMinor = {
            root: session.root,
            generation: session.handle.generation,
            slotIndex: decision.slotIndex,
            traitId: decision.traitId,
            rank: decision.expectedRank,
            genes: decision.expectedGenes,
            bank: beforeBank,
          };
          return SUCCEEDED;
        }
        if (
          result?.ok !== true ||
          !coherentAfterAction(dependencies, session) ||
          after === undefined ||
          after.gene !== decision.traitId ||
          after.rank === null ||
          after.rank <= decision.expectedRank ||
          afterGenes === undefined ||
          afterGenes > decision.expectedGenes ||
          (beforeBank !== undefined &&
            (afterBank === undefined || afterBank > beforeBank))
        ) {
          const reason =
            result?.ok !== true
              ? "native rankUp invocation failed"
              : !coherentAfterAction(dependencies, session)
                ? "native rankUp rebound without a coherent slot control"
                : after === undefined ||
                    after.gene !== decision.traitId ||
                    after.rank === null ||
                    after.rank <= decision.expectedRank
                  ? "native rankUp did not increase the expected slot"
                  : "native rankUp left an invalid currency balance";
          blockedMinor = {
            root: session.root,
            generation: session.handle.generation,
            slotIndex: decision.slotIndex,
            traitId: decision.traitId,
            rank: decision.expectedRank,
            genes: decision.expectedGenes,
            bank: beforeBank,
          };
          return stale("minor-trait-noop", reason);
        }
        blockedMinor = null;
        return SUCCEEDED;
      },
    });

  const mutationReader: GeneticsMutationReader = Object.freeze({
    read(): GeneticsMutationInput {
      const session = captureSlots(dependencies);
      const race = readProperty(session?.root, "race");
      const currencyId =
        readProperty(race, "universe") === "antimatter"
          ? "AntiPlasmid"
          : "Plasmid";
      const bank = readProperty(
        readProperty(session?.root, "prestige"),
        currencyId,
      );
      const quantity = finite(readProperty(bank, "count"));
      const settings = dependencies.readSettings();
      const reserve = mutationReserve(settings, session?.root);
      if (
        session === undefined ||
        !isRecord(race) ||
        !isRecord(bank) ||
        quantity === undefined ||
        quantity < 0 ||
        reserve === undefined ||
        !["pickable", "canCull", "gain", "cullSlot"].every((method) =>
          session.handle.methods.includes(method),
        )
      ) {
        mutationSession = null;
        return { available: false, currency: null, operations: [] };
      }
      const targets: MutationTarget[] = [];
      for (let index = 0; index < session.slots.length; index += 1) {
        const slot = slotIdentity(session.slots, index);
        if (slot === undefined) continue;
        if (slot.gene === null) {
          const choices = nativeChoices(
            dependencies.controls,
            session.handle,
            index,
          );
          if (choices === undefined) continue;
          for (const traitId of choices) {
            const priority = finite(
              readProperty(settings, `mutableTrait_p_${traitId}`),
            );
            if (
              priority === undefined ||
              !mutationPolicy(settings, traitId, "gain")
            )
              continue;
            const operation: GeneticsMutationOperation = {
              slotIndex: index,
              controlGeneration: session.handle.generation,
              traitId,
              kind: "gain",
              cost: mutationCost(dependencies, session.root, traitId, "gain"),
              eligible: true,
              fromPresent: false,
            };
            targets.push({ operation, slot, priority });
          }
        } else if (
          nativeBoolean(
            dependencies.controls,
            session.handle,
            "canCull",
            index,
          ) === true
        ) {
          const priority = finite(
            readProperty(settings, `mutableTrait_p_${slot.gene}`),
          );
          if (
            priority === undefined ||
            !mutationPolicy(settings, slot.gene, "purge")
          )
            continue;
          const operation: GeneticsMutationOperation = {
            slotIndex: index,
            controlGeneration: session.handle.generation,
            traitId: slot.gene,
            kind: "purge",
            cost: mutationCost(dependencies, session.root, slot.gene, "purge"),
            eligible: true,
            fromPresent: true,
          };
          targets.push({ operation, slot, priority });
        }
      }
      targets.sort(
        (a, b) => a.priority - b.priority || a.slot.index - b.slot.index,
      );
      const blocked =
        blockedMutation !== null &&
        blockedMutation.root === session.root &&
        blockedMutation.generation === session.handle.generation &&
        blockedMutation.currency === quantity;
      mutationSession = { ...session, race, bank, reserve, targets };
      return {
        available: true,
        currency: { id: currencyId, currentQuantity: quantity, reserve },
        operations: targets.map(({ operation }) =>
          blocked ? { ...operation, eligible: false } : operation,
        ),
      };
    },
  });

  const mutationExecutor: DecisionExecutor<GeneticsMutationDecision> =
    Object.freeze({
      execute(
        decision: Readonly<GeneticsMutationDecision>,
      ): CommandExecutionOutcome {
        const session = mutationSession;
        if (
          session === null ||
          decision.controlGeneration !== session.handle.generation ||
          !activeGeneSlotControl(dependencies, session)
        )
          return stale(
            "mutation-control-stale",
            "gene-slot control or root changed",
          );
        const target = session.targets.find(
          ({ operation }) =>
            operation.slotIndex === decision.slotIndex &&
            operation.traitId === decision.traitId &&
            operation.kind === decision.operation,
        );
        if (target === undefined || !sameSlot(session.slots, target.slot))
          return stale("mutation-slot-changed", "gene slot identity changed");
        const settings = dependencies.readSettings();
        if (
          !mutationPolicy(settings, decision.traitId, decision.operation) ||
          finite(
            readProperty(settings, `mutableTrait_p_${decision.traitId}`),
          ) !== target.priority
        )
          return stale("mutation-policy-changed", "mutation policy changed");
        const quantity = finite(readProperty(session.bank, "count"));
        if (
          quantity !== decision.expectedCurrencyQuantity ||
          mutationReserve(settings, session.root) !== decision.reserve ||
          decision.reserve !== session.reserve
        )
          return stale(
            "mutation-state-changed",
            "mutation currency or reserve changed",
          );
        const cost = mutationCost(
          dependencies,
          session.root,
          decision.traitId,
          decision.operation,
        );
        if (
          cost !== decision.cost ||
          (cost === null
            ? decision.reserve !== 0
            : quantity! - cost < decision.reserve)
        )
          return stale(
            "mutation-cost-changed",
            "mutation cost or reserve changed",
          );
        if (decision.operation === "gain") {
          if (
            target.slot.gene !== null ||
            readProperty(session.race, decision.traitId) !== undefined ||
            !nativeChoices(
              dependencies.controls,
              session.handle,
              decision.slotIndex,
            )?.includes(decision.traitId)
          )
            return stale(
              "mutation-capability-changed",
              "native gain choice is unavailable",
            );
        } else if (
          target.slot.gene !== decision.traitId ||
          readProperty(session.race, decision.traitId) === undefined ||
          nativeBoolean(
            dependencies.controls,
            session.handle,
            "canCull",
            decision.slotIndex,
          ) !== true
        )
          return stale(
            "mutation-capability-changed",
            "native cull is unavailable",
          );
        if (
          readCapturedClickMultiplierState(
            session.root,
            dependencies.keyState,
          ) !== false
        )
          return stale(
            "mutation-click-multiplier-held",
            "click multiplier is held or unavailable",
          );
        const result =
          decision.operation === "gain"
            ? invoke(dependencies.controls, session.handle, "gain", [
                decision.traitId,
                decision.slotIndex,
              ])
            : invoke(dependencies.controls, session.handle, "cullSlot", [
                decision.slotIndex,
              ]);
        const after = slotIdentity(session.slots, decision.slotIndex);
        const afterQuantity = finite(readProperty(session.bank, "count"));
        const changed =
          decision.operation === "gain"
            ? after?.gene === decision.traitId &&
              readProperty(session.race, decision.traitId) !== undefined
            : after?.gene !== decision.traitId &&
              readProperty(session.race, decision.traitId) === undefined;
        if (
          result?.ok !== true ||
          !coherentAfterAction(dependencies, session) ||
          !changed ||
          afterQuantity === undefined ||
          afterQuantity < decision.reserve ||
          (cost === null
            ? afterQuantity > quantity!
            : afterQuantity !== quantity! - cost)
        ) {
          blockedMutation = {
            root: session.root,
            generation: session.handle.generation,
            currency: decision.expectedCurrencyQuantity,
          };
          return stale(
            "mutation-noop",
            "native mutation produced no verified change",
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
