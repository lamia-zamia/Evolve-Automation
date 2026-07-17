import type { CommandExecutionOutcome } from "../domain/commands.ts";

export const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function rejected(
  code: string,
  message: string,
): CommandExecutionOutcome {
  return { status: "rejected", failure: { code, message } };
}

export function stale(
  code: string,
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): CommandExecutionOutcome {
  return context === undefined
    ? { status: "stale", failure: { code, message } }
    : { status: "stale", failure: { code, message, context } };
}
