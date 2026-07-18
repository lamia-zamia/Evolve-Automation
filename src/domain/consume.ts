export interface ConsumeKeepRatioView {
  readonly storageRequired: number;
  readonly requestedQuantity: number;
  readonly maxQuantity: number;
  readonly isFood: boolean;
}

export interface ConsumeResourceView extends ConsumeKeepRatioView {
  readonly id: string;
  readonly enabled: boolean;
  readonly demanded: boolean;
  readonly isCraftable: boolean;
  readonly currentQuantity: number;
  readonly storageRatio: number;
  /** Raw manager result, sampled only when the craftable branch can use it. */
  readonly craftableMaximum: number | null;
  /** Raw manager results corresponding to `ratios`, or null when unused. */
  readonly ratioMaximums: readonly (number | null)[];
}

export interface ConsumeCurrentView {
  readonly id: string;
  readonly count: number;
}

export interface ConsumeInput {
  readonly initialised: boolean;
  readonly useful: boolean;
  readonly maximum: number;
  readonly storageShift: number;
  readonly hungryRace: boolean;
  readonly ratios: readonly number[];
  readonly resources: readonly ConsumeResourceView[];
  readonly current: readonly ConsumeCurrentView[];
}

export interface ConsumeAdjustment {
  readonly resourceId: string;
  readonly expectedCurrent: number;
  readonly delta: number;
}

export interface ConsumeDecision {
  readonly adjustments: readonly ConsumeAdjustment[];
}

/** Pure port of the legacy keep-ratio normalization. Null means skip excess. */
export function calculateConsumeKeepRatio(
  baseRatio: number,
  resource: Readonly<ConsumeKeepRatioView>,
  storageShift: number,
  hungryRace: boolean,
): number | null {
  let keepRatio = baseRatio;
  if (keepRatio === -1) {
    if (resource.storageRequired <= 1) {
      return null;
    }
    keepRatio = Math.max(
      keepRatio,
      (resource.storageRequired / resource.maxQuantity) * storageShift,
    );
  }
  if (resource.isFood && !hungryRace) {
    keepRatio = Math.max(keepRatio, 0.25);
  }
  return Math.max(
    keepRatio,
    (resource.requestedQuantity / resource.maxQuantity) * storageShift,
  );
}

export function planConsume(input: Readonly<ConsumeInput>): ConsumeDecision {
  if (!input.initialised) {
    return Object.freeze({ adjustments: Object.freeze([]) });
  }

  const consumeAdjustments: Record<string, number> = Object.fromEntries(
    input.resources.map((resource) => [resource.id, 0]),
  );

  if (input.useful) {
    let remaining = input.maximum;
    for (let ratioIndex = 0; ratioIndex < input.ratios.length; ratioIndex++) {
      const consumeRatio = input.ratios[ratioIndex];
      if (consumeRatio === undefined) {
        continue;
      }
      for (const resource of input.resources) {
        if (remaining <= 0) {
          break;
        }
        if (!resource.enabled || resource.demanded) {
          continue;
        }

        const keepRatio = calculateConsumeKeepRatio(
          consumeRatio,
          resource,
          input.storageShift,
          input.hungryRace,
        );
        if (keepRatio === null) {
          continue;
        }

        let allowedConsume = consumeAdjustments[resource.id] ?? 0;
        remaining += allowedConsume;

        if (resource.isCraftable) {
          if (
            resource.currentQuantity >
              resource.storageRequired * input.storageShift &&
            resource.craftableMaximum !== null
          ) {
            const maxConsume = Math.floor(resource.craftableMaximum);
            allowedConsume = Math.max(0, allowedConsume, maxConsume);
          }
        } else {
          const rawMaximum = resource.ratioMaximums[ratioIndex];
          if (
            resource.storageRatio > keepRatio + 0.01 &&
            rawMaximum !== null &&
            rawMaximum !== undefined
          ) {
            allowedConsume = Math.max(1, allowedConsume, Math.ceil(rawMaximum));
          } else if (
            resource.storageRatio > keepRatio &&
            rawMaximum !== null &&
            rawMaximum !== undefined
          ) {
            allowedConsume = Math.max(
              0,
              allowedConsume,
              Math.floor(rawMaximum),
            );
          } else if (
            resource.storageRatio >= 0.999 &&
            keepRatio >= 1 &&
            rawMaximum !== null &&
            rawMaximum !== undefined
          ) {
            allowedConsume = Math.max(
              0,
              allowedConsume,
              Math.floor(rawMaximum),
            );
          }
        }

        consumeAdjustments[resource.id] = Math.min(remaining, allowedConsume);
        remaining -= consumeAdjustments[resource.id] ?? 0;
      }
    }
  }

  const currentById = Object.fromEntries(
    input.current.map((entry) => [entry.id, entry.count]),
  );
  const adjustments = Object.keys(consumeAdjustments).map((resourceId) => {
    const expectedCurrent = currentById[resourceId] ?? 0;
    return Object.freeze({
      resourceId,
      expectedCurrent,
      delta: (consumeAdjustments[resourceId] ?? 0) - expectedCurrent,
    });
  });
  return Object.freeze({ adjustments: Object.freeze(adjustments) });
}
