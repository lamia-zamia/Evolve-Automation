import type { Clock } from "../../ports/clock.ts";

export function createBrowserClock(): Clock {
  return Object.freeze({ nowMs: () => Date.now() });
}
