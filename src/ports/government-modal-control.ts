import type { CommandExecutionOutcome } from "../domain/commands.ts";

/** Native Government modal lifecycle used to reach the game's own `govModal.setGov`. */
export interface GovernmentModalControl {
  apply(government: string, sampledRoot: unknown): CommandExecutionOutcome;
  cancel(): void;
  dispose(): void;
}
