import { createPrestigeLog } from "../observability/prestige-log.ts";
import { createPrestigeControl } from "./prestige-control.ts";

type PrestigeLogDependencies = Parameters<typeof createPrestigeLog>[0];
type PrestigeDependencies = Parameters<typeof createPrestigeControl>[0];
type PrestigeExecutorDependencies = PrestigeDependencies["executor"];

interface PrestigeAutomationControlDependencies {
  readonly log: PrestigeLogDependencies;
  readonly prestige: {
    readonly reader: PrestigeDependencies["reader"];
    readonly executor: Omit<PrestigeExecutorDependencies, "logPrestige">;
  };
}

// Composition seam for prestige logging and execution. Eligibility remains an
// explicit input to the prestige control, while both returned capabilities stay
// at their existing runtime tick and logging boundaries.
export function createPrestigeAutomationControls({
  log,
  prestige,
}: PrestigeAutomationControlDependencies) {
  const prestigeLog = createPrestigeLog(log);
  const prestigeControl = createPrestigeControl({
    reader: prestige.reader,
    executor: {
      ...prestige.executor,
      logPrestige: prestigeLog.logPrestige,
    },
  });

  return Object.freeze({
    ...prestigeLog,
    ...prestigeControl,
  });
}
