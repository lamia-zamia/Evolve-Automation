/**
 * Pure equivalent of the legacy `autoUniverseSelection` decision. Returns the
 * universe target name to select, or null when no selection should be made. The
 * composition root resolves and clicks the corresponding DOM element.
 */

export interface UniverseSelectionInput {
  readonly hasBigbang: boolean;
  readonly universe: string | null;
  readonly targetName: string;
}

export function planUniverseSelection(
  input: Readonly<UniverseSelectionInput>,
): string | null {
  if (
    !input.hasBigbang ||
    input.universe !== "bigbang" ||
    input.targetName === "none"
  ) {
    return null;
  }
  return input.targetName;
}
