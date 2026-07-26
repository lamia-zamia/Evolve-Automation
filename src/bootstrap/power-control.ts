import { createPowerWarningSource } from "../adapters/browser/power-warnings.ts";
import { createPowerAdapter } from "../adapters/evolve/economy/production/power.ts";
import { createPowerAutomation } from "../application/power.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

// Composition seam for the power slice: owns the browser power-warning source and
// the Evolve power adapter, wiring the adapter's `readDebugEnabled` to the warning
// source (which also feeds the automation) — exactly as the runtime closure did.
export function createPowerControl(dependencies: {
  warnings: {
    getDocument: Parameters<typeof createPowerWarningSource>[0];
    getWindow: Parameters<typeof createPowerWarningSource>[1];
  };
  adapter: Omit<Parameters<typeof createPowerAdapter>[0], "readDebugEnabled">;
  diagnostics?: TickDiagnostics | undefined;
}) {
  const warnings = createPowerWarningSource(
    dependencies.warnings.getDocument,
    dependencies.warnings.getWindow,
  );
  const adapter = createPowerAdapter({
    ...dependencies.adapter,
    readDebugEnabled: () => warnings.readDebugEnabled(),
  });
  const automation = createPowerAutomation({
    reader: adapter.reader,
    executor: adapter.executor,
    warnings,
    diagnostics: dependencies.diagnostics,
  });
  return Object.freeze({ autoPower: () => automation.run() });
}
