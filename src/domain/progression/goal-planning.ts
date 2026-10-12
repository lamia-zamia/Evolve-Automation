/** Small immutable goal graphs shared by terminal objectives and generated subgoals. */

import {
  compareGoalStrategies,
  hasSufficientGoalCapacity,
  type GoalStrategyComparison,
  type GoalResourceNeed,
  type GoalResourceStock,
} from "../economy/goal-feasibility.ts";

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
  /** True only when the adapter captured every native price entry from the current draw. */
  readonly priceComplete: boolean;
  /** The captured verdict from the drawn native action row. */
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
  readonly resetConfirmed: boolean;
  /** Only a present numeric tech.mad value establishes a grant or a missing grant. */
  readonly madResearchLevel: number | undefined;
  /** Native civic.mad.display, separate from the research grant. */
  readonly madControlDisplay: boolean | undefined;
  /** Captured native Vue methods on the currently bound MAD control. */
  readonly madControlBound: boolean | undefined;
  /** Native warhead gate inputs. `armed` is a safety latch, not manual ownership. */
  readonly madArmed: boolean | undefined;
  readonly madCataclysm: boolean | undefined;
  /** Existing automation's optional population/soldier wait policy. */
  readonly madWaitPolicyGate: boolean | undefined;
  /** Undefined is an unavailable catalog, while an empty array means a current draw had no offer. */
  readonly offeredMadTech: MadTechOfferObservation | undefined;
  readonly offerCatalogAvailable: boolean;
  readonly resources: ReadonlyMap<string, Readonly<GoalResourceObservation>>;
  readonly cycle: number;
  readonly progressionEpoch: string;
}

export interface MadGoalPlan {
  readonly selectedGoal: Readonly<GoalDefinition>;
  readonly goals: readonly Readonly<GoalDefinition>[];
  readonly status: GoalStatus;
  readonly currentSubgoal: string | undefined;
  /** Bounded diagnostic trace derived from goals; graph edges remain authoritative. */
  readonly frontierTrace: readonly string[];
  readonly blockers: readonly string[];
  readonly action?: Readonly<MadTechOfferObservation>;
  readonly affordability: "consistent" | "inconsistent" | "unavailable";
  readonly quantitativeRequirements: readonly Readonly<GoalQuantityRequirement>[];
  readonly strategyComparison?: Readonly<GoalStrategyComparison>;
  readonly unavailableFacts: readonly string[];
  readonly freshness: Readonly<{
    readonly cycle: number;
    readonly progressionEpoch: string;
    readonly offerGeneration?: number;
  }>;
}

const MAD_TERMINAL_GOAL_ID = "prestige:mad";
const MAD_RESEARCH_GOAL_ID = "research:mad";
const MAD_RESET_ELIGIBILITY_GOAL_ID = "prestige:mad-reset-eligibility";
const MAD_CONTROL_GOAL_ID = "prestige:mad-control";
const MAD_NATIVE_LAUNCH_GOAL_ID = "prestige:mad-native-launch-gate";
const MAD_POPULATION_SOLDIER_GOAL_ID = "prestige:mad-population-soldiers";
const MAD_OFFER_GOAL_ID = "research:mad:current-offer";
const MAD_AUTOMATION_GOAL_ID = "prestige:mad-automation-permission";
const MAD_GRAPH_TRACE_LIMITS: GoalGraphLimits = Object.freeze({
  maxDepth: 8,
  maxGoals: 32,
});

function makeGoal(value: GoalDefinition): Readonly<GoalDefinition> {
  return Object.freeze({
    ...value,
    ...(value.prerequisites === undefined
      ? {}
      : {
          prerequisites: Object.freeze({
            operator: value.prerequisites.operator,
            goalIds: Object.freeze([...value.prerequisites.goalIds]),
          }),
        }),
    ...(value.unavailableFacts === undefined
      ? {}
      : { unavailableFacts: Object.freeze([...value.unavailableFacts]) }),
  });
}

/** Builds a read-only MAD graph from current native facts; absent offers stay unknown. */
export function planMadGoal(
  input: Readonly<MadGoalPlanningInput>,
): MadGoalPlan {
  const unavailableFacts: string[] = [];
  const blockers: string[] = [];
  const quantitativeRequirements: GoalQuantityRequirement[] = [];
  const goals = new Map<string, Readonly<GoalDefinition>>();
  const selectedMad = input.selectedPrestige === "mad";
  const researchGranted =
    input.madResearchLevel !== undefined && input.madResearchLevel > 0;
  const researchMissing =
    input.madResearchLevel !== undefined && input.madResearchLevel <= 0;

  if (!selectedMad)
    unavailableFacts.push("MAD is not the selected terminal objective");
  if (input.madResearchLevel === undefined)
    unavailableFacts.push("native tech.mad level is unavailable");
  if (
    !input.offerCatalogAvailable &&
    !researchGranted &&
    selectedMad &&
    !input.resetConfirmed
  ) {
    unavailableFacts.push("current Research offer catalog is unavailable");
  }

  let affordability: MadGoalPlan["affordability"] = "unavailable";
  const requirementGoalIds: string[] = [];
  const offerFacts: string[] = [];
  let hasUnrecognizedOrMissingPrice = false;
  let capturedAllPricesAffordable = true;
  let hasCompletePriceCapture = input.offeredMadTech?.priceComplete === true;

  if (input.offeredMadTech !== undefined && !researchGranted) {
    for (const [resourceId, amount] of Object.entries(
      input.offeredMadTech.costs,
    )) {
      if (!Number.isFinite(amount) || amount < 0) {
        hasUnrecognizedOrMissingPrice = true;
        hasCompletePriceCapture = false;
        offerFacts.push(`native price for ${resourceId} is invalid`);
        continue;
      }
      if (amount === 0) continue;
      const resource = input.resources.get(resourceId);
      const requirement: GoalQuantityRequirement = Object.freeze({
        resourceId,
        amount,
        ...(resource?.amount === undefined ? {} : { held: resource.amount }),
        ...(resource?.capacity === undefined
          ? {}
          : { capacity: resource.capacity }),
        ...(resource?.netRate === undefined
          ? {}
          : { netRate: resource.netRate }),
      });
      quantitativeRequirements.push(requirement);
      const resourceGoalId = `resource:${resourceId}`;
      requirementGoalIds.push(resourceGoalId);

      let resourceStatus: GoalStatus = "unavailable";
      if (resource === undefined) {
        hasUnrecognizedOrMissingPrice = true;
        hasCompletePriceCapture = false;
        offerFacts.push(`native price resource ${resourceId} is unavailable`);
      } else {
        let resourceAffordable = true;
        if (resource.amount === undefined) {
          hasCompletePriceCapture = false;
          offerFacts.push(`current stock for ${resourceId} is unavailable`);
        } else if (resource.amount < amount) {
          resourceAffordable = false;
          capturedAllPricesAffordable = false;
          blockers.push(`${resourceId}:stock-below-native-price`);
        }
        if (resource.capacity === undefined) {
          hasCompletePriceCapture = false;
          offerFacts.push(`current capacity for ${resourceId} is unavailable`);
        } else if (!hasSufficientGoalCapacity(resource.capacity, amount)) {
          resourceAffordable = false;
          capturedAllPricesAffordable = false;
          blockers.push(`${resourceId}:capacity-below-native-price`);
        }
        resourceStatus =
          resource.amount === undefined || resource.capacity === undefined
            ? resourceAffordable
              ? "unavailable"
              : "unsatisfied"
            : resourceAffordable
              ? "satisfied"
              : "unsatisfied";
        if (resource.amount !== undefined && resource.amount < amount) {
          if (resource.netRate === undefined) {
            offerFacts.push(`net production for ${resourceId} is unavailable`);
          } else if (resource.netRate <= 0) {
            blockers.push(`${resourceId}:nonpositive-net-production`);
          }
        }
      }
      goals.set(
        resourceGoalId,
        makeGoal({
          id: resourceGoalId,
          scope: "run",
          predicate: "native-resource-quantity",
          provenance: "derived-requirement",
          reason: `current native price requires ${amount} ${resourceId}`,
          status: resourceStatus,
          quantity: requirement,
          ...(resourceStatus === "unavailable"
            ? {
                unavailableFacts: [
                  `resource view for ${resourceId} is incomplete`,
                ],
              }
            : {}),
        }),
      );
    }

    if (hasCompletePriceCapture && !hasUnrecognizedOrMissingPrice) {
      const capturedVerdict = capturedAllPricesAffordable;
      if (capturedVerdict !== input.offeredMadTech.nativeAffordable) {
        affordability = "inconsistent";
        offerFacts.push(
          `native affordability (${input.offeredMadTech.nativeAffordable}) disagrees with captured stock and capacity (${capturedVerdict})`,
        );
      } else {
        affordability = "consistent";
      }
    } else {
      offerFacts.push(
        "native affordability cannot be reconciled with incomplete price views",
      );
    }

    const offerStatus =
      affordability === "inconsistent" ||
      hasUnrecognizedOrMissingPrice ||
      !hasCompletePriceCapture
        ? "unavailable"
        : "unsatisfied";
    goals.set(
      MAD_OFFER_GOAL_ID,
      makeGoal({
        id: MAD_OFFER_GOAL_ID,
        scope: "run",
        predicate: "complete-current-native-offer",
        provenance: "native-prerequisite",
        reason: "the currently drawn native Research action for MAD",
        status: offerStatus,
        action: input.offeredMadTech.action,
        prerequisites: Object.freeze({
          operator: "all",
          goalIds: requirementGoalIds,
        }),
        ...(offerFacts.length === 0 ? {} : { unavailableFacts: offerFacts }),
      }),
    );
  } else if (!researchGranted && input.offerCatalogAvailable) {
    offerFacts.push(
      "tech-mad is not currently offered; locked requirements are unavailable here",
    );
    goals.set(
      MAD_OFFER_GOAL_ID,
      makeGoal({
        id: MAD_OFFER_GOAL_ID,
        scope: "run",
        predicate: "current-native-offer",
        provenance: "native-prerequisite",
        reason: "no current tech-mad offer was observed",
        status: "unavailable",
        unavailableFacts: offerFacts,
      }),
    );
  } else if (!researchGranted) {
    offerFacts.push("current Research offer catalog is unavailable");
    goals.set(
      MAD_OFFER_GOAL_ID,
      makeGoal({
        id: MAD_OFFER_GOAL_ID,
        scope: "run",
        predicate: "current-native-offer",
        provenance: "native-prerequisite",
        reason: "no current Research catalog observation",
        status: "unavailable",
        unavailableFacts: offerFacts,
      }),
    );
  }

  const researchStatus: GoalStatus = researchGranted
    ? "satisfied"
    : researchMissing
      ? "unsatisfied"
      : "unavailable";
  goals.set(
    MAD_RESEARCH_GOAL_ID,
    makeGoal({
      id: MAD_RESEARCH_GOAL_ID,
      scope: "run",
      predicate: "granted-tech-mad",
      provenance: "native-prerequisite",
      reason: "native tech.mad grant",
      status: researchStatus,
      ...(researchMissing && !researchGranted
        ? {
            prerequisites: Object.freeze({
              operator: "all",
              goalIds: Object.freeze([MAD_OFFER_GOAL_ID]),
            }),
          }
        : {}),
      ...(input.madResearchLevel === undefined
        ? { unavailableFacts: ["native tech.mad level is unavailable"] }
        : {}),
    }),
  );

  const controlStatus: GoalStatus =
    input.madControlDisplay === undefined
      ? "unavailable"
      : !input.madControlDisplay
        ? "unsatisfied"
        : input.madControlBound === undefined
          ? "unavailable"
          : input.madControlBound
            ? "satisfied"
            : "unsatisfied";
  const controlFacts =
    input.madControlDisplay === undefined
      ? ["native civic.mad.display is unavailable"]
      : !input.madControlDisplay
        ? []
        : input.madControlBound === undefined
          ? ["current MAD control binding is unavailable"]
          : !input.madControlBound
            ? [
                "MAD is displayed but the current native control binding is absent",
              ]
            : !researchGranted
              ? [
                  "MAD control is displayed without a positively established tech.mad grant",
                ]
              : [];
  goals.set(
    MAD_CONTROL_GOAL_ID,
    makeGoal({
      id: MAD_CONTROL_GOAL_ID,
      scope: "run",
      predicate: "native-mad-control-available",
      provenance: "native-prerequisite",
      reason: "native civic.mad.display gate",
      status: controlStatus,
      ...(controlFacts.length === 0 ? {} : { unavailableFacts: controlFacts }),
    }),
  );

  const nativeLaunchStatus: GoalStatus =
    controlStatus !== "satisfied"
      ? controlStatus
      : input.madArmed === undefined || input.madCataclysm === undefined
        ? "unavailable"
        : input.madArmed || input.madCataclysm
          ? "unsatisfied"
          : "satisfied";
  const nativeLaunchFacts =
    controlStatus === "satisfied" &&
    (input.madArmed === undefined || input.madCataclysm === undefined)
      ? ["native armed/cataclysm launch gate is unavailable"]
      : [];
  goals.set(
    MAD_NATIVE_LAUNCH_GOAL_ID,
    makeGoal({
      id: MAD_NATIVE_LAUNCH_GOAL_ID,
      scope: "run",
      predicate: "native-mad-warhead-launch-gate",
      provenance: "native-prerequisite",
      reason:
        "native launch and warhead require an unarmed non-Cataclysm state",
      status: nativeLaunchStatus,
      prerequisites: Object.freeze({
        operator: "all",
        goalIds: Object.freeze([MAD_CONTROL_GOAL_ID]),
      }),
      ...(nativeLaunchFacts.length === 0
        ? {}
        : { unavailableFacts: nativeLaunchFacts }),
    }),
  );

  const populationSoldierStatus: GoalStatus =
    input.madWaitPolicyGate === undefined
      ? "unavailable"
      : input.madWaitPolicyGate
        ? "satisfied"
        : "unsatisfied";
  const populationSoldierFacts =
    input.madWaitPolicyGate === undefined
      ? ["automation population/soldier wait-policy result is unavailable"]
      : [];
  goals.set(
    MAD_POPULATION_SOLDIER_GOAL_ID,
    makeGoal({
      id: MAD_POPULATION_SOLDIER_GOAL_ID,
      scope: "run",
      predicate: "automation-mad-population-soldier-wait-policy",
      provenance: "derived-requirement",
      reason: "applicable automation population and soldier wait policy",
      status: populationSoldierStatus,
      ...(populationSoldierFacts.length === 0
        ? {}
        : { unavailableFacts: populationSoldierFacts }),
    }),
  );

  const permissionGoal = makeGoal({
    id: MAD_AUTOMATION_GOAL_ID,
    scope: "run",
    predicate: "automatic-prestige-permission",
    provenance: "derived-requirement",
    reason: "autoPrestige setting",
    status: input.prestigePermission ? "satisfied" : "blocked",
  });
  goals.set(MAD_AUTOMATION_GOAL_ID, permissionGoal);
  if (selectedMad && !input.resetConfirmed) {
    if (!input.prestigePermission)
      blockers.push("automation-permission-disabled");
    if (controlStatus === "satisfied" && input.madArmed === true)
      blockers.push("native-mad-warhead-armed");
    if (controlStatus === "satisfied" && input.madCataclysm === true)
      blockers.push("native-mad-launch-disabled-for-cataclysm");
  }

  const resetEligibilityStatus = input.resetConfirmed
    ? "satisfied"
    : combinePrerequisiteStatuses("all", [
        populationSoldierStatus,
        nativeLaunchStatus,
        permissionGoal.status,
      ]);
  goals.set(
    MAD_RESET_ELIGIBILITY_GOAL_ID,
    makeGoal({
      id: MAD_RESET_ELIGIBILITY_GOAL_ID,
      scope: "run",
      predicate: "native-mad-reset-eligibility-and-ownership",
      provenance: "native-prerequisite",
      reason: "native MAD control, reset conditions, and automation ownership",
      status: resetEligibilityStatus,
      prerequisites: Object.freeze({
        operator: "all",
        goalIds: Object.freeze([
          MAD_POPULATION_SOLDIER_GOAL_ID,
          MAD_NATIVE_LAUNCH_GOAL_ID,
          MAD_AUTOMATION_GOAL_ID,
        ]),
      }),
    }),
  );

  const status: GoalStatus = !selectedMad
    ? "unavailable"
    : input.resetConfirmed
      ? "satisfied"
      : (() => {
          const readiness = combinePrerequisiteStatuses("all", [
            researchStatus,
            resetEligibilityStatus,
          ]);
          // Research and reset eligibility describe readiness; only the observed reset
          // transition completes the player-selected terminal goal.
          return readiness === "satisfied" ? "unsatisfied" : readiness;
        })();
  const selectedGoal = makeGoal({
    id: MAD_TERMINAL_GOAL_ID,
    scope: "run",
    predicate: "confirmed-mad-reset",
    provenance: "player-selected",
    reason: "selected prestigeType=mad",
    status,
    prerequisites: Object.freeze({
      operator: "all",
      goalIds: Object.freeze([
        MAD_RESEARCH_GOAL_ID,
        MAD_RESET_ELIGIBILITY_GOAL_ID,
      ]),
    }),
    ...(unavailableFacts.length === 0 ? {} : { unavailableFacts }),
  });
  goals.set(MAD_TERMINAL_GOAL_ID, selectedGoal);

  let currentSubgoal: string | undefined;
  if (selectedMad && !input.resetConfirmed) {
    if (!researchGranted) {
      currentSubgoal =
        input.offeredMadTech?.action.nativeId ?? MAD_RESEARCH_GOAL_ID;
    } else if (controlStatus !== "satisfied") {
      currentSubgoal = MAD_CONTROL_GOAL_ID;
    } else if (nativeLaunchStatus !== "satisfied") {
      currentSubgoal = MAD_NATIVE_LAUNCH_GOAL_ID;
    } else if (populationSoldierStatus !== "satisfied") {
      currentSubgoal = MAD_POPULATION_SOLDIER_GOAL_ID;
    } else if (!input.prestigePermission) {
      currentSubgoal = MAD_AUTOMATION_GOAL_ID;
    }
  }

  const traversal = traverseGoalGraph(
    MAD_TERMINAL_GOAL_ID,
    goals,
    MAD_GRAPH_TRACE_LIMITS,
  );
  const frontierTrace = Object.freeze(
    traversal.visited.map(
      (goalId) => `${goalId}:${goals.get(goalId)?.status ?? "missing"}`,
    ),
  );
  for (const goalId of traversal.missing)
    unavailableFacts.push(`goal graph references missing node ${goalId}`);
  for (const limit of traversal.limits)
    unavailableFacts.push(`goal graph traversal stopped at ${limit}`);
  for (const cycle of traversal.cycles)
    unavailableFacts.push(`goal graph cycle ${cycle.join(" -> ")}`);

  for (const goal of goals.values()) {
    for (const fact of goal.unavailableFacts ?? []) {
      if (!unavailableFacts.includes(fact)) unavailableFacts.push(fact);
    }
  }

  let strategyComparison: GoalStrategyComparison | undefined;
  if (
    input.offeredMadTech !== undefined &&
    !researchGranted &&
    input.offeredMadTech.priceComplete &&
    affordability === "consistent"
  ) {
    const feasibilityEpoch = `${input.progressionEpoch}|cycle:${input.cycle}|offer:${input.offeredMadTech.generation}`;
    const requirements: GoalResourceNeed[] = quantitativeRequirements.map(
      (requirement) => ({
        resourceId: requirement.resourceId,
        poolId: "anywhere",
        amount: requirement.amount,
      }),
    );
    const stocks: GoalResourceStock[] = quantitativeRequirements.flatMap(
      (requirement) => {
        const resource = input.resources.get(requirement.resourceId);
        if (
          resource?.amount === undefined ||
          resource.capacity === undefined ||
          resource.netRate === undefined
        ) {
          return [];
        }
        return [
          {
            resourceId: requirement.resourceId,
            poolId: "anywhere",
            amount: resource.amount,
            capacity: resource.capacity,
            netRate: resource.netRate,
            rateConfidence: "observed",
            validityEpoch: feasibilityEpoch,
          },
        ];
      },
    );
    strategyComparison = compareGoalStrategies(
      input.offeredMadTech.action.nativeId,
      requirements,
      stocks,
      [],
      [
        {
          id: "scientist-reassignment",
          goalId: input.offeredMadTech.action.nativeId,
          preconditions: {
            satisfied: false,
            reasons: [
              "available workers, displaced-job output and food safety are not captured together",
            ],
          },
          acquisitionCosts: [],
          productionChanges: undefined,
          effectsComplete: false,
          effectAuthority: "provisional",
          validityEpoch: feasibilityEpoch,
          unavailableReasons: [
            "no safe native marginal authority for reassigned Scientists was observed",
          ],
        },
        {
          id: "city-library",
          goalId: input.offeredMadTech.action.nativeId,
          preconditions: {
            satisfied: false,
            reasons: [
              "current Library offer, adjusted cost and purchase verdict are not captured",
            ],
          },
          acquisitionCosts: [],
          productionChanges: undefined,
          effectsComplete: false,
          effectAuthority: "provisional",
          validityEpoch: feasibilityEpoch,
          unavailableReasons: [
            "one-copy Library Knowledge production and capacity effects are not captured",
          ],
        },
      ],
      feasibilityEpoch,
      false,
    );
  } else if (input.offeredMadTech !== undefined && !researchGranted) {
    unavailableFacts.push(
      "strategy comparison unavailable: native MAD Research price is incomplete or contradictory",
    );
  }

  return Object.freeze({
    selectedGoal,
    goals: Object.freeze([...goals.values()]),
    status,
    currentSubgoal,
    frontierTrace,
    blockers: Object.freeze(blockers),
    ...(input.offeredMadTech === undefined || researchGranted
      ? {}
      : { action: input.offeredMadTech }),
    affordability,
    quantitativeRequirements: Object.freeze(quantitativeRequirements),
    ...(strategyComparison === undefined ? {} : { strategyComparison }),
    unavailableFacts: Object.freeze(unavailableFacts),
    freshness: Object.freeze({
      cycle: input.cycle,
      progressionEpoch: input.progressionEpoch,
      ...(input.offeredMadTech === undefined || researchGranted
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
