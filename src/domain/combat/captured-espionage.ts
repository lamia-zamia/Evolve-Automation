/** Pure planning for one captured foreign espionage operation. */

import {
  capturedForeignPolicyEspionageOperation,
  type CapturedEspionageOperation,
} from "./captured-foreign-policies.ts";

export type { CapturedEspionageOperation };

export interface CapturedEspionageInput {
  readonly enabled: boolean;
  readonly governmentId: number;
  /** The selected foreign action policy, not a battle-only effective policy. */
  readonly policy: string;
  readonly spyCount: number;
  readonly sabotageProgress: number;
  readonly military: number;
  readonly hostility: number | undefined;
  readonly unrest: number | undefined;
  readonly occupied: boolean;
  readonly annexed: boolean;
  readonly purchased: boolean;
  readonly useful: boolean;
}

export interface CapturedEspionageDecision {
  readonly kind: "captured-espionage";
  readonly governmentId: number;
  readonly operation: CapturedEspionageOperation;
  readonly expectedSpyCount: number;
  readonly expectedSabotageProgress: number;
  readonly expectedMilitary: number;
  readonly expectedHostility: number | undefined;
  readonly expectedUnrest: number | undefined;
  readonly expectedOccupied: boolean;
  readonly expectedAnnexed: boolean;
  readonly expectedPurchased: boolean;
}

export function capturedEspionageOperationForPolicy(
  policy: string,
  military: number,
  hostility: number | undefined,
): CapturedEspionageOperation | null {
  if (policy === "Betrayal") {
    return military <= 75 || (hostility !== undefined && hostility <= 0)
      ? "sabotage"
      : "influence";
  }
  // Occupy prepares by force rather than by mission, so it borrows sabotage instead of carrying
  // an operation of its own in the catalog.
  if (policy === "Occupy") return "sabotage";
  return capturedForeignPolicyEspionageOperation(policy);
}

function capturedEspionageOperation(
  input: Readonly<CapturedEspionageInput>,
): CapturedEspionageOperation | null {
  return capturedEspionageOperationForPolicy(
    input.policy,
    input.military,
    input.hostility,
  );
}

export function planCapturedEspionage(
  input: Readonly<CapturedEspionageInput>,
): Readonly<CapturedEspionageDecision> | null {
  const operation = capturedEspionageOperation(input);
  if (
    !input.enabled ||
    !Number.isSafeInteger(input.governmentId) ||
    input.spyCount < 1 ||
    input.sabotageProgress !== 0 ||
    !input.useful ||
    operation === null ||
    input.occupied ||
    input.annexed ||
    input.purchased
  ) {
    return null;
  }
  return Object.freeze({
    kind: "captured-espionage" as const,
    governmentId: input.governmentId,
    operation,
    expectedSpyCount: input.spyCount,
    expectedSabotageProgress: input.sabotageProgress,
    expectedMilitary: input.military,
    expectedHostility: input.hostility,
    expectedUnrest: input.unrest,
    expectedOccupied: input.occupied,
    expectedAnnexed: input.annexed,
    expectedPurchased: input.purchased,
  });
}
