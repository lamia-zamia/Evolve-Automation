import type { OverrideEffectiveValueDisplay } from "../../ports/override-settings.ts";

/** The override editor's read-only "current value" field, refreshed only while it is on screen. */
const EFFECTIVE_VALUE_SELECTOR = "#script_override_true_value:visible";

export interface OverrideEffectiveValueDisplayDependencies {
  getJQuery: () => (selector: string) => { length: number };
  changeDisplayInputNode: (node: unknown) => void;
}

export function createOverrideEffectiveValueDisplay({
  getJQuery,
  changeDisplayInputNode,
}: OverrideEffectiveValueDisplayDependencies): OverrideEffectiveValueDisplay {
  return {
    publish(): void {
      const currentNode = getJQuery()(EFFECTIVE_VALUE_SELECTOR);
      if (currentNode.length !== 0) {
        changeDisplayInputNode(currentNode);
      }
    },
  };
}
