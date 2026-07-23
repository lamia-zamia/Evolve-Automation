export interface RetirementThresholds {
  readonly fusionGenerators: number;
  readonly factories: number;
  readonly scienceLabs: number;
  readonly graphene: number;
}

export interface RetirementAssistInput {
  /** Whether the user enabled Retirement-challenge assistance. */
  readonly assistEnabled: boolean;
  /** Whether the current run is a True Path run. */
  readonly truepath: boolean;
  /** Whether the configured prestige type is Retirement. */
  readonly retirePrestige: boolean;
  /** Whether Isolation Protocol has been researched (ends preparation). */
  readonly isolationResearched: boolean;
}

interface RetirementBuilding {
  readonly name: string;
  readonly count: number;
}

export interface RetirementPreparationInput {
  readonly fusionGenerators: Readonly<RetirementBuilding>;
  readonly factories: Readonly<RetirementBuilding>;
  readonly scienceLabs: Readonly<RetirementBuilding>;
  readonly graphene: {
    readonly name: string;
    readonly currentQuantity: number;
    readonly maxQuantity: number;
  };
  readonly thresholds: Readonly<RetirementThresholds>;
}

export type RetirementShortfall =
  | {
      readonly kind: "building";
      readonly name: string;
      readonly current: number;
      readonly required: number;
    }
  | {
      readonly kind: "storage";
      readonly resource: string;
      readonly current: number;
      readonly required: number;
    }
  | {
      readonly kind: "stockpile";
      readonly resource: string;
      readonly current: number;
      readonly required: number;
    };

/** The run is a True Path Retirement attempt that has not yet been isolated. */
export function isRetirementAssistActive(
  input: Readonly<RetirementAssistInput>,
): boolean {
  return (
    input.assistEnabled &&
    input.truepath &&
    input.retirePrestige &&
    !input.isolationResearched
  );
}

/** Structured list of Tau infrastructure still short of the retirement plan. */
export function assessRetirementPreparation(
  input: Readonly<RetirementPreparationInput>,
): readonly RetirementShortfall[] {
  const { thresholds } = input;
  const missing: RetirementShortfall[] = [];

  if (input.fusionGenerators.count < thresholds.fusionGenerators) {
    missing.push({
      kind: "building",
      name: input.fusionGenerators.name,
      current: input.fusionGenerators.count,
      required: thresholds.fusionGenerators,
    });
  }
  if (input.factories.count < thresholds.factories) {
    missing.push({
      kind: "building",
      name: input.factories.name,
      current: input.factories.count,
      required: thresholds.factories,
    });
  }
  if (input.scienceLabs.count < thresholds.scienceLabs) {
    missing.push({
      kind: "building",
      name: input.scienceLabs.name,
      current: input.scienceLabs.count,
      required: thresholds.scienceLabs,
    });
  }
  if (input.graphene.maxQuantity < thresholds.graphene) {
    missing.push({
      kind: "storage",
      resource: input.graphene.name,
      current: input.graphene.maxQuantity,
      required: thresholds.graphene,
    });
  } else if (input.graphene.currentQuantity < thresholds.graphene) {
    missing.push({
      kind: "stockpile",
      resource: input.graphene.name,
      current: input.graphene.currentQuantity,
      required: thresholds.graphene,
    });
  }

  return missing;
}
