import type {
  BattleParameters,
  BattlefieldInput,
  BattleCycleInput,
  LaunchBattleDecision,
} from "../domain/battle.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface BattleReader {
  readCycle(): BattleCycleInput;
  readBattlefield(parameters: Readonly<BattleParameters>): BattlefieldInput;
}

export type BattleExecutor = DecisionExecutor<LaunchBattleDecision>;
