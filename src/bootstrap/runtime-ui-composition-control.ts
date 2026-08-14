import { createAutomationContainer } from "../ui/automation-container.ts";
import { createPreviousGameStats } from "../ui/previous-game-stats.ts";
import { createRuntimeAdapters } from "../ui/runtime-adapters.ts";
import { createSoulGemRateDisplay } from "../ui/soul-gem-rate.ts";
import { createUIRefresh } from "../ui/ui-refresh.ts";

type SoulGemRateDependencies = Parameters<typeof createSoulGemRateDisplay>[0];
type PreviousStatsDependencies = Parameters<typeof createPreviousGameStats>[0];
type RuntimeAdapterDependencies = Parameters<typeof createRuntimeAdapters>[0];
type AutomationContainerDependencies = Parameters<
  typeof createAutomationContainer
>[0];
type UiRefreshDependencies = Parameters<typeof createUIRefresh>[0];

export interface RuntimeUiCompositionControlDependencies {
  soulGemRate: SoulGemRateDependencies;
  previousStats: PreviousStatsDependencies;
  runtimeAdapters: RuntimeAdapterDependencies;
  automationContainer: AutomationContainerDependencies;
  uiRefresh: Omit<UiRefreshDependencies, "getPhases">;
}

export function createRuntimeUiCompositionControl({
  soulGemRate,
  previousStats,
  runtimeAdapters,
  automationContainer,
  uiRefresh,
}: RuntimeUiCompositionControlDependencies) {
  const { updateSoulGemRate } = createSoulGemRateDisplay(soulGemRate);
  const { renderPreviousGameStats } = createPreviousGameStats(previousStats);
  const { repairRuntimeAdapters } = createRuntimeAdapters(runtimeAdapters);
  const { ensureAutomationContainer } =
    createAutomationContainer(automationContainer);
  const { updateUI } = createUIRefresh({
    ...uiRefresh,
    getPhases: () => ({
      ensureAutomationContainer,
      repairRuntimeAdapters: (scriptNode) =>
        repairRuntimeAdapters(
          scriptNode as Parameters<typeof repairRuntimeAdapters>[0],
        ),
      updateSoulGemRate,
      renderPreviousGameStats,
    }),
  });
  return {
    updateSoulGemRate,
    renderPreviousGameStats,
    repairRuntimeAdapters,
    ensureAutomationContainer,
    updateUI,
  };
}
