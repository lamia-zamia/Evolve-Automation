/**
 * Narrow capability for suppressing the game's per-period deep clone of its own state on the
 * periods the script does not work. The clone is what wakes the script, so gating it also owns the
 * script's cadence: while the gate is installed the tick must not apply its own throttle as well.
 */
export interface PeriodGate {
  /**
   * Installs, retunes, or removes the gate. `rate` is game periods per working period; a rate below
   * 2, or a live game surface the gate cannot reach, removes it. Returns whether the gate is
   * installed and therefore owns throttling.
   */
  sync(rate: number): boolean;
}
