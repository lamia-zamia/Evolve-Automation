/** The build identity and current order weight needed by production allocation. */
export interface GameBuildTarget {
  readonly key: string;
  readonly elementId: string;
  readonly weighting: number;
}
