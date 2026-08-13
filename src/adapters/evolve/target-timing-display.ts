import { calculateTargetTiming } from "../../domain/target-timing.ts";
import { readTargetTimingInput } from "./target-timing.ts";

interface TargetTimingDisplayDependencies {
  readonly getGame: () => unknown;
  readonly getTimeFormat: () => (seconds: number) => string;
  readonly isProject: (target: unknown) => boolean;
}

export interface TargetTimingDisplay {
  getMultiSegmentedTimeLeft(target: unknown): {
    resource: string;
    timeLeft: string;
  };
}

export function createTargetTimingDisplay({
  getGame,
  getTimeFormat,
  isProject,
}: TargetTimingDisplayDependencies): TargetTimingDisplay {
  function getMultiSegmentedTimeLeft(target: unknown) {
    const readResult = readTargetTimingInput(
      getGame(),
      target,
      isProject(target),
    );
    if (readResult.status === "unavailable") {
      return {
        resource: readResult.resourceId ?? "",
        timeLeft: "Never",
      };
    }

    const result = calculateTargetTiming(readResult.input);
    return {
      resource: result.resourceId,
      timeLeft:
        result.seconds === Infinity ? "Never" : getTimeFormat()(result.seconds),
    };
  }

  return { getMultiSegmentedTimeLeft };
}
