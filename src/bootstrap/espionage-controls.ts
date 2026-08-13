import { createMercenaryControl } from "./mercenary-control.ts";
import { createSpyControl } from "./spy-control.ts";

type MercenaryDependencies = Parameters<typeof createMercenaryControl>[0];
type SpyDependencies = Parameters<typeof createSpyControl>[0];

interface EspionageControlDependencies {
  readonly mercenary: MercenaryDependencies;
  readonly spy: SpyDependencies;
}

// Composition seam for mercenary and espionage automation. Their separate
// adapters retain manager and foreign-affairs effects while this seam returns
// the existing tick entries.
export function createEspionageControls({
  mercenary,
  spy,
}: EspionageControlDependencies) {
  const mercenaryControl = createMercenaryControl(mercenary);
  const spyControl = createSpyControl(spy);

  return Object.freeze({
    ...mercenaryControl,
    ...spyControl,
  });
}
