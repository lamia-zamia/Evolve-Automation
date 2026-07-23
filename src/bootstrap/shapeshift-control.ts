import { createShapeshiftControls } from "../adapters/browser/progression-controls.ts";
import {
  createShapeshiftCommandExecutor,
  readShapeshiftInput,
} from "../adapters/evolve/traits/shapeshift.ts";
import { planShapeshift } from "../domain/traits/shapeshift.ts";

// Composition seam for the shapeshift slice: owns the Evolve command executor and
// the browser shapeshift controls, returning the control entry the runtime places
// at its tick position.
export function createShapeshiftControl(dependencies: {
  reader: Parameters<typeof readShapeshiftInput>[0];
  executor: {
    getGame: () => unknown;
    getVueById: (id: string) => unknown;
  };
}) {
  const executor = createShapeshiftCommandExecutor({
    getGame: dependencies.executor.getGame,
    controls: createShapeshiftControls(dependencies.executor.getVueById),
  });
  return Object.freeze({
    autoShapeshift: () =>
      executor.execute(
        planShapeshift(readShapeshiftInput(dependencies.reader)),
      ),
  });
}
