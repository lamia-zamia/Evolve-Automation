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
