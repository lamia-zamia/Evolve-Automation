import {
  automationCycleId,
  commandId,
  type AutomationCycleId,
} from "../domain/identifiers.ts";
import type {
  AutomationCommand,
  CommandEnvelope,
  CommandExecutionOutcome,
  CommandResult,
} from "../domain/commands.ts";
import type { GameSnapshot } from "../domain/snapshot.ts";
import type { Clock } from "../ports/clock.ts";
import type { GameCommandExecutor } from "../ports/game-command-executor.ts";
import type { GameReader } from "../ports/game-reader.ts";
import type { Logger } from "../ports/logger.ts";
import type { Publisher } from "../ports/publisher.ts";
import type { SettingsReader } from "../ports/settings-reader.ts";

export type Planner<
  TSnapshot extends GameSnapshot,
  TSettings,
  TCommand extends AutomationCommand,
> = (
  snapshot: Readonly<TSnapshot>,
  settings: Readonly<TSettings>,
) => readonly TCommand[];

export interface NamedPlanner<
  TSnapshot extends GameSnapshot,
  TSettings,
  TCommand extends AutomationCommand,
> {
  readonly name: string;
  readonly plan: Planner<TSnapshot, TSettings, TCommand>;
}

export interface ApplicationPhase<
  TSnapshot extends GameSnapshot,
  TSettings,
  TCommand extends AutomationCommand,
> {
  readonly name: string;
  readonly planners: readonly NamedPlanner<TSnapshot, TSettings, TCommand>[];
}

export interface PhaseTrace {
  readonly phase: string;
  readonly planners: readonly {
    readonly planner: string;
    readonly commandCount: number;
  }[];
}

export interface CycleTrace<TCommand extends AutomationCommand> {
  readonly cycleId: AutomationCycleId;
  readonly snapshotId: GameSnapshot["metadata"]["id"];
  readonly startedAtMs: number;
  readonly completedAtMs: number;
  readonly phases: readonly PhaseTrace[];
  readonly results: readonly CommandResult<TCommand>[];
}

export type CycleEvent<TCommand extends AutomationCommand> =
  | {
      readonly kind: "cycle-started";
      readonly cycleId: AutomationCycleId;
      readonly snapshotId: GameSnapshot["metadata"]["id"];
    }
  | {
      readonly kind: "command-completed";
      readonly cycleId: AutomationCycleId;
      readonly result: CommandResult<TCommand>;
    }
  | {
      readonly kind: "cycle-completed";
      readonly trace: CycleTrace<TCommand>;
    };

export interface CycleRunnerDependencies<
  TSnapshot extends GameSnapshot,
  TSettings,
  TCommand extends AutomationCommand,
> {
  readonly clock: Clock;
  readonly gameReader: GameReader<TSnapshot>;
  readonly settingsReader: SettingsReader<TSettings>;
  readonly commandExecutor: GameCommandExecutor<TCommand>;
  readonly logger: Logger<CycleEvent<TCommand>>;
  readonly publisher: Publisher<CycleTrace<TCommand>>;
  readonly phases: readonly ApplicationPhase<TSnapshot, TSettings, TCommand>[];
  readonly getConflictKey: (command: TCommand) => string | null;
  readonly maxCommandsPerCycle: number;
}

function validateMaximum(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("maxCommandsPerCycle must be a non-negative integer");
  }
}

function executorFailure(error: unknown): CommandExecutionOutcome {
  return {
    status: "rejected",
    failure: {
      code: "executor-error",
      message:
        error instanceof Error ? error.message : "command executor failed",
    },
  };
}

export function createCycleRunner<
  TSnapshot extends GameSnapshot,
  TSettings,
  TCommand extends AutomationCommand,
>(
  dependencies: CycleRunnerDependencies<TSnapshot, TSettings, TCommand>,
): { runCycle(): CycleTrace<TCommand> } {
  validateMaximum(dependencies.maxCommandsPerCycle);
  let cycleSequence = 0;

  function runCycle(): CycleTrace<TCommand> {
    cycleSequence += 1;
    const cycleId = automationCycleId(`cycle-${cycleSequence}`);
    const startedAtMs = dependencies.clock.nowMs();
    const snapshot = dependencies.gameReader.readSnapshot();
    const settings = dependencies.settingsReader.readSettings();
    dependencies.logger.record({
      kind: "cycle-started",
      cycleId,
      snapshotId: snapshot.metadata.id,
    });

    const planned: TCommand[] = [];
    const phaseTraces: PhaseTrace[] = [];
    for (const phase of dependencies.phases) {
      const plannerTraces: PhaseTrace["planners"][number][] = [];
      for (const planner of phase.planners) {
        const commands = planner.plan(snapshot, settings);
        plannerTraces.push({
          planner: planner.name,
          commandCount: commands.length,
        });
        planned.push(...commands);
      }
      phaseTraces.push({ phase: phase.name, planners: plannerTraces });
    }

    const conflictKeys = new Set<string>();
    const results: CommandResult<TCommand>[] = [];
    planned.forEach((command, index) => {
      const envelope: CommandEnvelope<TCommand> = {
        id: commandId(`${cycleId}:command-${index + 1}`),
        expectedSnapshotId: snapshot.metadata.id,
        command,
      };

      let outcome: CommandExecutionOutcome;
      if (index >= dependencies.maxCommandsPerCycle) {
        outcome = {
          status: "rejected",
          failure: {
            code: "command-limit",
            message: "cycle command limit reached",
            context: {
              commandIndex: index,
              maximum: dependencies.maxCommandsPerCycle,
            },
          },
        };
      } else {
        const conflictKey = dependencies.getConflictKey(command);
        if (conflictKey !== null && conflictKeys.has(conflictKey)) {
          outcome = {
            status: "rejected",
            failure: {
              code: "command-conflict",
              message: `conflict on ${conflictKey}`,
              context: { conflictKey },
            },
          };
        } else {
          if (conflictKey !== null) {
            conflictKeys.add(conflictKey);
          }
          try {
            outcome = dependencies.commandExecutor.execute(envelope);
          } catch (error: unknown) {
            outcome = executorFailure(error);
          }
        }
      }

      const result: CommandResult<TCommand> = {
        ...outcome,
        envelope,
        completedAtMs: dependencies.clock.nowMs(),
      };
      results.push(result);
      dependencies.logger.record({
        kind: "command-completed",
        cycleId,
        result,
      });
    });

    const trace: CycleTrace<TCommand> = {
      cycleId,
      snapshotId: snapshot.metadata.id,
      startedAtMs,
      completedAtMs: dependencies.clock.nowMs(),
      phases: phaseTraces,
      results,
    };
    dependencies.publisher.publish(trace);
    dependencies.logger.record({ kind: "cycle-completed", trace });
    return trace;
  }

  return { runCycle };
}
