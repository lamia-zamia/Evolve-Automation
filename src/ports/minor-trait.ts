import type {
  GeneticsMinorTraitInput,
  MinorTraitCandidateInput,
  MinorTraitSummaryInput,
} from "../domain/traits/minor-trait.ts";

/** Two-phase reader for fixed totals followed by ordered live purchase views. */
export interface MinorTraitReader {
  readSummary(): MinorTraitSummaryInput;
  readCandidate(index: number): MinorTraitCandidateInput | null;
}

export interface GeneticsMinorTraitReader {
  read(): GeneticsMinorTraitInput;
}
