import type {
  PsychicDecision,
  PsychicInput,
} from "../domain/traits/psychic.ts";

export interface PsychicGate {
  readonly unlocked: boolean;
}

export interface PsychicReader {
  readGate(): PsychicGate;
  readPlan(): PsychicInput;
}

export interface PsychicControls {
  activate(decision: Readonly<PsychicDecision>): boolean;
}
