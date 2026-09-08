import { createCapturedTaxAutomation } from "../adapters/evolve/civic/captured-tax.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";

export function createCapturedTaxControl(dependencies: {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly nowMs: () => number;
}) {
  const automation = createCapturedTaxAutomation(dependencies);
  return Object.freeze({
    autoTax: automation.runCycle,
  });
}
