import {
  describeOverrideFailure,
  type OverrideConditionFailure,
} from "../../domain/override-resolution.ts";
import type { OverrideFailureReporter } from "../../ports/override-settings.ts";

interface WindowManagerContract {
  isOpen: () => boolean;
}

interface GameLogContract {
  logDanger: (kind: string, message: string, categories: string[]) => void;
}

/** The one game read this adapter makes: the messages already on screen, used to avoid log spam. */
interface RecentMessagesContract {
  global: { lastMsg: { all: Record<string, { m?: unknown }> } };
}

export interface OverrideFailureReporterDependencies {
  getWindowManager: () => WindowManagerContract;
  getGame: () => RecentMessagesContract;
  getGameLog: () => GameLogContract;
}

export function createOverrideFailureReporter({
  getWindowManager,
  getGame,
  getGameLog,
}: OverrideFailureReporterDependencies): OverrideFailureReporter {
  return {
    report(failures: readonly OverrideConditionFailure[]): void {
      if (failures.length === 0 || getWindowManager().isOpen()) {
        return;
      }
      const gameLog = getGameLog();
      // Every message names its setting and condition number, so one pass cannot repeat itself; only
      // messages left over from an earlier pass need suppressing.
      const shown = Object.values(getGame().global.lastMsg.all);
      for (const failure of failures) {
        const message = describeOverrideFailure(failure);
        if (!shown.some((entry) => entry.m === message)) {
          gameLog.logDanger("special", message, ["events", "major_events"]);
        }
      }
    },
  };
}
