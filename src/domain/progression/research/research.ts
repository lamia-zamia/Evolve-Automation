/** One immutable observation from the ordered unlocked-research list. */
export interface ResearchTechView {
  readonly index: number;
  readonly id: string;
  readonly affordable: boolean;
  readonly hasCostConflict: boolean;
}

/**
 * A research read stops after the first eligible technology. If its safe click
 * fails, the application layer explicitly reads a new phase from the next
 * index, preserving the legacy short-circuit order without hiding live reads
 * inside this policy.
 */
export interface ResearchInput {
  readonly techs: readonly ResearchTechView[];
}

export interface ResearchDecision {
  readonly index: number;
  readonly techId: string;
}

/** Select the first affordable technology whose costs do not conflict. */
export function planResearch(
  input: Readonly<ResearchInput>,
): ResearchDecision | null {
  const tech = input.techs.find(
    (candidate) => candidate.affordable && !candidate.hasCostConflict,
  );
  return tech === undefined
    ? null
    : Object.freeze({ index: tech.index, techId: tech.id });
}
