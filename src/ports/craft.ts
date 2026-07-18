import type { CraftCandidateInput, CraftGateInput } from "../domain/craft.ts";

export interface CraftReader {
  readGate(): CraftGateInput;
  readCandidate(index: number): CraftCandidateInput | null;
}
