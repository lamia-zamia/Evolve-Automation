import type { MutationInput } from "../domain/mutation.ts";

export interface MutationReader {
  read(): MutationInput;
}
