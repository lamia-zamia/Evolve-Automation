import { createQueuePanels } from "../ui/queue-panels.ts";

type QueuePanelsDependencies = Parameters<typeof createQueuePanels>[0];

export function createQueuePanelsControl(
  dependencies: QueuePanelsDependencies,
) {
  return createQueuePanels(dependencies);
}
