/** Starting points for the resource-sensitive Vacuum Collapse policies. */
export const DEFAULT_VACUUM_MANA_REQUIREMENT = 10;
export const DEFAULT_VACUUM_WEIGHTING_MULTIPLIER = 10;

export interface VacuumCollapseManaStageInput {
  readonly prestigeType: string;
  readonly manaRate: number;
  readonly requiredManaRate: number;
}

/**
 * Mana regeneration, rather than Syphon count, decides when the final-stage
 * policy becomes useful. Invalid or not-yet-initialized rates stay in the
 * production stage so a partially initialized game cannot trigger it early.
 */
export function isVacuumCollapseManaStageReady(
  input: Readonly<VacuumCollapseManaStageInput>,
): boolean {
  return (
    input.prestigeType === "vacuum" &&
    Number.isFinite(input.manaRate) &&
    Number.isFinite(input.requiredManaRate) &&
    input.manaRate >= input.requiredManaRate
  );
}
