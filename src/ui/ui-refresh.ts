type UIRefreshDocument = {
  hidden: boolean;
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
};

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
  getDocument: () => UIRefreshDocument;
  getActions: () => UIRefreshActions;
  getPhases: () => UIRefreshPhases;
};

export function createUIRefresh({
  getDocument,
  getActions,
  getPhases,
}: UIRefreshDependencies) {
  function updateUI() {
    const document = getDocument();
    // Don't touch DOM when the tab is in the background
    if (document.hidden) {
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
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

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
      document.documentElement.scrollTop = document.body.scrollTop =
        currentScrollPosition;
    }

    updateTotalDaysInTopBar();
  }

  return { updateUI };
}
