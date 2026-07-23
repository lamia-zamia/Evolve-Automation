export type WishTier = "minor" | "major";

export interface WishInput {
  readonly unlocked: boolean;
  readonly technologyLevel: number;
  readonly minorRemaining: number;
  readonly majorRemaining: number;
  readonly minorSelection: string;
  readonly majorSelection: string;
}

export interface WishSelectionDecision {
  readonly tier: WishTier;
  readonly wishId: string;
  readonly expectedRemaining: 0;
}

export function planWishes(
  input: Readonly<WishInput>,
): readonly Readonly<WishSelectionDecision>[] {
  if (!input.unlocked) return Object.freeze([]);

  const decisions: WishSelectionDecision[] = [];
  if (input.minorRemaining === 0 && input.minorSelection !== "none") {
    decisions.push(
      Object.freeze({
        tier: "minor",
        wishId: input.minorSelection,
        expectedRemaining: 0,
      }),
    );
  }
  if (
    input.technologyLevel >= 2 &&
    input.majorRemaining === 0 &&
    input.majorSelection !== "none"
  ) {
    decisions.push(
      Object.freeze({
        tier: "major",
        wishId: input.majorSelection,
        expectedRemaining: 0,
      }),
    );
  }
  return Object.freeze(decisions);
}
