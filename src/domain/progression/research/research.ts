/** One immutable observation from the ordered unlocked-research list. */
export interface ResearchTechView {
  readonly index: number;
  readonly id: string;
  readonly affordable: boolean;
  readonly hasCostConflict: boolean;
  /**
   * A research exclusion rejected this technology before anything was invoked — an ignore list, a
   * prestige fork the run is not taking, or a conflict fact the reader could not establish.
   */
  readonly hasTechConflict: boolean;
}

/**
 * A research read stops after the first eligible technology. The application
 * layer may read from the next index only when the executor explicitly reports
 * that this exact candidate failed its safe-click gate.
 */
export interface ResearchInput {
  readonly techs: readonly ResearchTechView[];
}

export interface ResearchDecision {
  readonly index: number;
  readonly techId: string;
}

/**
 * Select the first affordable technology that neither a cost reservation nor a research exclusion
 * rejects. Both rejections are decided before any game action, so skipping to the next candidate
 * here is the explicit pre-invocation rejection the research rule allows — never a retry after an
 * invocation failed to show its effect.
 */
export function planResearch(
  input: Readonly<ResearchInput>,
): ResearchDecision | null {
  const tech = input.techs.find(
    (candidate) =>
      candidate.affordable &&
      !candidate.hasCostConflict &&
      !candidate.hasTechConflict,
  );
  return tech === undefined
    ? null
    : Object.freeze({ index: tech.index, techId: tech.id });
}
