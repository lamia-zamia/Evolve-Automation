/**
 * Handing the page's user a generated file.
 *
 * Single owner of the anchor-plus-object-URL gesture: the compatibility runtime reaches it through
 * `createBrowserRuntime`, and the captured settings panel uses it directly for "Script Settings as
 * File". The object URL is revoked on a schedule rather than immediately because a click started in
 * this turn is still reading it when the call returns.
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
