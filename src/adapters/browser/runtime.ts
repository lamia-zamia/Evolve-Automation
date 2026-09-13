import { createVueAdapter, type VueAdapterDependencies } from "./vue.ts";
import {
  createFileDownload,
  type FileDownloadDependencies,
} from "./file-download.ts";

interface BrowserRuntimeDependencies
  extends VueAdapterDependencies, FileDownloadDependencies {}

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

  const { triggerFileDownload } = createFileDownload({
    getDocument,
    getUrlApi,
    getBlobConstructor,
    schedule,
  });

  return {
    callVueMethod,
    getMainVue,
    getVueById,
    getVueElement,
    resolveVueMethod,
    triggerFileDownload,
  };
}
