import { createForeignAffairsManagers } from "../game/foreign-affairs-managers.ts";

type Dependencies = Parameters<typeof createForeignAffairsManagers>[0];

// Composition seam for foreign-affairs manager construction. Spy and war
// managers remain named outputs because compatibility surfaces and controls
// consume them independently.
export function createForeignAffairsManagerControl(dependencies: Dependencies) {
  return createForeignAffairsManagers(dependencies);
}
