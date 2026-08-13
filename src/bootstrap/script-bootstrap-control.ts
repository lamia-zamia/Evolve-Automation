import { createScriptBootstrap } from "../game/script-bootstrap.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type ScriptBootstrapDependencies = Parameters<typeof createScriptBootstrap>[0];

interface ScriptBootstrapControlDependencies extends ScriptBootstrapDependencies {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}

export function createScriptBootstrapControl({
  testSurface,
  setTestContext,
  ...dependencies
}: ScriptBootstrapControlDependencies) {
  const bootstrap = createScriptBootstrap(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      scriptBootstrap: {
        initialiseScript: bootstrap.initialiseScript,
        mainAutoEvolveScript: bootstrap.mainAutoEvolveScript,
      },
      setScriptBootstrapTestContext: setTestContext,
    });
  return bootstrap;
}
