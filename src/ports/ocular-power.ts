import type { OcularPowerInput } from "../domain/ocular-power.ts";

export interface OcularPowerGate {
  readonly unlocked: boolean;
}

export interface OcularPowerReader {
  readGate(): OcularPowerGate;
  readPlan(): OcularPowerInput;
}

export interface OcularPowerControls {
  capture(): boolean;
  current(key: string): boolean | null;
  toggle(powerId: string): boolean;
}
