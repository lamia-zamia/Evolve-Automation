export interface SpyCycleInput {
  readonly available: boolean;
  readonly trainEnabled: boolean;
  readonly advancedEspionage: boolean;
  readonly foreignCount: number;
}

export interface SpyCyclePlan {
  readonly trainEnabled: boolean;
  readonly espionageEnabled: boolean;
  readonly foreignCount: number;
}

export interface SpyTrainingInput {
  readonly foreignIndex: number;
  readonly governmentId: number;
  readonly governmentName: string;
  readonly disabled: boolean;
  readonly occupied: boolean;
  readonly annexed: boolean;
  readonly purchased: boolean;
  readonly policy: string;
  readonly spyCount: number;
  readonly spyMaximumSetting: number;
  /** Undefined when the captured purchase-reservation state could not be established. */
  readonly purchaseMoney: number | undefined;
  readonly moneyMaximum: number;
  readonly purchasePrice: number | null;
}

type SpyTrainingPolicyInput = Pick<
  SpyTrainingInput,
  | "disabled"
  | "occupied"
  | "annexed"
  | "purchased"
  | "policy"
  | "spyCount"
  | "spyMaximumSetting"
  | "purchaseMoney"
  | "moneyMaximum"
  | "purchasePrice"
>;

export interface TrainSpyDecision {
  readonly kind: "train-spy";
  readonly foreignIndex: number;
  readonly governmentId: number;
  readonly governmentName: string;
}

export interface SpyEspionageInput {
  readonly foreignIndex: number;
  readonly governmentId: number;
  readonly policy: string;
  readonly spyCount: number;
  readonly sabotageProgress: number;
  readonly military: number;
  readonly hostility: number;
  readonly occupied: boolean;
  readonly annexed: boolean;
  readonly purchased: boolean;
  readonly purchaseMoney: number;
  readonly purchaseForeign: boolean;
  readonly elusive: boolean;
  readonly isPrimaryTarget: boolean;
  readonly missionIds: Readonly<Record<string, string>>;
}

export interface ReleaseForeignDecision {
  readonly kind: "release-foreign";
  readonly foreignIndex: number;
  readonly governmentId: number;
  readonly expectedPolicy: string;
}

export interface PerformEspionageDecision {
  readonly kind: "perform-espionage";
  readonly foreignIndex: number;
  readonly governmentId: number;
  readonly missionId: string;
  readonly secondaryTarget: boolean;
}

export type SpyDecision =
  TrainSpyDecision | ReleaseForeignDecision | PerformEspionageDecision;

export function planSpyCycle(
  input: Readonly<SpyCycleInput>,
): Readonly<SpyCyclePlan> | null {
  if (!input.available) return null;
  return Object.freeze({
    trainEnabled: input.trainEnabled,
    espionageEnabled: input.advancedEspionage,
    foreignCount: input.foreignCount,
  });
}

export function planSpyTraining(
  input: Readonly<SpyTrainingInput>,
): Readonly<TrainSpyDecision> | null {
  if (!shouldTrainSpyUnderPolicy(input)) return null;

  return Object.freeze({
    kind: "train-spy",
    foreignIndex: input.foreignIndex,
    governmentId: input.governmentId,
    governmentName: input.governmentName,
  });
}

export function shouldTrainSpyUnderPolicy(
  input: Readonly<SpyTrainingPolicyInput>,
): boolean {
  if (input.disabled || input.occupied || input.annexed || input.purchased) {
    return false;
  }

  let spiesRequired =
    input.spyMaximumSetting >= 0
      ? input.spyMaximumSetting
      : Number.MAX_SAFE_INTEGER;
  if (
    spiesRequired < 1 &&
    input.policy !== "Occupy" &&
    input.policy !== "Ignore"
  ) {
    spiesRequired = 1;
  }
  if (
    spiesRequired < 3 &&
    input.policy === "Purchase" &&
    input.purchasePrice !== null &&
    input.moneyMaximum >= input.purchasePrice
  ) {
    spiesRequired = 3;
  }
  if (
    input.spyCount >= spiesRequired ||
    ((input.purchaseMoney === undefined || input.purchaseMoney > 0) &&
      input.policy !== "Purchase" &&
      input.spyCount > 0)
  ) {
    return false;
  }
  return true;
}

function selectMission(input: Readonly<SpyEspionageInput>): string | null {
  if (input.policy === "Betrayal") {
    return input.military <= 75 || input.hostility <= 0
      ? (input.missionIds["Sabotage"] ?? null)
      : (input.missionIds["Influence"] ?? null);
  }
  if (input.policy === "Occupy") {
    return input.missionIds["Sabotage"] ?? null;
  }
  return input.missionIds[input.policy] ?? null;
}

export function planSpyEspionage(
  input: Readonly<SpyEspionageInput>,
): Readonly<ReleaseForeignDecision | PerformEspionageDecision> | null {
  if (
    input.spyCount < 1 ||
    input.sabotageProgress !== 0 ||
    input.policy === "None"
  ) {
    return null;
  }
  const missionId = selectMission(input);
  if (missionId === null) return null;

  if (
    input.purchaseMoney > 0 &&
    input.purchaseForeign &&
    missionId === input.missionIds["Purchase"] &&
    input.spyCount < 3 &&
    !input.elusive
  ) {
    return null;
  }

  if (
    (input.annexed && input.policy !== "Annex") ||
    (input.purchased && input.policy !== "Purchase") ||
    (input.occupied && input.policy !== "Occupy")
  ) {
    return Object.freeze({
      kind: "release-foreign",
      foreignIndex: input.foreignIndex,
      governmentId: input.governmentId,
      expectedPolicy: input.policy,
    });
  }
  if (!input.annexed && !input.purchased && !input.occupied) {
    return Object.freeze({
      kind: "perform-espionage",
      foreignIndex: input.foreignIndex,
      governmentId: input.governmentId,
      missionId,
      secondaryTarget: !input.isPrimaryTarget,
    });
  }
  return null;
}
