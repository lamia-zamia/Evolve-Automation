import type { BuildingWeightingDecision } from "../domain/progression/build/building-weighting.ts";

export interface BuildingWeightingDescriber {
  /**
   * The tooltip markup for one candidate's weighting decision. A candidate the
   * rules ruled out shows only the notes that ruled it out.
   */
  describe(candidateId: string, decision: BuildingWeightingDecision): string;
}

/**
 * Renders weighting decisions into the markup the building wrapper carries into
 * its tooltip. This is the only place the policy's plain-text notes become
 * markup.
 *
 * The formatted weight is cached per candidate because most weights are
 * unchanged from the previous cycle, and formatting is the only part of
 * rendering worth avoiding. The cache is keyed by catalog key, so it holds no
 * reference to a building wrapper.
 */
type BuildingWeightingDescriberDependencies = {
  /** The script's nice-number formatter, which rounds and returns a number. */
  readonly formatNiceNumber: (value: number) => number | string;
};

export function createBuildingWeightingDescriber({
  formatNiceNumber,
}: BuildingWeightingDescriberDependencies): BuildingWeightingDescriber {
  const formattedWeights = new Map<string, { weight: number; text: string }>();

  function formatWeight(candidateId: string, weight: number): string {
    const cached = formattedWeights.get(candidateId);
    if (cached !== undefined && cached.weight === weight) {
      return cached.text;
    }
    const text = String(formatNiceNumber(weight));
    formattedWeights.set(candidateId, { weight, text });
    return text;
  }

  return Object.freeze({
    describe(candidateId: string, decision: BuildingWeightingDecision): string {
      const notes = decision.annotations
        .map((annotation) => `${annotation.note}<br>`)
        .join("");
      if (decision.weight <= 0) {
        return notes;
      }
      return `AutoBuild weighting: ${formatWeight(
        candidateId,
        decision.weight,
      )}<br>${notes}`;
    },
  });
}
