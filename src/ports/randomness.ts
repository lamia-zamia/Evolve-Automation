export interface RandomSource {
  /** Returns a value in the half-open interval [0, 1). */
  nextUnit(): number;
}
