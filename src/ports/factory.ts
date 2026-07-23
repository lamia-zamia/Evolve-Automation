import type {
  FactoryInput,
  FactoryTooltip,
} from "../domain/economy/production/factory.ts";

export interface FactoryReader {
  read(): FactoryInput;
}

export interface FactoryTooltipPublisher {
  publish(tooltips: readonly Readonly<FactoryTooltip>[]): void;
}
