import type { StateLogRecord } from "../../domain/state-log.ts";
import type { StateLogExportHook } from "../../ports/state-log.ts";
import type { FileDownloadPort } from "../../ports/file-download.ts";
import { readProperty } from "../validation.ts";

export interface StateLogExportHookDependencies {
  readonly pageWindow: unknown;
  readonly exportToPage: ((value: unknown) => unknown) | undefined;
  readonly download: FileDownloadPort | undefined;
}

function stateLogExportDay(record: Readonly<StateLogRecord>): number {
  return record.samples.at(-1)?.day ?? record.startDay;
}

export function createStateLogExportHook({
  pageWindow,
  exportToPage,
  download,
}: StateLogExportHookDependencies): StateLogExportHook {
  return Object.freeze({
    install(readCurrent: () => unknown): () => void {
      const host = pageWindow;
      if (
        host === null ||
        (typeof host !== "object" && typeof host !== "function")
      ) {
        return () => {};
      }
      const rawHook = () => {
        const current = readCurrent();
        if (
          download === undefined ||
          typeof current !== "object" ||
          current === null ||
          !Array.isArray(readProperty(current, "samples"))
        ) {
          return;
        }
        const record = current as Readonly<StateLogRecord>;
        try {
          download.triggerFileDownload(
            JSON.stringify(record),
            `evolve-statelog-manual-d${stateLogExportDay(record)}.json`,
          );
        } catch {
          // A blocked browser download does not mutate or disrupt the live runtime.
        }
      };
      let exposedHook: unknown = rawHook;
      try {
        exposedHook = exportToPage?.(rawHook) ?? rawHook;
        if (!Reflect.set(host, "eaExportStateLog", exposedHook)) {
          return () => {};
        }
      } catch {
        return () => {};
      }
      return () => {
        try {
          if (readProperty(host, "eaExportStateLog") === exposedHook) {
            Reflect.deleteProperty(host, "eaExportStateLog");
          }
        } catch {
          // A changed or sealed page global is outside the runtime's teardown control.
        }
      };
    },
  });
}
