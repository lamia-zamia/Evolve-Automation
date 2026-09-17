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
}

export interface GeneticsMinorTraitInput {
  readonly available: boolean;
  readonly currentGenes: number;
  /** Ordered by the live global.settings.mtorder list; the first eligible item wins. */
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

/** Select one live Genetics 2.0 minor-trait upgrade in panel order. */
export function planGeneticsMinorTrait(
  input: Readonly<GeneticsMinorTraitInput>,
): GeneticsMinorTraitUpgradeDecision | null {
  if (!input.available || !Number.isFinite(input.currentGenes)) return null;

  for (const candidate of input.traits) {
    if (candidate.eligible !== true) continue;
    if (
      !Number.isFinite(candidate.rank) ||
      candidate.rank < 0 ||
      (candidate.cost !== null &&
        (!Number.isFinite(candidate.cost) ||
          candidate.cost < 0 ||
          input.currentGenes < candidate.cost))
    ) {
      continue;
    }
    return Object.freeze({
      kind: "upgrade-minor-trait",
      traitId: candidate.traitId,
      source: candidate.source,
      expectedRank: candidate.rank,
      expectedGenes: input.currentGenes,
      expectedCost: candidate.cost,
    });
  }
  return null;
}
