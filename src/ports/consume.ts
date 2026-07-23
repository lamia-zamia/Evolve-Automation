import type { ConsumeInput } from "../domain/economy/resources/consume.ts";

export interface ConsumeReader {
  read(): ConsumeInput;
}
