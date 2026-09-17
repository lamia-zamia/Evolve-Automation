export type MutationKind = "gain" | "purge";
export type MutationCurrencyId = "Plasmid" | "AntiPlasmid";

export interface MutationCurrencyView {
  readonly id: MutationCurrencyId;
  readonly name: string;
  readonly currentQuantity: number;
}

export interface MutationTraitView {
  readonly index: number;
  readonly canGain: boolean;
  /** False also represents the legacy gain short-circuit (not evaluated). */
  readonly canPurge: boolean;
  readonly traitName: string | null;
  readonly displayName: string | null;
  readonly mutationCost: number | null;
}

export interface MutationInput {
  readonly unlocked: boolean;
  readonly currency: Readonly<MutationCurrencyView> | null;
  /** Ordered prefix ending at the first actionable trait, when one exists. */
  readonly traits: readonly MutationTraitView[];
}

export interface MutationDecision {
  readonly kind: MutationKind;
  readonly index: number;
  readonly traitName: string;
  readonly displayName: string;
  readonly mutationCost: number;
  readonly currencyId: MutationCurrencyId;
  readonly currencyName: string;
  readonly expectedCurrencyQuantity: number;
}

/** A gain or purge currently offered by the Genetics 2.0 mutation panel. */
export interface GeneticsMutationOperation {
  readonly traitId: string;
  readonly kind: MutationKind;
  readonly cost: number | null;
  readonly eligible: boolean | null;
  readonly fromPresent: boolean;
}

export interface GeneticsMutationCurrency {
  readonly id: MutationCurrencyId;
  readonly currentQuantity: number;
  readonly reserve: number;
}

export interface GeneticsMutationInput {
  readonly available: boolean;
  readonly currency: Readonly<GeneticsMutationCurrency> | null;
  readonly operations: readonly GeneticsMutationOperation[];
}

export interface GeneticsMutationDecision {
  readonly kind: "mutate-trait";
  readonly operation: MutationKind;
  readonly traitId: string;
  readonly fromPresent: boolean;
  readonly toPresent: boolean;
  readonly cost: number;
  readonly expectedCurrencyQuantity: number;
  readonly currencyId: MutationCurrencyId;
  readonly reserve: number;
}

/** Select at most one mutation, with gain precedence within list order. */
export function planMutation(
  input: Readonly<MutationInput>,
): MutationDecision | null {
  if (!input.unlocked || input.currency === null) {
    return null;
  }
  for (const trait of input.traits) {
    const kind: MutationKind | null = trait.canGain
      ? "gain"
      : trait.canPurge
        ? "purge"
        : null;
    if (
      kind !== null &&
      trait.traitName !== null &&
      trait.displayName !== null &&
      trait.mutationCost !== null
    ) {
      return Object.freeze({
        kind,
        index: trait.index,
        traitName: trait.traitName,
        displayName: trait.displayName,
        mutationCost: trait.mutationCost,
        currencyId: input.currency.id,
        currencyName: input.currency.name,
        expectedCurrencyQuantity: input.currency.currentQuantity,
      });
    }
  }
  return null;
}

/** Select at most one live mutation that leaves the configured reserve intact. */
export function planGeneticsMutation(
  input: Readonly<GeneticsMutationInput>,
): GeneticsMutationDecision | null {
  const currency = input.currency;
  if (!input.available || currency === null) return null;
  if (
    !Number.isFinite(currency.currentQuantity) ||
    !Number.isFinite(currency.reserve) ||
    currency.currentQuantity < 0 ||
    currency.reserve < 0
  ) {
    return null;
  }

  for (const operation of input.operations) {
    const cost = operation.cost;
    if (
      operation.eligible !== true ||
      cost === null ||
      !Number.isFinite(cost) ||
      cost < 0 ||
      currency.currentQuantity - cost < currency.reserve
    ) {
      continue;
    }
    return Object.freeze({
      kind: "mutate-trait",
      operation: operation.kind,
      traitId: operation.traitId,
      fromPresent: operation.fromPresent,
      toPresent: !operation.fromPresent,
      cost,
      expectedCurrencyQuantity: currency.currentQuantity,
      currencyId: currency.id,
      reserve: currency.reserve,
    });
  }
  return null;
}
