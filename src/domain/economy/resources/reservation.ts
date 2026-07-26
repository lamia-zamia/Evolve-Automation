/**
 * A reservation is normally a hard lower bound for a resource. It can be
 * treated as soft for a new spend only when the spend is already covered by
 * the current quantity and restoring the reserved spare amount would take
 * longer than this horizon at the observed production rate.
 */
export const DEFAULT_RESERVATION_HORIZON_SECONDS = 4 * 60 * 60;

export interface ReservedResourceInput {
  readonly current: number;
  readonly spare: number;
  /** Resource units produced per second. */
  readonly rate: number;
}

export function canSpendWithDistantReservation(
  resource: Readonly<ReservedResourceInput>,
  cost: number,
  horizonSeconds: number = DEFAULT_RESERVATION_HORIZON_SECONDS,
): boolean {
  if (cost <= 0 || resource.spare >= cost) return true;
  if (resource.current < cost || resource.rate <= 0) return false;

  const secondsToRestoreSpare = (cost - resource.spare) / resource.rate;
  return secondsToRestoreSpare > horizonSeconds;
}
