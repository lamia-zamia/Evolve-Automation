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
  /** Undefined when the shared Purchase reservation sample could not be established. */
  readonly purchaseMoney: number | undefined;
  readonly purchaseForeign: boolean | undefined;
  readonly elusive: boolean;
  readonly useful: boolean;
}

interface CapturedEspionageExpectedState {
  readonly governmentId: number;
  readonly expectedPolicy: string;
  readonly expectedSpyCount: number;
  readonly expectedSabotageProgress: number;
  readonly expectedMilitary: number;
  readonly expectedHostility: number | undefined;
  readonly expectedUnrest: number | undefined;
  readonly expectedOccupied: boolean;
  readonly expectedAnnexed: boolean;
  readonly expectedPurchased: boolean;
  readonly expectedPurchaseMoney: number | undefined;
  readonly expectedPurchaseForeign: boolean | undefined;
  readonly expectedElusive: boolean;
}

export interface CapturedEspionageDecision extends CapturedEspionageExpectedState {
  readonly kind: "captured-espionage";
  readonly operation: CapturedEspionageOperation;
}

export interface CapturedForeignReleaseDecision extends CapturedEspionageExpectedState {
  readonly kind: "release-foreign";
}

export type CapturedEspionagePlan =
  CapturedEspionageDecision | CapturedForeignReleaseDecision;

function capturedEspionageExpectedState(
  input: Readonly<CapturedEspionageInput>,
): CapturedEspionageExpectedState {
  return {
    governmentId: input.governmentId,
    expectedPolicy: input.policy,
    expectedSpyCount: input.spyCount,
    expectedSabotageProgress: input.sabotageProgress,
    expectedMilitary: input.military,
    expectedHostility: input.hostility,
    expectedUnrest: input.unrest,
    expectedOccupied: input.occupied,
    expectedAnnexed: input.annexed,
    expectedPurchased: input.purchased,
    expectedPurchaseMoney: input.purchaseMoney,
    expectedPurchaseForeign: input.purchaseForeign,
    expectedElusive: input.elusive,
  };
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
): Readonly<CapturedEspionagePlan> | null {
  if (
    !input.enabled ||
    !Number.isSafeInteger(input.governmentId) ||
    input.spyCount < 1 ||
    input.sabotageProgress !== 0 ||
    input.policy === "None"
  ) {
    return null;
  }
  const operation = capturedEspionageOperation(input);
  if (operation === null) return null;

  if (
    operation === "purchase" &&
    input.spyCount < 3 &&
    !input.elusive &&
    (input.purchaseMoney === undefined
      ? input.purchaseForeign !== false
      : input.purchaseMoney > 0 && input.purchaseForeign !== false)
  ) {
    return null;
  }

  if (
    (input.annexed && input.policy !== "Annex") ||
    (input.purchased && input.policy !== "Purchase") ||
    (input.occupied && input.policy !== "Occupy")
  ) {
    return Object.freeze({
      kind: "release-foreign" as const,
      ...capturedEspionageExpectedState(input),
    });
  }
  if (input.occupied || input.annexed || input.purchased || !input.useful) {
    return null;
  }

  return Object.freeze({
    kind: "captured-espionage" as const,
    ...capturedEspionageExpectedState(input),
    operation,
  });
}
