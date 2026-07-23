import {
  createSmelterCommandExecutor,
  readSmelterInput,
} from "../adapters/evolve/economy/production/smelter.ts";
import { planSmelter } from "../domain/economy/production/smelter.ts";

// Composition seam for the smelter slice: owns the Evolve command executor and
// returns the control entry the runtime places at its tick position. The smelter
// decision carries tooltips the composition root writes into script state, so the
// closure supplies a narrow `publishTooltips` sink rather than the seam reaching
// into the retained game model. Tooltips are published before the command runs,
// exactly as the runtime closure did.
export function createSmelterControl(dependencies: {
  reader: Parameters<typeof readSmelterInput>[0];
  publishTooltips: (
    tooltips: ReturnType<typeof planSmelter>["tooltips"],
  ) => void;
}) {
  const executor = createSmelterCommandExecutor(
    dependencies.reader.getSmelterManager,
  );
  return Object.freeze({
    autoSmelter: () => {
      const decision = planSmelter(readSmelterInput(dependencies.reader));
      dependencies.publishTooltips(decision.tooltips);
      executor.execute(decision);
    },
  });
}
