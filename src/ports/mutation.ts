import type {
  GeneticsMutationInput,
  MutationInput,
} from "../domain/traits/mutation.ts";

export interface MutationReader {
  read(): MutationInput;
}

export interface GeneticsMutationReader {
  read(): GeneticsMutationInput;
}
