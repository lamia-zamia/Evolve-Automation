import type { RandomSource } from "../../ports/randomness.ts";

export function createBrowserRandomSource(): RandomSource {
  return Object.freeze({ nextUnit: () => Math.random() });
}
