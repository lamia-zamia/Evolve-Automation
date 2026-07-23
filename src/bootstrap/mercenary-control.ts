import {
  createMercenaryAdapter,
  type MercenaryAdapterDependencies,
} from "../adapters/evolve/combat/mercenary.ts";
import { runMercenaryAutomation } from "../application/mercenary.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";

export interface MercenaryControl {
  readonly autoMerc: () => CommandExecutionOutcome;
}

// Composition seam for the mercenary slice: it owns the Evolve mercenary
// adapter construction and hands back the control entry the runtime places at
// its tick position. The runtime passes the shared game-model accessors
// explicitly instead of the adapter reaching into the runtime closure.
export function createMercenaryControl(
  dependencies: MercenaryAdapterDependencies,
): MercenaryControl {
  const adapter = createMercenaryAdapter(dependencies);
  return Object.freeze({
    autoMerc: () => runMercenaryAutomation(adapter),
  });
}
