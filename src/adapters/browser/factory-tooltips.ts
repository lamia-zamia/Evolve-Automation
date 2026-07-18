import type { FactoryTooltip } from "../../domain/factory.ts";
import type { FactoryTooltipPublisher } from "../../ports/factory.ts";

export function createFactoryTooltipPublisher(
  getState: () => unknown,
): FactoryTooltipPublisher {
  return Object.freeze({
    publish(tooltips: readonly Readonly<FactoryTooltip>[]): void {
      if (tooltips.length === 0) return;
      const state = getState();
      if (typeof state !== "object" || state === null) {
        throw new TypeError("state must be an object");
      }
      const values = Reflect.get(state, "tooltips");
      if (typeof values !== "object" || values === null) {
        throw new TypeError("state.tooltips must be an object");
      }
      for (const tooltip of tooltips) {
        Reflect.set(values, tooltip.key, tooltip.value);
      }
    },
  });
}
