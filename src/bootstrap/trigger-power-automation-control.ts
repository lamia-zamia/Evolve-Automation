import { createPowerStorageControls } from "./power-storage-controls.ts";
import { createTriggerControl } from "./trigger-control.ts";

type TriggerDependencies = Parameters<typeof createTriggerControl>[0];
type PowerStorageDependencies = Parameters<
  typeof createPowerStorageControls
>[0];

export interface TriggerPowerAutomationControlDependencies {
  trigger: TriggerDependencies;
  powerStorage: PowerStorageDependencies;
}

export function createTriggerPowerAutomationControl({
  trigger,
  powerStorage,
}: TriggerPowerAutomationControlDependencies) {
  return {
    ...createTriggerControl(trigger),
    ...createPowerStorageControls(powerStorage),
  };
}
