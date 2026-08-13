import { createTooltipUI } from "../ui/tooltips.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type Dependencies = Parameters<typeof createTooltipUI>[0];

interface TooltipUiControlDependencies extends Dependencies {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}

export function createTooltipUiControl({
  testSurface,
  setTestContext,
  ...dependencies
}: TooltipUiControlDependencies) {
  const tooltipUi = createTooltipUI(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      tooltipUI: tooltipUi,
      setTooltipUITestContext: setTestContext,
    });
  return tooltipUi;
}
