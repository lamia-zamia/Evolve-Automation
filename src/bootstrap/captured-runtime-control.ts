import { createCapturedProgressionControl } from "./captured-progression-control.ts";
import { createGameDrawnActionsReader } from "../adapters/browser/game-drawn-actions.ts";
import { createGameDrawnProjectsReader } from "../adapters/browser/game-drawn-projects.ts";
import { createGamePanelWorkspace } from "../adapters/browser/game-panel-workspace.ts";
import type { PageCapture } from "../adapters/evolve/page-capture.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import { isRecord, readProperty } from "../adapters/validation.ts";

type WorkspaceDocument = ReturnType<
  Parameters<typeof createGamePanelWorkspace>[0]["getDocument"]
>;
type DrawnActionsDocument = ReturnType<
  Parameters<typeof createGameDrawnActionsReader>[0]["getDocument"]
>;
type DrawnProjectsDocument = ReturnType<
  Parameters<typeof createGameDrawnProjectsReader>[0]["getDocument"]
>;
type CapturedDocument = WorkspaceDocument &
  DrawnActionsDocument &
  DrawnProjectsDocument;

export interface CapturedRuntimeControlDependencies {
  readonly pageCapture: PageCapture;
  readonly document: CapturedDocument;
  readonly mouseEvent: new (type: "mouseover" | "mouseout") => unknown;
  readonly storage: unknown;
  readonly diagnostics?: TickDiagnostics | undefined;
  readonly logError?: (message: string) => void;
}

function readStoredSettings(storageValue: unknown): Record<string, unknown> {
  if (!isRecord(storageValue)) return {};
  const getItem = readProperty(storageValue, "getItem");
  if (typeof getItem !== "function") return {};
  const raw = Reflect.apply(getItem, storageValue, ["settings"]);
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const DEFAULT_SETTINGS: Readonly<Record<string, boolean>> = Object.freeze({
  masterScriptToggle: true,
  autoBuild: false,
  autoARPA: false,
  autoResearch: false,
});

function isEnabled(settings: Record<string, unknown>, key: string): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : (DEFAULT_SETTINGS[key] ?? false);
}

/** Starts the captured runtime from completed game periods, without a debug clone or game object. */
export function startCapturedRuntime({
  pageCapture,
  document,
  mouseEvent,
  storage,
  diagnostics,
  logError = () => {},
}: CapturedRuntimeControlDependencies): () => void {
  const progression = createCapturedProgressionControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    mountSuppression: pageCapture.mountSuppression,
    panels: createGamePanelWorkspace({ getDocument: () => document }),
    drawnActions: createGameDrawnActionsReader({
      getDocument: () => document,
    }),
    drawnProjects: createGameDrawnProjectsReader({
      getDocument: () => document,
      createMouseEvent: (type) => new mouseEvent(type),
    }),
    diagnostics,
  });

  const runCycle = () => {
    const settings = readStoredSettings(storage);
    if (
      !pageCapture.isComplete() ||
      !isEnabled(settings, "masterScriptToggle")
    ) {
      return;
    }
    try {
      if (isEnabled(settings, "autoBuild") || isEnabled(settings, "autoARPA")) {
        progression.runConstructionCycle();
      }
      if (isEnabled(settings, "autoResearch")) {
        progression.runResearchCycle();
      }
    } catch (error) {
      logError(String(error));
    }
  };

  return pageCapture.periods.subscribe(() => runCycle());
}
