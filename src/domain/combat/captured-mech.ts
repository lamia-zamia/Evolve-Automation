/** Pure policy for the captured current-design mech-build slice. */

export interface CapturedMechBuildInput {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly buildMode: string;
  /** The page's queue-key setting changes `build()` into queue admission. */
  readonly queueKeyEnabled: boolean;
  readonly infernal: boolean;
  readonly designSize: string;
  /** Values returned by the game's captured `bay`, `price`, and `soul` methods. */
  readonly designSpace: number;
  readonly designSupply: number;
  readonly designSoul: number;
  readonly baySpace: number;
  readonly purifierSupply: number;
  readonly soulGems: number;
}

export interface CapturedMechBuildDecision {
  readonly kind: "build-captured-mech";
  readonly designSize: string;
  readonly expectedBaySpace: number;
  readonly expectedPurifierSupply: number;
  readonly expectedSoulGems: number;
}

export function planCapturedMechBuild(
  input: Readonly<CapturedMechBuildInput>,
): Readonly<CapturedMechBuildDecision> | null {
  if (
    !input.available ||
    !input.enabled ||
    input.buildMode !== "user" ||
    input.queueKeyEnabled ||
    input.infernal ||
    input.designSize.length === 0 ||
    !Number.isFinite(input.designSpace) ||
    input.designSpace <= 0 ||
    !Number.isFinite(input.designSupply) ||
    input.designSupply < 0 ||
    !Number.isFinite(input.designSoul) ||
    input.designSoul < 0 ||
    !Number.isFinite(input.baySpace) ||
    input.baySpace < input.designSpace ||
    !Number.isFinite(input.purifierSupply) ||
    input.purifierSupply < input.designSupply ||
    !Number.isFinite(input.soulGems) ||
    input.soulGems < input.designSoul
  ) {
    return null;
  }
  return Object.freeze({
    kind: "build-captured-mech" as const,
    designSize: input.designSize,
    expectedBaySpace: input.baySpace,
    expectedPurifierSupply: input.purifierSupply,
    expectedSoulGems: input.soulGems,
  });
}
