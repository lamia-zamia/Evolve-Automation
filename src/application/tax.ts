import { createCycleRunner, type CycleTrace } from "./cycle-runner.ts";
import type { AdjustTaxRateCommand } from "../domain/commands.ts";
import { planTax, type TaxSettings, type TaxSnapshot } from "../domain/tax.ts";
import type { Clock } from "../ports/clock.ts";
import type { GameCommandExecutor } from "../ports/game-command-executor.ts";
import type { GameReader } from "../ports/game-reader.ts";
import type { SettingsReader } from "../ports/settings-reader.ts";

export interface TaxAutomationDependencies {
  readonly clock: Clock;
  readonly gameReader: GameReader<TaxSnapshot>;
  readonly settingsReader: SettingsReader<TaxSettings>;
  readonly commandExecutor: GameCommandExecutor<AdjustTaxRateCommand>;
}

export interface TaxAutomation {
  readonly autoTax: () => void;
  readonly getLastTrace: () => CycleTrace<AdjustTaxRateCommand> | undefined;
}

export function createTaxAutomation({
  clock,
  gameReader,
  settingsReader,
  commandExecutor,
}: TaxAutomationDependencies): TaxAutomation {
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
