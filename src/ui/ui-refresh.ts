import type { GameUiSurfacePort } from "../ports/game-ui-surface.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import { createPhaseMeasure } from "../utils/performance.ts";

type UIRefreshActions = {
  createOptionsModal: () => void;
  updateOptionsUI: () => void;
  updatePrestigeInTopBar: () => void;
  updateTotalDaysInTopBar: () => void;
};

type UIRefreshPhases = {
  ensureAutomationContainer: () => { scriptNode: unknown; created: boolean };
  repairRuntimeAdapters: (scriptNode: unknown) => boolean;
  updateSoulGemRate: () => void;
  renderPreviousGameStats: () => void;
};

type UIRefreshDependencies = {
  getUiSurface: () => GameUiSurfacePort;
  getActions: () => UIRefreshActions;
  getPhases: () => UIRefreshPhases;
  diagnostics?: TickDiagnostics | undefined;
};

export function createUIRefresh({
  getUiSurface,
  getActions,
  getPhases,
  diagnostics,
}: UIRefreshDependencies) {
  function updateUI() {
    const measure = createPhaseMeasure(diagnostics);
    const uiSurface = getUiSurface();
    // Don't touch DOM when the tab is in the background
    if (!uiSurface.isPageVisible()) {
      return;
    }

    const {
      createOptionsModal,
      updateOptionsUI,
      updatePrestigeInTopBar,
      updateTotalDaysInTopBar,
    } = getActions();
    const {
      ensureAutomationContainer,
      repairRuntimeAdapters,
      updateSoulGemRate,
      renderPreviousGameStats,
    } = getPhases();

    let resetScrollPositionRequired = false;
    const currentScrollPosition = measure("updateUI.readScrollTop", () =>
      uiSurface.readScrollTop(),
    );

    measure("updateUI.createOptionsModal", () => createOptionsModal());
    measure("updateUI.updateOptionsUI", () => updateOptionsUI());
    measure("updateUI.updatePrestigeInTopBar", () => updatePrestigeInTopBar());

    const { scriptNode, created } = measure(
      "updateUI.ensureAutomationContainer",
      () => ensureAutomationContainer(),
    );
    if (created) {
      resetScrollPositionRequired = true;
    }
    if (
      measure("updateUI.repairRuntimeAdapters", () =>
        repairRuntimeAdapters(scriptNode),
      )
    ) {
      resetScrollPositionRequired = true;
    }

    measure("updateUI.updateSoulGemRate", () => updateSoulGemRate());
    measure("updateUI.renderPreviousGameStats", () =>
      renderPreviousGameStats(),
    );

    if (resetScrollPositionRequired) {
      // Leave the scroll position where it was before all our updates to the UI above
      uiSurface.resetScrollTop(currentScrollPosition);
    }

    measure("updateUI.updateTotalDaysInTopBar", () =>
      updateTotalDaysInTopBar(),
    );
  }

  return { updateUI };
}
