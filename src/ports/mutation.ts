import type { MutationInput } from "../domain/traits/mutation.ts";

export interface MutationReader {
  read(): MutationInput;
}
