import type { EvolutionLogEvent } from "../domain/progression/evolution/evolution-result.ts";

export interface EvolutionLogMessage {
  readonly level: "danger" | "warning" | "info";
  readonly message: string;
  readonly tags: readonly string[];
}

const PROGRESS = ["progress"] as const;
const PROGRESS_ACHIEVEMENTS = ["progress", "achievements"] as const;

/** Renders a decision log event to its established message text and tags. */
export function formatEvolutionLog(
  event: Readonly<EvolutionLogEvent>,
  loc: (key: string) => string,
): EvolutionLogMessage {
  switch (event.code) {
    case "backup-no-achievements":
      return {
        level: "danger",
        message: `${event.raceName} have no unearned achievements for current prestige, soft resetting and trying again.`,
        tags: PROGRESS_ACHIEVEMENTS,
      };
    case "backup-no-race":
      return {
        level: "warning",
        message: `Can't pick a race with unearned achievements for current prestige. Continuing with ${event.raceName}.`,
        tags: PROGRESS_ACHIEVEMENTS,
      };
    case "wrong-race":
      return {
        level: "danger",
        message: "Wrong race, soft resetting and trying again.",
        tags: PROGRESS,
      };
    case "gained-trait":
      return {
        level: "danger",
        message: `Gained ${event.traitName} trait, soft resetting and trying again.`,
        tags: PROGRESS,
      };
    case "auto-goals":
      return {
        level: "info",
        message: `Auto Achievement goes for: ${event.goals.map((goal) => loc(goal)).join(", ")}.`,
        tags: PROGRESS_ACHIEVEMENTS,
      };
    case "auto-goals-none":
      return {
        level: "info",
        message: "Auto Achievement can't pick a goal for this run.",
        tags: PROGRESS_ACHIEVEMENTS,
      };
  }
}
