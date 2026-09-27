import type { StateLogObservation } from "../domain/state-log.ts";

export interface StateLogObservationReader {
  /** Reads captured game observations; called only when an enabled sample is due. */
  read(tick: number): Readonly<StateLogObservation> | undefined;
}

export interface StateLogFileDownload {
  triggerFileDownload(contents: string, filename: string): void;
}

export interface StateLogExportHook {
  install(readCurrent: () => unknown): () => void;
}
