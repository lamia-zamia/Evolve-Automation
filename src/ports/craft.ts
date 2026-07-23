import type {
  CraftCandidateInput,
  CraftGateInput,
} from "../domain/economy/production/craft.ts";

export interface CraftReader {
  readGate(): CraftGateInput;
  readCandidate(index: number): CraftCandidateInput | null;
}
