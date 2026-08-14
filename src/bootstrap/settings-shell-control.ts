import { createSettingsShell } from "../ui/settings-shell.ts";

type Dependencies = Parameters<typeof createSettingsShell>[0];

export type SettingsShellControlDependencies = Dependencies;

export function createSettingsShellControl(
  dependencies: SettingsShellControlDependencies,
) {
  return createSettingsShell(dependencies);
}
