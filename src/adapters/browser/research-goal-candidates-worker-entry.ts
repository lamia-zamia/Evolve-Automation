import { installResearchGoalCandidatesWorker } from "./research-goal-candidates-worker.ts";

interface ResearchCandidatesWorkerGlobal {
  addEventListener(
    type: "message",
    listener: (event: { readonly data: unknown }) => void,
  ): void;
  postMessage(message: unknown): void;
}

installResearchGoalCandidatesWorker(
  globalThis as unknown as ResearchCandidatesWorkerGlobal,
);
