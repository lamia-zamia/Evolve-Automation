import {
  createBrowserTaxControls,
  createKeyModifierController,
} from "../adapters/browser/tax-controls.ts";
import { createTaxCommandExecutor } from "../adapters/evolve/civic/tax-command-executor.ts";
import { createEvolveTaxReader } from "../adapters/evolve/civic/tax-reader.ts";
import { createTaxSettingsReader } from "../adapters/storage/tax-settings-reader.ts";
import { createTaxAutomation } from "../application/tax.ts";

// Composition seam for the tax slice: owns the browser tax controls (shared by the
// reader and command executor), the key-modifier controller, and the Evolve reader
// and command executor. The shared clock is built from the injected `nowMs`, and
// `resetKeyModifiers` supplies the key-reset the executor performs before commands —
// exactly as the runtime closure did.
export function createTaxControl(dependencies: {
  nowMs: () => number;
  getVueById: (id: string) => unknown;
  gameReader: Omit<
    Parameters<typeof createEvolveTaxReader>[0],
    "clock" | "controls"
  >;
  getSettings: Parameters<typeof createTaxSettingsReader>[0];
  commandExecutor: Omit<
    Parameters<typeof createTaxCommandExecutor>[0],
    "controls" | "keyModifiers"
  > & {
    resetKeyModifiers: () => void;
  };
}) {
  const clock = Object.freeze({ nowMs: dependencies.nowMs });
  const controls = createBrowserTaxControls(dependencies.getVueById);
  const { resetKeyModifiers, ...commandExecutorRest } =
    dependencies.commandExecutor;
  const { autoTax } = createTaxAutomation({
    clock,
    gameReader: createEvolveTaxReader({
      clock,
      controls,
      ...dependencies.gameReader,
    }),
    settingsReader: createTaxSettingsReader(dependencies.getSettings),
    commandExecutor: createTaxCommandExecutor({
      ...commandExecutorRest,
      controls,
      keyModifiers: createKeyModifierController(resetKeyModifiers),
    }),
  });
  return Object.freeze({ autoTax });
}
