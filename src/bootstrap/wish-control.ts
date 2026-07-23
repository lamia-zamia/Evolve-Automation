import {
  createWishControls,
  type WishControlsDependencies,
} from "../adapters/browser/wish-controls.ts";
import {
  createWishCommandExecutor,
  createWishReader,
  type WishReaderDependencies,
} from "../adapters/evolve/traits/wish.ts";
import { runWishAutomation } from "../application/wish.ts";

// Composition seam for the wish slice: owns the Evolve reader/executor and the
// browser wish controls (built once, as the runtime closure did), returning the
// control entry the runtime places at its tick position.
export function createWishControl(dependencies: {
  reader: WishReaderDependencies;
  executor: {
    getGame: () => unknown;
    controls: WishControlsDependencies;
  };
}) {
  const reader = createWishReader(dependencies.reader);
  const executor = createWishCommandExecutor({
    getGame: dependencies.executor.getGame,
    controls: createWishControls(dependencies.executor.controls),
  });
  return Object.freeze({
    autoWish: () => runWishAutomation({ reader, executor }),
  });
}
