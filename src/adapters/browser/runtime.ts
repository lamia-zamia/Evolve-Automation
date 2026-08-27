import { createVueAdapter, type VueAdapterDependencies } from "./vue.ts";

interface BrowserRuntimeDependencies extends VueAdapterDependencies {
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
  diagnostics,
}: BrowserRuntimeDependencies) {
  const {
    callVueMethod,
    getMainVue,
    getVueById,
    getVueElement,
    resolveVueMethod,
  } = createVueAdapter({ getWin, diagnostics });

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

  return {
    callVueMethod,
    getMainVue,
    getVueById,
    getVueElement,
    resolveVueMethod,
    triggerFileDownload,
  };
}
