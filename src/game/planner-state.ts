import {
  findPlannerLimit,
  type PlannerLimit,
  type PlannerLimitInput,
  type PlannerRun,
  type PlannerStats,
} from "../domain/planner-analysis.ts";

type PlannerLimitReadResult =
  | { readonly status: "ready"; readonly input: Readonly<PlannerLimitInput> }
  | { readonly status: "unavailable" };
type PlannerRunReadResult =
  | { readonly status: "ready"; readonly run: Readonly<PlannerRun> }
  | { readonly status: "unavailable" };
type ReadPlannerLimitInput = (
  target: unknown,
  resources: unknown,
) => PlannerLimitReadResult;
type ReadPlannerRun = (game: unknown) => PlannerRunReadResult;

interface PlannerStatsLifecycle {
  make(run: Readonly<PlannerRun>): Readonly<PlannerStats>;
  load(run: Readonly<PlannerRun>): Readonly<PlannerStats>;
  save(stats: unknown): boolean;
}

interface PlannerStateDependencies {
  readonly getResources: () => unknown;
  readonly getGame: () => unknown;
  readonly readPlannerLimitInput: ReadPlannerLimitInput;
  readonly readPlannerRun: ReadPlannerRun;
  readonly lifecycle: PlannerStatsLifecycle;
}

export interface PlannerState {
  plannerLimitingResource(
    target: unknown,
  ): Readonly<PlannerLimit> | null | { readonly status: "unavailable" };
  makePlannerStats(): Readonly<PlannerStats> | null;
  loadPlannerStats(): Readonly<PlannerStats> | null;
  savePlannerStats(stats: unknown): boolean;
}

export function createPlannerState({
  getResources,
  getGame,
  readPlannerLimitInput,
  readPlannerRun,
  lifecycle,
}: PlannerStateDependencies): PlannerState {
  function plannerLimitingResource(target: unknown) {
    const readResult = readPlannerLimitInput(target, getResources());
    return readResult.status === "ready"
      ? findPlannerLimit(readResult.input)
      : readResult;
  }

  function makePlannerStats() {
    const readResult = readPlannerRun(getGame());
    return readResult.status === "ready"
      ? lifecycle.make(readResult.run)
      : null;
  }

  function loadPlannerStats() {
    const readResult = readPlannerRun(getGame());
    return readResult.status === "ready"
      ? lifecycle.load(readResult.run)
      : null;
  }

  function savePlannerStats(stats: unknown): boolean {
    return lifecycle.save(stats);
  }

  return {
    plannerLimitingResource,
    makePlannerStats,
    loadPlannerStats,
    savePlannerStats,
  };
}
