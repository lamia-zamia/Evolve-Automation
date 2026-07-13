interface BrowserElement {
  __vue__?: unknown;
}

interface BrowserRuntimeDependencies {
  getWin: () => {
    document: { getElementById(id: string): BrowserElement | null };
  };
  getDocument: () => {
    createElement(name: "a"): {
      download: string;
      href: string;
      click(): void;
    };
  };
  getUrlApi: () => {
    createObjectURL(blob: unknown): string;
    revokeObjectURL(url: string): void;
  };
  getBlobConstructor: () => new (parts: string[]) => unknown;
  schedule: (callback: () => void, delay: number) => unknown;
}

export function createBrowserRuntime({
  getWin,
  getDocument,
  getUrlApi,
  getBlobConstructor,
  schedule,
}: BrowserRuntimeDependencies) {
  function getVueById(elementId: string) {
    const element = getWin().document.getElementById(elementId);
    if (element === null || !element.__vue__) {
      return undefined;
    }
    return element.__vue__;
  }

  function triggerFileDownload(contents: string, filename: string) {
    const UrlApi = getUrlApi();
    const BlobConstructor = getBlobConstructor();
    const url = UrlApi.createObjectURL(new BlobConstructor([contents]));
    const anchor = getDocument().createElement("a");
    anchor.download = filename;
    anchor.href = url;
    anchor.click();
    schedule(() => {
      UrlApi.revokeObjectURL(url);
    }, 60 * 1000);
  }

  return { getVueById, triggerFileDownload };
}
