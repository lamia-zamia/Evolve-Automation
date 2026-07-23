export interface MechInfoInput {
  readonly size: string;
  readonly power: number;
  readonly efficiency: number;
  readonly bestPower: number;
  readonly collectorValue?: number;
}

export interface MechInfoItem {
  readonly text: string;
}

export type MechInfoNumberFormatter = (value: number) => string;

/** Format one immutable Mech lab read into the legacy note text. */
export function formatMechInfo(
  input: Readonly<MechInfoInput>,
  formatNumber: MechInfoNumberFormatter,
): string {
  const rating = input.power / input.bestPower;
  const ratingText = `${Math.round(rating * 100)}%`;
  if (input.size === "collector") {
    const collectorValue = input.collectorValue ?? 0;
    return `${ratingText}, ${formatNumber(input.power * collectorValue)} /s | `;
  }
  return `${ratingText}, ${formatNumber(input.power * 100)}, ${formatNumber(
    input.efficiency * 100,
  )} | `;
}
