import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planCapturedMechBuild } from "../domain/combat/captured-mech.ts";
import type {
  CapturedMechExecutor,
  CapturedMechReader,
} from "../ports/captured-mech.ts";

const CAPTURED_MECH_SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runCapturedMech(dependencies: {
  readonly reader: CapturedMechReader;
  readonly executor: CapturedMechExecutor;
}): CommandExecutionOutcome {
  const decision = planCapturedMechBuild(dependencies.reader.read());
  return decision === null
    ? CAPTURED_MECH_SUCCEEDED
    : dependencies.executor.execute(decision);
}
