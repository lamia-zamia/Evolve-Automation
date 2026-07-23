/**
 * Pure equivalent of the legacy `autoShapeshift` decision. Returns the genus to
 * shift to, or null to leave the current shape. The composition root performs
 * the Vue `setShape` call.
 */

export interface ShapeshiftInput {
  readonly isShapeshifter: boolean;
  readonly shifterGenus: string;
  readonly currentGenus: string | null;
}

export function planShapeshift(
  input: Readonly<ShapeshiftInput>,
): string | null {
  if (
    !input.isShapeshifter ||
    input.shifterGenus === "ignore" ||
    input.currentGenus === input.shifterGenus
  ) {
    return null;
  }
  // TODO: Do not imitate own genus.
  return input.shifterGenus;
}
