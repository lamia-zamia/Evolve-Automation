import type {
  BuildingWeightingAnnotation,
  BuildingWeightingCandidate,
  BuildingWeightingDecider,
  BuildingWeightingDecision,
  BuildingWeightingRule,
  BuildingWeightingScreeningCandidate,
  BuildingWeightingScreeningRule,
  BuildingWeightingSnapshot,
} from "./building-weighting.ts";

const NO_ANNOTATIONS: readonly BuildingWeightingAnnotation[] = Object.freeze(
  [],
);

/**
 * The rules worth applying this phase. A rule whose generic conditions do not
 * hold cannot match, and a rule whose multiplier is x1 cannot change a weight,
 * so neither is asked about a candidate at all.
 *
 * Both questions are answered once per phase, which is why a rule's `enabled`
 * and its no-match `multiplier` may only read the snapshot.
 */
export function selectActiveWeightingRules(
  rules: readonly BuildingWeightingRule<unknown>[],
  snapshot: BuildingWeightingSnapshot,
): readonly BuildingWeightingRule<unknown>[] {
  return rules.filter(
    (rule) => rule.enabled(snapshot) && rule.multiplier(snapshot) !== 1,
  );
}

/**
 * How many rules from the start of the list read only the screening fields.
 *
 * Screening rules have to be a prefix: running a later one early would move it
 * ahead of rules it is ordered behind, and rule order decides the weight.
 * A list that interleaves them is a programming error, not a runtime condition.
 */
export function selectScreeningRules(
  rules: readonly BuildingWeightingRule<unknown>[],
): readonly BuildingWeightingScreeningRule<unknown>[] {
  const prefix = rules.findIndex((rule) => rule.screening !== true);
  const screeningCount = prefix === -1 ? rules.length : prefix;
  const strayIndex = rules.findIndex(
    (rule, index) => index >= screeningCount && rule.screening === true,
  );
  if (strayIndex !== -1) {
    throw new TypeError(
      `weighting rule ${rules[strayIndex]?.id} is marked screening but follows a rule that needs the full candidate`,
    );
  }
  // `screening: true` is the rule's declaration that its match, describe, and
  // multiplier read nothing outside the screening fields. The prefix check
  // above is what makes reordering visible; this cast is where that promise is
  // taken at its word, and it is the only place a rule is narrowed.
  // The two steps are needed because the narrowed `match` accepts less than the
  // wide one declares, which TypeScript cannot check for us either way.
  return rules.slice(
    0,
    screeningCount,
  ) as unknown as readonly BuildingWeightingScreeningRule<unknown>[];
}

/**
 * Applies the screening rules to a candidate that has only been partly
 * projected. Returns the decision when they settled it, or `null` when it
 * survived them and needs the full projection.
 *
 * A surviving candidate is later run through `decideBuildingWeighting` from the
 * start, screening rules included, so every rule applies exactly once and this
 * pass never has to hand over a partial weight.
 */
export function screenBuildingWeighting(
  screeningRules: readonly BuildingWeightingScreeningRule<unknown>[],
  candidate: BuildingWeightingScreeningCandidate,
  snapshot: BuildingWeightingSnapshot,
): BuildingWeightingDecision | null {
  let weight = candidate.baseWeight;
  let annotations: BuildingWeightingAnnotation[] | undefined;
  for (const rule of screeningRules) {
    const match = rule.match(candidate, snapshot);
    if (!match) {
      continue;
    }
    const note = rule.describe(match, candidate, snapshot);
    if (note !== "") {
      annotations ??= [];
      annotations.push(Object.freeze({ ruleId: rule.id, note }));
    }
    const weightBeforeRule = weight;
    weight *= rule.multiplier(snapshot, match);
    if (weight <= 0) {
      return Object.freeze({
        weight,
        annotations:
          annotations === undefined
            ? NO_ANNOTATIONS
            : Object.freeze(annotations),
        zeroedBy: weightBeforeRule > 0 ? rule.id : null,
      });
    }
  }
  return null;
}

/**
 * Applies the active rules to one candidate, in order, and returns what they
 * decided. Nothing here reads or writes anything but its two inputs.
 *
 * Rule order is load-bearing: multipliers compound, and the first rule that
 * drives the weight to zero stops the rest, so a later rule never sees a
 * candidate an earlier rule ruled out and never annotates it either. A weight
 * that survives is nudged down by the copies already built, so two otherwise
 * equal candidates prefer the rarer one without ever reaching zero.
 */
export function decideBuildingWeighting(
  activeRules: readonly BuildingWeightingRule<unknown>[],
  candidate: BuildingWeightingCandidate,
  snapshot: BuildingWeightingSnapshot,
): BuildingWeightingDecision {
  let weight = candidate.baseWeight;
  let annotations: BuildingWeightingAnnotation[] | undefined;
  let zeroedBy: string | null = null;
  for (const rule of activeRules) {
    const match = rule.match(candidate, snapshot);
    if (!match) {
      continue;
    }
    const note = rule.describe(match, candidate, snapshot);
    if (note !== "") {
      annotations ??= [];
      annotations.push(Object.freeze({ ruleId: rule.id, note }));
    }
    const weightBeforeRule = weight;
    weight *= rule.multiplier(snapshot, match);
    if (weight <= 0) {
      // Only a rule that actually took the weight down is blamed. A candidate
      // configured to weight zero stops at the first matching rule whatever
      // that rule's multiplier is, and blaming it would misreport the funnel.
      zeroedBy = weightBeforeRule > 0 ? rule.id : null;
      break;
    }
  }
  if (weight > 0) {
    weight = Math.max(Number.MIN_VALUE, weight - 1e-7 * candidate.count);
  }
  return Object.freeze({
    weight,
    annotations:
      annotations === undefined ? NO_ANNOTATIONS : Object.freeze(annotations),
    zeroedBy,
  });
}

/**
 * The weighting rules as the decider port: a caller samples a snapshot, begins
 * the phase once, and decides every candidate against the rules that phase
 * selected. The ordered rule list never leaves this layer.
 */
type BuildingWeightingDeciderDependencies = {
  /** The ordered weighting rules. Their order is part of the decision. */
  readonly weightingRules: readonly BuildingWeightingRule<unknown>[];
};

export function createBuildingWeightingDecider({
  weightingRules,
}: BuildingWeightingDeciderDependencies): BuildingWeightingDecider {
  return Object.freeze({
    beginPhase(snapshot: BuildingWeightingSnapshot) {
      const activeRules = selectActiveWeightingRules(weightingRules, snapshot);
      const screeningRules = selectScreeningRules(activeRules);
      return Object.freeze({
        screen: (candidate: BuildingWeightingScreeningCandidate) =>
          screenBuildingWeighting(screeningRules, candidate, snapshot),
        decide: (candidate: BuildingWeightingCandidate) =>
          decideBuildingWeighting(activeRules, candidate, snapshot),
      });
    },
  });
}
