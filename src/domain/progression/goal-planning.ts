/** Small immutable goal graphs shared by terminal objectives and generated subgoals. */

export type GoalScope = "run" | "account" | "campaign";
export type GoalStatus =
  "satisfied" | "unsatisfied" | "blocked" | "unavailable";
export type GoalProvenance =
  "player-selected" | "native-prerequisite" | "derived-requirement";

export interface GoalActionIdentity {
  readonly family: string;
  readonly nativeId: string;
  readonly occurrence?: string;
}

export interface GoalQuantityRequirement {
  readonly resourceId: string;
  readonly amount: number;
  readonly held?: number;
  readonly capacity?: number;
  readonly netRate?: number;
}

export interface GoalDefinition {
  readonly id: string;
  readonly scope: GoalScope;
  readonly predicate: string;
  readonly provenance: GoalProvenance;
  readonly reason: string;
  readonly status: GoalStatus;
  readonly action?: GoalActionIdentity;
  readonly quantity?: GoalQuantityRequirement;
  readonly prerequisites?: Readonly<{
    readonly operator: "all" | "any";
    readonly goalIds: readonly string[];
  }>;
  readonly unavailableFacts?: readonly string[];
}

export interface GoalTraversal {
  readonly visited: readonly string[];
  readonly cycles: readonly (readonly string[])[];
  readonly limits: readonly string[];
  readonly missing: readonly string[];
}

export interface GoalGraphLimits {
  readonly maxDepth: number;
  readonly maxGoals: number;
}

/** Combines child states without turning unavailable native information into a false answer. */
export function combinePrerequisiteStatuses(
  operator: "all" | "any",
  statuses: readonly GoalStatus[],
): GoalStatus {
  if (statuses.length === 0) return "unavailable";
  if (operator === "all" && statuses.every((status) => status === "satisfied"))
    return "satisfied";
  if (operator === "any" && statuses.some((status) => status === "satisfied"))
    return "satisfied";
  if (
    (operator === "all" && statuses.some((status) => status === "blocked")) ||
    (operator === "any" && statuses.every((status) => status === "blocked"))
  )
    return "blocked";
  if (statuses.some((status) => status === "unavailable")) return "unavailable";
  return "unsatisfied";
}

export interface MadTechOfferObservation {
  readonly action: GoalActionIdentity;
  readonly costs: Readonly<Record<string, number>>;
  readonly nativeAffordable: boolean;
  readonly generation: number;
}

export interface GoalResourceObservation {
  readonly amount?: number;
  readonly capacity?: number;
  readonly netRate?: number;
}

export interface MadGoalPlanningInput {
  readonly selectedPrestige: string;
  readonly prestigePermission: boolean;
  readonly manualOwnership: boolean;
  readonly resetConfirmed: boolean;
  readonly madResearchLevel: number | undefined;
  /** Captured MAD research/display gate from the existing native branch reader. */
  readonly madResearchGate: boolean | undefined;
  /** Existing prestige planner's population and soldier gate. */
  readonly madResetGate: boolean | undefined;
  /** Undefined is an unavailable catalog, while an empty array means a current draw had no offer. */
  readonly offeredMadTech: MadTechOfferObservation | undefined;
  readonly offerCatalogAvailable: boolean;
  readonly resources: ReadonlyMap<string, Readonly<GoalResourceObservation>>;
  readonly cycle: number;
  readonly progressionEpoch: string;
}

export interface MadGoalPlan {
  readonly selectedGoal: Readonly<GoalDefinition>;
  readonly status: GoalStatus;
  readonly currentSubgoal: string | undefined;
  readonly verifiedChain: readonly string[];
  readonly blockers: readonly string[];
  readonly action?: Readonly<MadTechOfferObservation>;
  readonly quantitativeRequirements: readonly Readonly<GoalQuantityRequirement>[];
  readonly unavailableFacts: readonly string[];
  readonly freshness: Readonly<{
    readonly cycle: number;
    readonly progressionEpoch: string;
    readonly offerGeneration?: number;
  }>;
}

const MAD_TERMINAL_GOAL_ID = "prestige:mad";
const MAD_RESEARCH_GOAL_ID = "research:mad";

/** Builds a read-only MAD frontier from current native facts; absent offers stay unknown. */
export function planMadGoal(
  input: Readonly<MadGoalPlanningInput>,
): MadGoalPlan {
  const unavailableFacts: string[] = [];
  const blockers: string[] = [];
  const quantitativeRequirements: GoalQuantityRequirement[] = [];
  let nativePriceBlockerObserved = false;
  if (input.selectedPrestige !== "mad") {
    unavailableFacts.push("MAD is not the selected terminal objective");
  }
  if (input.madResearchLevel === undefined) {
    unavailableFacts.push("native tech.mad level is unavailable");
  }
  if (
    !input.offerCatalogAvailable &&
    input.madResearchLevel !== undefined &&
    input.madResearchLevel < 1
  ) {
    unavailableFacts.push("current Research offer catalog is unavailable");
  }

  const researchSatisfied =
    input.madResearchGate === true &&
    input.madResearchLevel !== undefined &&
    input.madResearchLevel > 0;
  const selectedMad = input.selectedPrestige === "mad";
  const status: GoalStatus = !selectedMad
    ? "unavailable"
    : input.resetConfirmed
      ? "satisfied"
      : input.madResearchGate === undefined || input.madResetGate === undefined
        ? "unavailable"
        : !researchSatisfied ||
            !input.madResetGate ||
            !input.prestigePermission ||
            input.manualOwnership
          ? "blocked"
          : "unsatisfied";

  const chain = [MAD_TERMINAL_GOAL_ID];
  if (selectedMad && !input.resetConfirmed) {
    if (!input.prestigePermission)
      blockers.push("automation-permission-disabled");
    if (input.manualOwnership)
      blockers.push("MAD is armed or otherwise manually owned");
  }
  let currentSubgoal: string | undefined;
  if (selectedMad && !input.resetConfirmed) {
    if (!researchSatisfied) {
      chain.push(MAD_RESEARCH_GOAL_ID);
      currentSubgoal = MAD_RESEARCH_GOAL_ID;
      if (input.offeredMadTech !== undefined) {
        chain.push(input.offeredMadTech.action.nativeId);
        currentSubgoal = input.offeredMadTech.action.nativeId;
        for (const [resourceId, amount] of Object.entries(
          input.offeredMadTech.costs,
        )) {
          if (!Number.isFinite(amount) || amount <= 0) continue;
          const resource = input.resources.get(resourceId);
          if (resource === undefined) {
            unavailableFacts.push(
              `native price resource ${resourceId} is unavailable`,
            );
            continue;
          }
          chain.push(`resource:${resourceId}`);
          quantitativeRequirements.push(
            Object.freeze({
              resourceId,
              amount,
              ...(resource.amount === undefined
                ? {}
                : { held: resource.amount }),
              ...(resource.capacity === undefined
                ? {}
                : { capacity: resource.capacity }),
              ...(resource.netRate === undefined
                ? {}
                : { netRate: resource.netRate }),
            }),
          );
          if (resource.amount === undefined) {
            unavailableFacts.push(
              `current stock for ${resourceId} is unavailable`,
            );
          } else if (resource.amount < amount) {
            nativePriceBlockerObserved = true;
            blockers.push(`${resourceId}:stock-below-native-price`);
            if (resource.capacity === undefined)
              unavailableFacts.push(
                `current capacity for ${resourceId} is unavailable`,
              );
            if (
              resource.capacity !== undefined &&
              resource.capacity >= 0 &&
              resource.capacity < amount
            )
              blockers.push(`${resourceId}:capacity-below-native-price`);
            if (resource.netRate !== undefined && resource.netRate <= 0)
              blockers.push(`${resourceId}:nonpositive-net-production`);
            if (resource.netRate === undefined)
              unavailableFacts.push(
                `net production for ${resourceId} is unavailable`,
              );
          }
        }
        if (
          !input.offeredMadTech.nativeAffordable &&
          !nativePriceBlockerObserved
        )
          unavailableFacts.push(
            "native affordability is false but captured costs do not explain it",
          );
      } else if (input.offerCatalogAvailable) {
        unavailableFacts.push(
          "tech-mad is not currently offered; its locked dependencies are unavailable here",
        );
      }
    } else {
      currentSubgoal = "prestige:mad-reset-gate";
      chain.push(currentSubgoal);
      if (!input.madResetGate)
        blockers.push("native soldier or population reset gate is unsatisfied");
    }
  }

  const selectedGoal: GoalDefinition = Object.freeze({
    id: MAD_TERMINAL_GOAL_ID,
    scope: "run",
    predicate: "confirmed-mad-reset",
    provenance: "player-selected",
    reason: "selected prestigeType=mad",
    status,
    prerequisites: Object.freeze({
      operator: "all",
      goalIds: Object.freeze([MAD_RESEARCH_GOAL_ID]),
    }),
    ...(unavailableFacts.length === 0
      ? {}
      : { unavailableFacts: Object.freeze([...unavailableFacts]) }),
  });
  return Object.freeze({
    selectedGoal,
    status,
    currentSubgoal,
    verifiedChain: Object.freeze(chain),
    blockers: Object.freeze(blockers),
    ...(input.offeredMadTech === undefined
      ? {}
      : { action: input.offeredMadTech }),
    quantitativeRequirements: Object.freeze(quantitativeRequirements),
    unavailableFacts: Object.freeze(unavailableFacts),
    freshness: Object.freeze({
      cycle: input.cycle,
      progressionEpoch: input.progressionEpoch,
      ...(input.offeredMadTech === undefined
        ? {}
        : { offerGeneration: input.offeredMadTech.generation }),
    }),
  });
}

/** Walks each stable goal identity once and stops safely at cycles and explicit bounds. */
export function traverseGoalGraph(
  rootId: string,
  goals: ReadonlyMap<string, Readonly<GoalDefinition>>,
  limits: Readonly<GoalGraphLimits>,
): GoalTraversal {
  const visited: string[] = [];
  const visiting: string[] = [];
  const visitedSet = new Set<string>();
  const cycles: string[][] = [];
  const bounded: string[] = [];
  const missing = new Set<string>();

  const visit = (id: string, depth: number): void => {
    const cycleAt = visiting.indexOf(id);
    if (cycleAt >= 0) {
      cycles.push([...visiting.slice(cycleAt), id]);
      return;
    }
    if (visitedSet.has(id)) return;
    if (depth > limits.maxDepth) {
      bounded.push(`depth:${id}`);
      return;
    }
    if (visited.length >= limits.maxGoals) {
      bounded.push(`goals:${id}`);
      return;
    }
    const goal = goals.get(id);
    if (goal === undefined) {
      missing.add(id);
      return;
    }
    visitedSet.add(id);
    visited.push(id);
    visiting.push(id);
    for (const child of goal.prerequisites?.goalIds ?? [])
      visit(child, depth + 1);
    visiting.pop();
  };

  visit(rootId, 0);
  return Object.freeze({
    visited: Object.freeze(visited),
    cycles: Object.freeze(cycles.map((cycle) => Object.freeze(cycle))),
    limits: Object.freeze(bounded),
    missing: Object.freeze([...missing]),
  });
}
