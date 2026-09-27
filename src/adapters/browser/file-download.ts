import type { FileDownloadPort } from "../../ports/file-download.ts";
import { readProperty } from "../validation.ts";

/**
 * Handing the page's user a generated file.
 *
 * Single owner of the anchor-plus-object-URL gesture used by the captured settings panel for
 * "Script Settings as File". The object URL is revoked on a schedule rather than immediately
 * because a click started in this turn is still reading it when the call returns.
 */

export interface FileDownloadDependencies {
  readonly getDocument: () => {
    createElement(name: "a"): {
      download: string;
      href: string;
      click(): void;
    };
  };
  readonly getUrlApi: () => {
    createObjectURL(blob: unknown): string;
    revokeObjectURL(url: string): void;
  };
  readonly getBlobConstructor: () => new (parts: string[]) => unknown;
  readonly schedule: (callback: () => void, delay: number) => unknown;
}

export function createFileDownload({
  getDocument,
  getUrlApi,
  getBlobConstructor,
  schedule,
}: FileDownloadDependencies) {
  return {
    triggerFileDownload(contents: string, filename: string) {
      const urlApi = getUrlApi();
      const BlobConstructor = getBlobConstructor();
      const url = urlApi.createObjectURL(new BlobConstructor([contents]));
      const anchor = getDocument().createElement("a");
      anchor.download = filename;
      anchor.href = url;
      anchor.click();
      schedule(() => {
        urlApi.revokeObjectURL(url);
      }, 60 * 1000);
    },
  };
}
/** Builds the existing anchor/object-URL download gesture from one captured page window. */
export function createPageFileDownload(
  pageWindow: unknown,
  documentValue: unknown,
): FileDownloadPort | undefined {
  const urlApi = readProperty(pageWindow, "URL");
  const blobConstructor = readProperty(pageWindow, "Blob");
  const schedule = readProperty(pageWindow, "setTimeout");
  if (
    typeof readProperty(urlApi, "createObjectURL") !== "function" ||
    typeof readProperty(urlApi, "revokeObjectURL") !== "function" ||
    typeof blobConstructor !== "function" ||
    typeof schedule !== "function" ||
    typeof readProperty(documentValue, "createElement") !== "function"
  ) {
    return undefined;
  }
  return createFileDownload({
    getDocument: () =>
      documentValue as ReturnType<FileDownloadDependencies["getDocument"]>,
    getUrlApi: () =>
      urlApi as ReturnType<FileDownloadDependencies["getUrlApi"]>,
    getBlobConstructor: () =>
      blobConstructor as ReturnType<
        FileDownloadDependencies["getBlobConstructor"]
      >,
    schedule: (callback, delay) =>
      Reflect.apply(schedule, pageWindow, [callback, delay]),
  });
}
