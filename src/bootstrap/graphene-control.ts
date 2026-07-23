import {
  createGrapheneCommandExecutor,
  readGrapheneInput,
} from "../adapters/evolve/economy/production/graphene.ts";
import { planGraphene } from "../domain/economy/production/graphene.ts";

// Composition seam for the graphene-plant slice: owns the Evolve command
// executor and returns the control entry the runtime places at its tick
// position.
export function createGrapheneControl(
  dependencies: Parameters<typeof readGrapheneInput>[0],
) {
  const executor = createGrapheneCommandExecutor(
    dependencies.getGrapheneManager,
  );
  return Object.freeze({
    autoGraphenePlant: () =>
      executor.execute(planGraphene(readGrapheneInput(dependencies))),
  });
}
