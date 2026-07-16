import {
  createCycleRunner,
  type CycleTrace,
} from "../application/cycle-runner.ts";
import {
  createBrowserTaxControls,
  createKeyModifierController,
} from "../adapters/browser/tax-controls.ts";
import { createTaxCommandExecutor } from "../adapters/evolve/tax-command-executor.ts";
import { createEvolveTaxReader } from "../adapters/evolve/tax-reader.ts";
import { createTaxSettingsReader } from "../adapters/storage/tax-settings-reader.ts";
import type { AdjustTaxRateCommand } from "../domain/commands.ts";
import { planTax } from "../domain/tax.ts";

export interface TaxAutomationDependencies {
  readonly getGame: () => unknown;
  readonly getPoly: () => unknown;
  readonly getResources: () => unknown;
  readonly getSettings: () => unknown;
  readonly getVueById: (id: string) => unknown;
  readonly clearKeyModifiers: () => void;
  readonly nowMs: () => number;
}

export function createTaxAutomation(dependencies: TaxAutomationDependencies): {
  readonly autoTax: () => void;
  readonly getLastTrace: () => CycleTrace<AdjustTaxRateCommand> | undefined;
} {
  const clock = Object.freeze({ nowMs: dependencies.nowMs });
  const controls = createBrowserTaxControls(dependencies.getVueById);
  const gameReader = createEvolveTaxReader({
    clock,
    controls,
    getGame: dependencies.getGame,
    getPoly: dependencies.getPoly,
    getResources: dependencies.getResources,
  });
  const settingsReader = createTaxSettingsReader(dependencies.getSettings);
  const commandExecutor = createTaxCommandExecutor({
    controls,
    keyModifiers: createKeyModifierController(dependencies.clearKeyModifiers),
    getGame: dependencies.getGame,
    getResources: dependencies.getResources,
  });
  let lastTrace: CycleTrace<AdjustTaxRateCommand> | undefined;
  const runner = createCycleRunner({
    clock,
    gameReader,
    settingsReader,
    commandExecutor,
    logger: { record: () => {} },
    publisher: {
      publish: (trace) => {
        lastTrace = trace;
      },
    },
    phases: [
      {
        name: "civic",
        planners: [{ name: "tax", plan: planTax }],
      },
    ],
    getConflictKey: () => "tax-rate",
    maxCommandsPerCycle: 1,
  });

  function autoTax(): void {
    lastTrace = runner.runCycle();
  }

  return Object.freeze({ autoTax, getLastTrace: () => lastTrace });
}
