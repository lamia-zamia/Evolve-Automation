export interface OcularPowerSetting {
  readonly key: string;
  readonly id: string;
  readonly enabled: boolean;
  readonly priority: number;
}

export interface OcularPowerInput {
  readonly capacity: number;
  readonly powers: readonly OcularPowerSetting[];
}

export interface OcularPowerDecision {
  readonly key: string;
  readonly id: string;
  readonly enabled: boolean;
}

export function planOcularPowers(
  input: Readonly<OcularPowerInput>,
): readonly Readonly<OcularPowerDecision>[] {
  if (input.capacity < 1) return Object.freeze([]);

  let enabledCount = 0;
  return Object.freeze(
    [...input.powers]
      .sort((left, right) => right.priority - left.priority)
      .map((power) => {
        const enabled = power.enabled && enabledCount < input.capacity;
        if (enabled) enabledCount++;
        return Object.freeze({ key: power.key, id: power.id, enabled });
      }),
  );
}
