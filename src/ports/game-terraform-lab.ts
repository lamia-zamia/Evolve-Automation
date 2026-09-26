import type { CelestialLabSession } from "./game-celestial-lab.ts";

export interface TerraformLabSnapshot {
  readonly session: CelestialLabSession;
  readonly canSubmit: boolean;
}

export type TerraformLabMutationResult =
  | { readonly status: "requested" }
  | {
      readonly status: "stale" | "unavailable" | "rejected";
      readonly reason: string;
    };

/** Narrow capability for DeadSpace's planet editor (`p`, `pEdit()`, `setPlanet()`). */
export interface GameTerraformLabPort {
  read(): TerraformLabSnapshot | undefined;
  submit(session: CelestialLabSession): TerraformLabMutationResult;
}
