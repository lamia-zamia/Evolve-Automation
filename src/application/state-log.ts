import {
  appendStateLogRecord,
  createStateLogRecord,
  normalizeStateLogInterval,
  parseStateLogRecord,
  STATE_LOG_PERSIST_INTERVAL,
  type StateLogRecord,
} from "../domain/state-log.ts";
import type { FileDownloadPort } from "../ports/file-download.ts";
import type { StateLogStore } from "../ports/state-log-store.ts";
import type { StateLogObservationReader } from "../ports/state-log.ts";

export interface StateLogRecorder {
  recordProcessedCycle(tick: number, settings: unknown): void;
  prestigeCommitted(
    settings: unknown,
    endingReset?: number,
    endingDay?: number,
  ): void;
  readCurrent(): Readonly<StateLogRecord> | null;
}

export interface StateLogRecorderDependencies {
  readonly store: StateLogStore;
  readonly reader: StateLogObservationReader;
  readonly download?: FileDownloadPort | undefined;
}

function stateLogSetting(settings: unknown, key: string): unknown {
  if (typeof settings !== "object" || settings === null) return undefined;
  return Reflect.get(settings, key);
}

function stateLogRecordDay(
  record: Readonly<StateLogRecord>,
  endingDay?: number,
): number {
  if (
    endingDay !== undefined &&
    Number.isSafeInteger(endingDay) &&
    endingDay >= 0
  ) {
    return endingDay;
  }
  return record.samples.at(-1)?.day ?? record.startDay;
}

export function createStateLogRecorder({
  store,
  reader,
  download,
}: StateLogRecorderDependencies): StateLogRecorder {
  let activeRecord: Readonly<StateLogRecord> | undefined;
  let processedCycles = 0;
  let endedReset: number | undefined;

  const loadPersistedRecord = (): Readonly<StateLogRecord> | null => {
    try {
      return parseStateLogRecord(store.load());
    } catch {
      // Corrupt or unavailable storage must not prevent the automation cycle from running.
      return null;
    }
  };

  const persistRecord = (record: Readonly<StateLogRecord>): void => {
    try {
      store.save(record);
    } catch {
      // State logging is optional instrumentation; storage failures cannot stop automation.
    }
  };

  const readCurrent = (): Readonly<StateLogRecord> | null =>
    activeRecord ?? loadPersistedRecord();

  return Object.freeze({
    recordProcessedCycle(tick: number, settings: unknown): void {
      if (stateLogSetting(settings, "stateLogEnabled") !== true) return;
      processedCycles += 1;
      const interval = normalizeStateLogInterval(
        stateLogSetting(settings, "stateLogInterval"),
      );
      if (processedCycles % interval !== 0) return;

      let observation;
      try {
        observation = reader.read(tick);
      } catch {
        // Optional observations cannot be allowed to interrupt the automation cycle.
        return;
      }
      if (observation === undefined || observation.reset === endedReset) return;

      let next: Readonly<StateLogRecord>;
      if (activeRecord?.reset === observation.reset) {
        next = appendStateLogRecord(activeRecord, observation);
      } else {
        const persisted = loadPersistedRecord();
        next =
          persisted?.reset === observation.reset
            ? appendStateLogRecord(persisted, observation)
            : createStateLogRecord(observation);
      }
      activeRecord = next;
      if (next.sampleCount % STATE_LOG_PERSIST_INTERVAL === 0) {
        persistRecord(next);
      }
    },

    prestigeCommitted(
      settings: unknown,
      endingReset?: number,
      endingDay?: number,
    ): void {
      if (stateLogSetting(settings, "stateLogEnabled") !== true) return;
      let endingRecord: Readonly<StateLogRecord> | undefined;
      if (endingReset === undefined) {
        endingRecord = activeRecord;
      } else if (activeRecord?.reset === endingReset) {
        endingRecord = activeRecord;
      } else {
        const persisted = loadPersistedRecord();
        if (persisted?.reset === endingReset) endingRecord = persisted;
      }
      if (endingRecord === undefined) return;
      if (endedReset === endingRecord.reset) return;

      // Seal before invoking browser effects: even a failing download cannot let the old run
      // receive another sample while the game's reset is still completing asynchronously.
      endedReset = endingRecord.reset;
      activeRecord = undefined;
      persistRecord(endingRecord);
      if (
        stateLogSetting(settings, "stateLogAutoDownload") !== true ||
        download === undefined
      ) {
        return;
      }
      try {
        download.triggerFileDownload(
          JSON.stringify(endingRecord),
          `evolve-statelog-${endingRecord.species}-r${endingRecord.reset}-d${stateLogRecordDay(endingRecord, endingDay)}.json`,
        );
      } catch {
        // A browser download failure cannot change the already committed game reset.
      }
    },

    readCurrent,
  });
}
