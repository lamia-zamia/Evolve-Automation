import type { GameUiSurfacePort } from "../ports/game-ui-surface.ts";

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
};

export function createUIRefresh({
  getUiSurface,
  getActions,
  getPhases,
}: UIRefreshDependencies) {
  function updateUI() {
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
    const currentScrollPosition = uiSurface.readScrollTop();

    createOptionsModal();
    updateOptionsUI();
    updatePrestigeInTopBar();

    const { scriptNode, created } = ensureAutomationContainer();
    if (created) {
      resetScrollPositionRequired = true;
    }
    if (repairRuntimeAdapters(scriptNode)) {
      resetScrollPositionRequired = true;
    }

    updateSoulGemRate();
    renderPreviousGameStats();

    if (resetScrollPositionRequired) {
      // Leave the scroll position where it was before all our updates to the UI above
      uiSurface.resetScrollTop(currentScrollPosition);
    }

    updateTotalDaysInTopBar();
  }

  return { updateUI };
}
