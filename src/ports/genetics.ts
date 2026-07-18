import type { GeneticsInput, GeneticsToggle } from "../domain/genetics.ts";

export interface GeneticsGate {
  readonly unlocked: boolean;
}

export interface GeneticsReader {
  readGate(): GeneticsGate;
  readPlan(): GeneticsInput;
}

export interface GeneticsControls {
  capture(): boolean;
  toggle(toggle: GeneticsToggle): boolean;
  assemble(count: number): boolean;
}
