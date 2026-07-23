import {
  createBattleAdapter,
  type BattleAdapterDependencies,
} from "../adapters/evolve/combat/battle.ts";
import { runBattleAutomation } from "../application/battle.ts";

// Composition seam for the battle slice: owns the Evolve battle adapter
// construction and returns the control entry the runtime places at its tick
// position.
export function createBattleControl(dependencies: BattleAdapterDependencies) {
  const adapter = createBattleAdapter(dependencies);
  return Object.freeze({ autoBattle: () => runBattleAutomation(adapter) });
}
