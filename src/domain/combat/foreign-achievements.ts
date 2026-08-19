export type ForeignAchievementGoal = "world-domination" | "syndicate";

export interface ForeignAchievementState {
  readonly occupied: boolean;
  readonly annexed: boolean;
  readonly purchased: boolean;
}

export interface ForeignAchievementGoalInput {
  readonly guardWorldDomination: boolean;
  readonly guardSyndicate: boolean;
  readonly worldDominationUnlocked: boolean;
  readonly syndicateUnlocked: boolean;
  /**
   * Whether the Pacifist guard currently forbids attacking. World Domination
   * needs every city occupied and occupation only happens through an attack,
   * so that path is unreachable while the guard is armed.
   */
  readonly pacifistGuardActive: boolean;
  readonly foreignStates: readonly ForeignAchievementState[];
}

/**
 * Pick one mutually exclusive three-city achievement path without changing
 * the user's foreign-policy settings permanently. Existing progress wins; a
 * clean slate defaults to World Domination for deterministic arbitration.
 */
export function planForeignAchievementGoal(
  input: Readonly<ForeignAchievementGoalInput>,
): ForeignAchievementGoal | null {
  if (input.foreignStates.length !== 3) return null;

  const worldPossible =
    input.guardWorldDomination &&
    !input.pacifistGuardActive &&
    !input.worldDominationUnlocked &&
    input.foreignStates.every((state) => !state.annexed && !state.purchased);
  const syndicatePossible =
    input.guardSyndicate &&
    !input.syndicateUnlocked &&
    input.foreignStates.every((state) => !state.annexed && !state.occupied);

  if (!worldPossible && !syndicatePossible) return null;
  if (worldPossible && input.foreignStates.some((state) => state.occupied)) {
    return "world-domination";
  }
  if (
    syndicatePossible &&
    input.foreignStates.some((state) => state.purchased)
  ) {
    return "syndicate";
  }
  return worldPossible ? "world-domination" : "syndicate";
}
