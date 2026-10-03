import type { CapturedGameRead } from "./captured-game-mechanics.ts";

export interface GameSpaceRegionState {
  readonly zone: "inner" | "outer";
  readonly reachable: boolean;
  readonly syndicateEnabled: boolean;
}

export interface GameSpaceRegionMechanics {
  read(region: string): CapturedGameRead<GameSpaceRegionState>;
}
