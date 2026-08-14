import { createScriptRuntimeUI } from "../ui/script-runtime.ts";

type Dependencies = Parameters<typeof createScriptRuntimeUI>[0];

export interface ScriptRuntimeUiControlDependencies {
  readonly getJQuery: Dependencies["getJQuery"];
  readonly getDocument: Dependencies["getDocument"];
  readonly getState: Dependencies["getState"];
  readonly getGame: Dependencies["getGame"];
  readonly getWin: Dependencies["getWin"];
  readonly getCreateOptionsModal: Dependencies["getCreateOptionsModal"];
  readonly getOpenOptionsModal: Dependencies["getOpenOptionsModal"];
  readonly getScriptVersionExtra: Dependencies["getScriptVersionExtra"];
  readonly getScriptVersion: Dependencies["getScriptVersion"];
}

export function createScriptRuntimeUiControl(
  dependencies: ScriptRuntimeUiControlDependencies,
) {
  return createScriptRuntimeUI(dependencies);
}
