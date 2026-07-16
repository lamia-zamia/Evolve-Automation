import type {
  AutomationCommand,
  CommandEnvelope,
  CommandExecutionOutcome,
} from "../domain/commands.ts";

export interface GameCommandExecutor<
  TCommand extends AutomationCommand = AutomationCommand,
> {
  execute(envelope: CommandEnvelope<TCommand>): CommandExecutionOutcome;
}
