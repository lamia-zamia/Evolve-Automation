export interface GoalResourcePrice {
  readonly resourceId: string;
  readonly amount: number;
}

export interface GoalResourceOffer {
  readonly actionId: string;
  /** The current native offer price, sampled from the game. */
  readonly price: readonly GoalResourcePrice[] | null;
}

export interface GoalResourceHolding {
  readonly resourceId: string;
  readonly amount: number | null;
  readonly capacity: number | null;
}

export type GoalResourceCommitment = GoalResourcePrice;

export interface GoalResourceProductionCapability {
  readonly resourceId: string;
  readonly ownerId: string | null;
  readonly available: boolean | null;
  readonly unavailableReason: string | null;
  readonly automationEnabled: boolean | null;
}

export interface GoalResourceFrontier {
  readonly evidence: "complete" | "partial" | "unavailable";
  readonly mandatoryActionIds: readonly string[];
  readonly alternatives: readonly Readonly<{
    readonly groupId: string;
    readonly actionIds: readonly string[];
  }>[];
  readonly reasons: readonly string[];
}

export interface GoalResourceIntentInput {
  readonly selectedGoal: string;
  readonly frontier: Readonly<GoalResourceFrontier>;
  readonly offers: readonly GoalResourceOffer[];
  readonly holdings: readonly GoalResourceHolding[];
  /** Current spends that must remain possible alongside the selected goal. */
  readonly commitments: readonly GoalResourceCommitment[];
  /** Captured live capabilities and explicit user permissions; never inferred by action name. */
  readonly production: readonly GoalResourceProductionCapability[];
}

export interface GoalResourceIntent {
  readonly actionId: string;
  readonly resourceId: string;
  readonly requiredQuantity: number;
  readonly heldQuantity: number | null;
  readonly committedQuantity: number;
  readonly shortfall: number | null;
  readonly productionOwnerId: string | null;
  readonly status:
    | "intent"
    | "permission-disabled"
    | "production-unavailable"
    | "capacity-insufficient"
    | "evidence-unavailable";
  readonly reason: string | null;
}

export interface GoalResourceIntentPlan {
  readonly status: "available" | "partial" | "unavailable";
  readonly selectedGoal: string;
  readonly mandatory: readonly GoalResourceIntent[];
  readonly unavailableActionIds: readonly string[];
  readonly alternatives: readonly Readonly<{
    readonly groupId: string;
    readonly options: readonly Readonly<{
      readonly actionId: string;
      readonly intents: readonly GoalResourceIntent[];
    }>[];
  }>[];
  readonly reasons: readonly string[];
}

function summedAmount(
  resourceId: string,
  values: readonly GoalResourcePrice[],
): number {
  return values.reduce(
    (sum, value) =>
      value.resourceId === resourceId ? sum + value.amount : sum,
    0,
  );
}

/**
 * Describes resource production needed by a selected goal's native prerequisite frontier.
 * The result is observational: it does not create a spending reservation or mutate a producer.
 */
export function planGoalResourceIntents(
  input: Readonly<GoalResourceIntentInput>,
): Readonly<GoalResourceIntentPlan> {
  const reasons = [...input.frontier.reasons];
  if (input.selectedGoal.length === 0)
    reasons.push("selected goal is unavailable");
  if (input.frontier.evidence !== "complete")
    reasons.push("native prerequisite frontier is not complete");
  if (reasons.length > 0) {
    return Object.freeze({
      status: "unavailable",
      selectedGoal: input.selectedGoal,
      mandatory: Object.freeze([]),
      unavailableActionIds: Object.freeze([]),
      alternatives: Object.freeze([]),
      reasons: Object.freeze([...new Set(reasons)]),
    });
  }

  const offers = new Map(input.offers.map((offer) => [offer.actionId, offer]));
  const holdings = new Map(
    input.holdings.map((holding) => [holding.resourceId, holding]),
  );
  const capabilities = new Map(
    input.production.map((capability) => [capability.resourceId, capability]),
  );

  const unavailableActionIds: string[] = [];
  const intentsFor = (actionId: string): readonly GoalResourceIntent[] => {
    const offer = offers.get(actionId);
    if (offer === undefined || offer.price === null) {
      unavailableActionIds.push(actionId);
      return Object.freeze([]);
    }
    const intents: GoalResourceIntent[] = [];
    for (const cost of offer.price) {
      const holding = holdings.get(cost.resourceId);
      const capability = capabilities.get(cost.resourceId);
      const committedQuantity = summedAmount(
        cost.resourceId,
        input.commitments,
      );
      const heldQuantity = holding?.amount;
      const totalRequired = cost.amount + committedQuantity;
      const shortfall =
        heldQuantity === null || heldQuantity === undefined
          ? null
          : Math.max(0, totalRequired - heldQuantity);
      if (shortfall === 0) continue;
      let status: GoalResourceIntent["status"] = "intent";
      let reason: string | null = null;
      if (
        holding === undefined ||
        heldQuantity === null ||
        holding.capacity === null ||
        capability === undefined ||
        capability.available === null ||
        capability.automationEnabled === null ||
        capability.ownerId === null
      ) {
        status = "evidence-unavailable";
        reason =
          "resource holding, capacity, or production capability is unknown";
      } else if (holding.capacity < totalRequired) {
        status = "capacity-insufficient";
        reason = "current capacity is below the required holding";
      } else if (capability.available === false) {
        status = "production-unavailable";
        reason =
          capability.unavailableReason ??
          "no current enabled production capability can produce this resource";
      } else if (capability.automationEnabled === false) {
        status = "permission-disabled";
        reason = "the production owner's automation permission is disabled";
      }
      intents.push(
        Object.freeze({
          actionId,
          resourceId: cost.resourceId,
          requiredQuantity: cost.amount,
          heldQuantity: heldQuantity ?? null,
          committedQuantity,
          shortfall,
          productionOwnerId: capability?.ownerId ?? null,
          status,
          reason,
        }),
      );
    }
    return Object.freeze(intents);
  };

  const mandatory = input.frontier.mandatoryActionIds.flatMap(intentsFor);
  const alternatives = input.frontier.alternatives.map((group) =>
    Object.freeze({
      groupId: group.groupId,
      options: Object.freeze(
        group.actionIds.map((actionId) =>
          Object.freeze({ actionId, intents: intentsFor(actionId) }),
        ),
      ),
    }),
  );
  return Object.freeze({
    status: unavailableActionIds.length === 0 ? "available" : "partial",
    selectedGoal: input.selectedGoal,
    mandatory: Object.freeze(mandatory),
    unavailableActionIds: Object.freeze([...new Set(unavailableActionIds)]),
    alternatives: Object.freeze(alternatives),
    reasons: Object.freeze([]),
  });
}
