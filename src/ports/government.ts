import type { GovernmentInput } from "../domain/civic/government.ts";

export interface GovernmentReader {
  read(): GovernmentInput;
}
