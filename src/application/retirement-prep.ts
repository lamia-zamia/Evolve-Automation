import type { RetirementShortfall } from "../domain/progression/prestige/retirement-prep.ts";

/** Renders one shortfall to its established user-facing progress string. */
export function formatRetirementShortfall(
  shortfall: Readonly<RetirementShortfall>,
  formatNumber: (value: number) => string | number,
): string {
  switch (shortfall.kind) {
    case "building":
      return `${shortfall.name} ${shortfall.current}/${shortfall.required}`;
    case "storage":
      return `${shortfall.resource} storage ${formatNumber(shortfall.current)}/${formatNumber(shortfall.required)}`;
    case "stockpile":
      return `${shortfall.resource} stockpile ${formatNumber(shortfall.current)}/${formatNumber(shortfall.required)}`;
  }
}

export function formatRetirementShortfalls(
  shortfalls: readonly Readonly<RetirementShortfall>[],
  formatNumber: (value: number) => string | number,
): string[] {
  return shortfalls.map((shortfall) =>
    formatRetirementShortfall(shortfall, formatNumber),
  );
}
