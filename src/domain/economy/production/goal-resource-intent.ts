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
  /** Completeness of the entire target graph; local obligations can be complete while this is partial. */
  readonly evidence: "complete" | "partial" | "unavailable";
  /** Authority for mandatoryActionIds. Offered membership alone is never sufficient. */
  readonly mandatoryEvidence: "complete" | "partial" | "unavailable";
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
    | "not-selected"
    | "permission-disabled"
    | "production-unavailable"
    | "capacity-insufficient"
    | "evidence-unavailable";
  readonly actionable: boolean;
  readonly reason: string | null;
}

export interface GoalResourceIntentPlan {
  readonly status: "available" | "partial" | "unavailable";
  readonly selectedGoal: string;
  /** A partial global graph does not erase a separately complete local obligation proof. */
  readonly frontierEvidence: GoalResourceFrontier["evidence"];
  readonly actionable: boolean;
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

function sumResourceCommitments(
  resourceId: string,
  values: readonly GoalResourcePrice[],
): number {
  return values.reduce(
    (sum, value) =>
      value.resourceId === resourceId ? sum + value.amount : sum,
    0,
  );
}

function validIdentifier(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_:-]*$/.test(value);
}

function validNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Describes resource production needed by a selected goal's native prerequisite frontier.
 * The result is observational: it does not create a spending reservation or mutate a producer.
 */
export function planGoalResourceIntents(
  input: Readonly<GoalResourceIntentInput>,
): Readonly<GoalResourceIntentPlan> {
  const reasons = [...input.frontier.reasons];
  if (!validIdentifier(input.selectedGoal))
    reasons.push("selected goal is unavailable");
  if (input.frontier.evidence === "unavailable")
    reasons.push("native prerequisite frontier is unavailable");
  if (input.frontier.mandatoryEvidence !== "complete")
    reasons.push("mandatory action evidence is not complete");
  if (
    input.frontier.evidence === "unavailable" ||
    !validIdentifier(input.selectedGoal) ||
    input.frontier.mandatoryEvidence !== "complete"
  ) {
    return Object.freeze({
      status: "unavailable",
      selectedGoal: input.selectedGoal,
      frontierEvidence: input.frontier.evidence,
      actionable: false,
      mandatory: Object.freeze([]),
      unavailableActionIds: Object.freeze([]),
      alternatives: Object.freeze([]),
      reasons: Object.freeze([...new Set(reasons)]),
    });
  }

  const validationReasons: string[] = [];
  const uniqueBy = <T>(
    values: readonly T[],
    keyOf: (value: T) => string,
    label: string,
  ): Map<string, T> => {
    const result = new Map<string, T>();
    for (const value of values) {
      const key = keyOf(value);
      if (!validIdentifier(key) || result.has(key))
        validationReasons.push(`invalid or duplicate ${label}: ${key}`);
      else result.set(key, value);
    }
    return result;
  };
  const offers = uniqueBy(input.offers, (offer) => offer.actionId, "offer");
  const holdings = uniqueBy(
    input.holdings,
    (holding) => holding.resourceId,
    "holding",
  );
  const capabilities = uniqueBy(
    input.production,
    (capability) => capability.resourceId,
    "production capability",
  );
  for (const offer of input.offers) {
    if (offer.price !== null) {
      const priceResourceIds = new Set<string>();
      for (const cost of offer.price) {
        if (
          !validIdentifier(cost.resourceId) ||
          !validNonnegative(cost.amount) ||
          priceResourceIds.has(cost.resourceId)
        )
          validationReasons.push(
            `invalid or duplicate native price for ${offer.actionId}`,
          );
        priceResourceIds.add(cost.resourceId);
      }
    }
  }
  for (const holding of input.holdings) {
    if (
      (holding.amount !== null && !validNonnegative(holding.amount)) ||
      (holding.capacity !== null && !validNonnegative(holding.capacity)) ||
      (holding.amount !== null &&
        holding.capacity !== null &&
        holding.amount > holding.capacity)
    )
      validationReasons.push(
        `invalid holding or capacity for ${holding.resourceId}`,
      );
  }
  for (const commitment of input.commitments) {
    if (
      !validIdentifier(commitment.resourceId) ||
      !validNonnegative(commitment.amount)
    )
      validationReasons.push(`invalid commitment for ${commitment.resourceId}`);
  }
  const mandatoryIds = new Set<string>();
  for (const actionId of input.frontier.mandatoryActionIds) {
    if (!validIdentifier(actionId) || mandatoryIds.has(actionId))
      validationReasons.push(
        `invalid or duplicate mandatory action identifier: ${actionId}`,
      );
    mandatoryIds.add(actionId);
  }
  const alternativeGroupIds = new Set<string>();
  for (const group of input.frontier.alternatives) {
    if (
      !validIdentifier(group.groupId) ||
      alternativeGroupIds.has(group.groupId) ||
      group.actionIds.some((actionId) => !validIdentifier(actionId)) ||
      new Set(group.actionIds).size !== group.actionIds.length
    )
      validationReasons.push(`invalid alternative group: ${group.groupId}`);
    alternativeGroupIds.add(group.groupId);
  }
  for (const capability of input.production) {
    if (
      (capability.ownerId !== null && !validIdentifier(capability.ownerId)) ||
      (capability.available === true && capability.ownerId === null) ||
      (capability.automationEnabled === true && capability.ownerId === null)
    )
      validationReasons.push(
        `inconsistent production capability for ${capability.resourceId}`,
      );
  }
  if (validationReasons.length > 0) {
    return Object.freeze({
      status: "unavailable",
      selectedGoal: input.selectedGoal,
      frontierEvidence: input.frontier.evidence,
      actionable: false,
      mandatory: Object.freeze([]),
      unavailableActionIds: Object.freeze([]),
      alternatives: Object.freeze([]),
      reasons: Object.freeze([...new Set(validationReasons)]),
    });
  }

  const unavailableActionIds: string[] = [];
  const intentsFor = (
    actionId: string,
    mandatory: boolean,
  ): readonly GoalResourceIntent[] => {
    const offer = offers.get(actionId);
    if (offer === undefined || offer.price === null) {
      if (mandatory) unavailableActionIds.push(actionId);
      return Object.freeze([]);
    }
    const intents: GoalResourceIntent[] = [];
    for (const cost of offer.price) {
      const holding = holdings.get(cost.resourceId);
      const capability = capabilities.get(cost.resourceId);
      const committedQuantity = sumResourceCommitments(
        cost.resourceId,
        input.commitments,
      );
      const heldQuantity = holding?.amount;
      const totalRequired = cost.amount + committedQuantity;
      if (
        !Number.isFinite(committedQuantity) ||
        !Number.isFinite(totalRequired)
      ) {
        if (mandatory) unavailableActionIds.push(actionId);
        continue;
      }
      const shortfall =
        heldQuantity === null || heldQuantity === undefined
          ? null
          : Math.max(0, totalRequired - heldQuantity);
      if (shortfall === 0) continue;
      if (!mandatory) {
        intents.push(
          Object.freeze({
            actionId,
            resourceId: cost.resourceId,
            requiredQuantity: cost.amount,
            heldQuantity: heldQuantity ?? null,
            committedQuantity,
            shortfall,
            productionOwnerId: capability?.ownerId ?? null,
            status: "not-selected",
            actionable: false,
            reason: "alternative path has not been selected",
          }),
        );
        continue;
      }
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
          actionable:
            status === "intent" &&
            actionIdIsMandatory(input.frontier, actionId),
          reason,
        }),
      );
    }
    return Object.freeze(intents);
  };

  const mandatoryResources = new Map<string, Set<string>>();
  for (const actionId of input.frontier.mandatoryActionIds) {
    const offer = offers.get(actionId);
    for (const price of offer?.price ?? []) {
      const actions =
        mandatoryResources.get(price.resourceId) ?? new Set<string>();
      actions.add(actionId);
      mandatoryResources.set(price.resourceId, actions);
    }
  }
  const mandatory = input.frontier.mandatoryActionIds
    .flatMap((actionId) => intentsFor(actionId, true))
    .map((intent) => {
      const competitors = mandatoryResources.get(intent.resourceId);
      if (
        competitors !== undefined &&
        competitors.size > 1 &&
        intent.shortfall !== 0
      )
        return Object.freeze({
          ...intent,
          status: "evidence-unavailable" as const,
          actionable: false,
          reason: "multiple mandatory actions compete for the same resource",
        });
      return intent;
    });
  const alternatives = input.frontier.alternatives.map((group) =>
    Object.freeze({
      groupId: group.groupId,
      options: Object.freeze(
        group.actionIds.map((actionId) =>
          Object.freeze({ actionId, intents: intentsFor(actionId, false) }),
        ),
      ),
    }),
  );
  const safeMandatory =
    unavailableActionIds.length === 0
      ? mandatory
      : mandatory.map((intent) =>
          Object.freeze({ ...intent, actionable: false }),
        );
  const actionable =
    unavailableActionIds.length === 0 &&
    safeMandatory.some((intent) => intent.actionable);
  return Object.freeze({
    status:
      input.frontier.evidence === "complete" &&
      unavailableActionIds.length === 0
        ? "available"
        : "partial",
    selectedGoal: input.selectedGoal,
    frontierEvidence: input.frontier.evidence,
    actionable,
    mandatory: Object.freeze(safeMandatory),
    unavailableActionIds: Object.freeze([...new Set(unavailableActionIds)]),
    alternatives: Object.freeze(alternatives),
    reasons: Object.freeze(
      input.frontier.evidence === "complete"
        ? []
        : [
            ...input.frontier.reasons,
            "global prerequisite graph is partial; using only locally verified mandatory actions",
          ],
    ),
  });
}

function actionIdIsMandatory(
  frontier: Readonly<GoalResourceFrontier>,
  actionId: string,
): boolean {
  return (
    frontier.mandatoryEvidence === "complete" &&
    frontier.mandatoryActionIds.includes(actionId)
  );
}
