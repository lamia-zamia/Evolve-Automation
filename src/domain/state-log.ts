import type { ResourceView } from "./game-world.ts";

export const STATE_LOG_SCHEMA_VERSION = 3;
export const STATE_LOG_SAMPLE_LIMIT = 20_000;
export const STATE_LOG_PERSIST_INTERVAL = 25;
export const DEFAULT_STATE_LOG_INTERVAL = 20;

export interface StateLogResource {
  readonly present: boolean;
  readonly unlocked: boolean;
  readonly amount: number;
  readonly max: number;
  readonly rateOfChange: number;
  readonly storageRatio: number;
}

export interface StateLogConstructionTarget {
  readonly key: string;
  readonly family: string;
  readonly blocker: string;
  readonly resourceId?: string;
  readonly timeSeconds?: number;
}

export interface StateLogConstruction {
  readonly cycleId: number;
  readonly detailLevel: "targets" | "planner";
  readonly target?: Readonly<StateLogConstructionTarget>;
}

export interface StateLogSample {
  readonly tick: number;
  readonly day: number;
  readonly resources: Readonly<{
    Money: Readonly<StateLogResource>;
    Knowledge: Readonly<StateLogResource>;
  }>;
  readonly construction?: Readonly<StateLogConstruction>;
}

export interface StateLogRecord {
  readonly version: typeof STATE_LOG_SCHEMA_VERSION;
  readonly reset: number;
  readonly startDay: number;
  readonly species: string;
  /** Total samples recorded in this run, including entries evicted by the sample limit. */
  readonly sampleCount: number;
  readonly samples: readonly Readonly<StateLogSample>[];
}

export interface StateLogObservation extends StateLogSample {
  readonly reset: number;
  readonly species: string;
}

function freezeStateLogResource(
  view: Readonly<ResourceView>,
): StateLogResource {
  return Object.freeze({
    present: view.present,
    unlocked: view.unlocked,
    amount: view.amount,
    max: view.max,
    rateOfChange: view.rateOfChange,
    storageRatio: view.storageRatio,
  });
}

export function normalizeStateLogInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT_STATE_LOG_INTERVAL;
  }
  const interval = Math.floor(value);
  return Number.isSafeInteger(interval) ? interval : DEFAULT_STATE_LOG_INTERVAL;
}

function freezeStateLogSample(
  observation: Readonly<StateLogSample>,
): Readonly<StateLogSample> {
  return Object.freeze({
    tick: observation.tick,
    day: observation.day,
    resources: Object.freeze({
      Money: freezeStateLogResource(observation.resources.Money),
      Knowledge: freezeStateLogResource(observation.resources.Knowledge),
    }),
    ...(observation.construction === undefined
      ? {}
      : {
          construction: Object.freeze({
            ...observation.construction,
            ...(observation.construction.target === undefined
              ? {}
              : {
                  target: Object.freeze({
                    ...observation.construction.target,
                  }),
                }),
          }),
        }),
  });
}

export function freezeStateLogObservation(
  observation: Readonly<StateLogObservation>,
): Readonly<StateLogObservation> {
  return Object.freeze({
    reset: observation.reset,
    species: observation.species,
    ...freezeStateLogSample(observation),
  });
}

export function createStateLogRecord(
  observation: Readonly<StateLogObservation>,
): Readonly<StateLogRecord> {
  const sample = freezeStateLogSample(observation);
  return Object.freeze({
    version: STATE_LOG_SCHEMA_VERSION,
    reset: observation.reset,
    startDay: sample.day,
    species: observation.species,
    sampleCount: 1,
    samples: Object.freeze([sample]),
  });
}

export function appendStateLogRecord(
  current: Readonly<StateLogRecord>,
  observation: Readonly<StateLogObservation>,
): Readonly<StateLogRecord> {
  const sample = freezeStateLogSample(observation);
  const samples = [...current.samples, sample];
  if (samples.length > STATE_LOG_SAMPLE_LIMIT) {
    samples.splice(0, samples.length - STATE_LOG_SAMPLE_LIMIT);
  }
  return Object.freeze({
    ...current,
    sampleCount: current.sampleCount + 1,
    samples: Object.freeze(samples),
  });
}

function stateLogRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stateLogNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function stateLogResourceValue(value: unknown): value is StateLogResource {
  if (!stateLogRecordValue(value)) return false;
  return (
    typeof value["present"] === "boolean" &&
    typeof value["unlocked"] === "boolean" &&
    typeof value["amount"] === "number" &&
    Number.isFinite(value["amount"]) &&
    typeof value["max"] === "number" &&
    Number.isFinite(value["max"]) &&
    typeof value["rateOfChange"] === "number" &&
    Number.isFinite(value["rateOfChange"]) &&
    typeof value["storageRatio"] === "number" &&
    Number.isFinite(value["storageRatio"])
  );
}

function stateLogSampleValue(value: unknown): value is StateLogSample {
  if (!stateLogRecordValue(value)) return false;
  const resources = value["resources"];
  if (!stateLogRecordValue(resources)) return false;
  if (
    !stateLogNonNegativeInteger(value["tick"]) ||
    !stateLogNonNegativeInteger(value["day"]) ||
    !stateLogResourceValue(resources["Money"]) ||
    !stateLogResourceValue(resources["Knowledge"])
  ) {
    return false;
  }
  const construction = value["construction"];
  if (construction !== undefined) {
    if (
      !stateLogRecordValue(construction) ||
      !stateLogNonNegativeInteger(construction["cycleId"]) ||
      (construction["detailLevel"] !== "targets" &&
        construction["detailLevel"] !== "planner")
    ) {
      return false;
    }
    const target = construction["target"];
    if (
      target !== undefined &&
      (!stateLogRecordValue(target) ||
        typeof target["key"] !== "string" ||
        typeof target["family"] !== "string" ||
        typeof target["blocker"] !== "string" ||
        (target["resourceId"] !== undefined &&
          typeof target["resourceId"] !== "string") ||
        (target["timeSeconds"] !== undefined &&
          (typeof target["timeSeconds"] !== "number" ||
            !Number.isFinite(target["timeSeconds"]))))
    ) {
      return false;
    }
  }
  return true;
}

export function parseStateLogRecord(
  value: unknown,
): Readonly<StateLogRecord> | null {
  if (!stateLogRecordValue(value)) return null;
  const samples = value["samples"];
  if (
    value["version"] !== STATE_LOG_SCHEMA_VERSION ||
    !stateLogNonNegativeInteger(value["reset"]) ||
    !stateLogNonNegativeInteger(value["startDay"]) ||
    typeof value["species"] !== "string" ||
    !stateLogNonNegativeInteger(value["sampleCount"]) ||
    !Array.isArray(samples) ||
    samples.length === 0 ||
    samples.length > STATE_LOG_SAMPLE_LIMIT ||
    value["sampleCount"] < samples.length ||
    !samples.every(stateLogSampleValue)
  ) {
    return null;
  }
  const normalizedSamples = samples.map((sample: StateLogSample) =>
    freezeStateLogSample(sample),
  );
  return Object.freeze({
    version: STATE_LOG_SCHEMA_VERSION,
    reset: value["reset"],
    startDay: value["startDay"],
    species: value["species"],
    sampleCount: value["sampleCount"],
    samples: Object.freeze(normalizedSamples),
  });
}
