import { createCustomRaceUI } from "../ui/custom-race-ui.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type Dependencies = Parameters<typeof createCustomRaceUI>[0];

interface CustomRaceUiControlDependencies extends Dependencies {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}

export function createCustomRaceUiControl({
  testSurface,
  setTestContext,
  ...dependencies
}: CustomRaceUiControlDependencies) {
  const customRaceUi = createCustomRaceUI(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      customRaceUI: {
        showCustomRaceImportStatus: customRaceUi.showCustomRaceImportStatus,
        getCustomRacePreset: customRaceUi.getCustomRacePreset,
        refreshCustomRacePresetSelectors:
          customRaceUi.refreshCustomRacePresetSelectors,
        buildCustomRacePresetEditor: customRaceUi.buildCustomRacePresetEditor,
        importCustomRaceIntoLab: customRaceUi.importCustomRaceIntoLab,
        automateLab: customRaceUi.automateLab,
      },
      setCustomRaceUITestContext: setTestContext,
    });
  return customRaceUi;
}
