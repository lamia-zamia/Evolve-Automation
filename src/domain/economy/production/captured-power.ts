/**
 * The bounded power slice that can be decided from DeadSpace's captured city state alone.
 *
 * A negative city surplus proves that another producer is useful, but the raw root does not carry
 * the powered draw of every consumer. This policy therefore only asks for more of the verified
 * city producer instances and never guesses which consumer should be shed.
 */

export interface CapturedPowerProducerInput {
  readonly id: string;
  readonly count: number;
  readonly on: number;
}

export interface CapturedPowerInput {
  readonly unlocked: boolean;
  readonly surplus: number;
  readonly producers: readonly Readonly<CapturedPowerProducerInput>[];
}

export interface CapturedPowerDecision {
  readonly producerId: string;
  readonly maximumOn: number;
}

export function planCapturedPowerProducers(
  input: Readonly<CapturedPowerInput>,
): readonly Readonly<CapturedPowerDecision>[] {
  if (!input.unlocked || input.surplus >= 0) return Object.freeze([]);
  return Object.freeze(
    input.producers.flatMap((producer) => {
      return producer.count > producer.on
        ? [
            Object.freeze({
              producerId: producer.id,
              maximumOn: producer.count,
            }),
          ]
        : [];
    }),
  );
}
