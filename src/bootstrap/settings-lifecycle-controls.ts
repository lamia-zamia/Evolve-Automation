import { createSettingsMigrationRunner } from "../adapters/evolve/settings-migration-runner.ts";
import { createQueuedSettings } from "../settings/queued-settings.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type MigrationDependencies = Parameters<
  typeof createSettingsMigrationRunner
>[0];
type QueuedDependencies = Parameters<typeof createQueuedSettings>[0];

export function createSettingsMigrationControl({
  testSurface,
  ...dependencies
}: MigrationDependencies & {
  readonly testSurface: RuntimeTestSurface | undefined;
}) {
  const migration = createSettingsMigrationRunner(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      settingsMigration: migration,
    });
  return migration;
}

export function createQueuedSettingsControl({
  testSurface,
  setTestContext,
  ...dependencies
}: QueuedDependencies & {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}) {
  const queued = createQueuedSettings(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      loadQueuedSettings: queued.loadQueuedSettings,
      setQueuedSettingsTestContext: setTestContext,
    });
  return queued;
}
