export interface MinorTraitSummaryView {
  readonly index: number;
  readonly traitName: string;
  readonly weighting: number;
  /** Cost sampled during the legacy first (totaling) pass. */
  readonly initialGeneCost: number;
}

export interface MinorTraitSummaryInput {
  readonly unlocked: boolean;
  readonly traits: readonly MinorTraitSummaryView[];
}

export interface MinorTraitSummary {
  readonly traits: readonly MinorTraitSummaryView[];
  readonly totalWeighting: number;
  readonly totalGeneCost: number;
}

export interface MinorTraitCandidateInput {
  readonly index: number;
  readonly traitName: string;
  /** Cost resampled in the ordered purchase pass. */
  readonly geneCost: number;
  readonly currentGenes: number;
}

export interface MinorTraitPurchaseDecision {
  readonly traitName: string;
  readonly geneCost: number;
  readonly expectedGenes: number;
}

export type GeneticsMinorTraitSource = "genetic-breakdown";

/** A minor upgrade offered by the live Genetics 2.0 panels. */
export interface GeneticsMinorTraitCandidate {
  readonly traitId: string;
  readonly source: GeneticsMinorTraitSource;
  readonly rank: number;
  /** Null because the live geneCost() method is a localized presentation string. */
  readonly cost: number | null;
  readonly eligible: boolean | null;
  /** Script policy remains separate from the live panel's affordability predicate. */
  readonly enabled: boolean | null;
  readonly priority: number | null;
  readonly weighting: number | null;
}

export interface GeneticsMinorTraitInput {
  readonly available: boolean;
  readonly currentGenes: number;
  /** Ordered by the live global.settings.mtorder list; policy chooses among these candidates. */
  readonly traits: readonly GeneticsMinorTraitCandidate[];
}

export interface GeneticsMinorTraitUpgradeDecision {
  readonly kind: "upgrade-minor-trait";
  readonly traitId: string;
  readonly source: GeneticsMinorTraitSource;
  readonly expectedRank: number;
  readonly expectedGenes: number;
  readonly expectedCost: number | null;
}

export function summarizeMinorTraits(
  input: Readonly<MinorTraitSummaryInput>,
): MinorTraitSummary | null {
  if (!input.unlocked || input.traits.length === 0) {
    return null;
  }
  return Object.freeze({
    traits: input.traits,
    totalWeighting: input.traits.reduce(
      (total, trait) => total + trait.weighting,
      0,
    ),
    totalGeneCost: input.traits.reduce(
      (total, trait) => total + trait.initialGeneCost,
      0,
    ),
  });
}

/** Decide one ordered purchase against the fixed first-pass totals. */
export function planMinorTraitPurchase(
  summary: Readonly<MinorTraitSummary>,
  candidate: Readonly<MinorTraitCandidateInput>,
): MinorTraitPurchaseDecision | null {
  const summaryTrait = summary.traits[candidate.index];
  if (
    summaryTrait === undefined ||
    summaryTrait.traitName !== candidate.traitName
  ) {
    return null;
  }
  // Keep the positive legacy predicate rather than negating its comparisons:
  // `0 / 0 >= 0 / 0` is false, while the superficially equivalent negated
  // `<` form would be true because both sides are NaN.
  if (!(
    summaryTrait.weighting / summary.totalWeighting >=
      candidate.geneCost / summary.totalGeneCost &&
    candidate.currentGenes >= candidate.geneCost
  )) {
    return null;
  }
  return Object.freeze({
    traitName: candidate.traitName,
    geneCost: candidate.geneCost,
    expectedGenes: candidate.currentGenes,
  });
}

/**
 * Select one live Genetics 2.0 minor-trait upgrade using script policy over live game offers.
 * Lower configured priority wins; weighting divided by a known cost breaks ties, and live panel
 * order is the final tie-break when the current game does not expose a numeric gene cost.
 */
export function planGeneticsMinorTrait(
  input: Readonly<GeneticsMinorTraitInput>,
): GeneticsMinorTraitUpgradeDecision | null {
  if (!input.available || !Number.isFinite(input.currentGenes)) return null;

  const candidates = input.traits
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => {
      const priority = candidate.priority;
      const weighting = candidate.weighting;
      if (
        candidate.eligible !== true ||
        candidate.enabled !== true ||
        !Number.isFinite(candidate.rank) ||
        candidate.rank < 0 ||
        priority === null ||
        !Number.isFinite(priority) ||
        priority < 0 ||
        weighting === null ||
        !Number.isFinite(weighting) ||
        weighting <= 0
      ) {
        return false;
      }
      return (
        candidate.cost === null ||
        (Number.isFinite(candidate.cost) &&
          candidate.cost >= 0 &&
          input.currentGenes >= candidate.cost)
      );
    })
    .sort((left, right) => {
      const priority = left.candidate.priority! - right.candidate.priority!;
      if (priority !== 0) return priority;
      const leftCost = left.candidate.cost;
      const rightCost = right.candidate.cost;
      const leftPreference =
        left.candidate.weighting! /
        (leftCost !== null && leftCost > 0 ? leftCost : 1);
      const rightPreference =
        right.candidate.weighting! /
        (rightCost !== null && rightCost > 0 ? rightCost : 1);
      return rightPreference - leftPreference || left.index - right.index;
    });
  const selected = candidates[0]?.candidate;
  if (selected !== undefined) {
    return Object.freeze({
      kind: "upgrade-minor-trait",
      traitId: selected.traitId,
      source: selected.source,
      expectedRank: selected.rank,
      expectedGenes: input.currentGenes,
      expectedCost: selected.cost,
    });
  }
  return null;
}
