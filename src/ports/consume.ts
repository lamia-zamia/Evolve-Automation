import type { ConsumeInput } from "../domain/consume.ts";

export interface ConsumeReader {
  read(): ConsumeInput;
}
