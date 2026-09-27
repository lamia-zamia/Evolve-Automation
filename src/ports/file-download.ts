export interface FileDownloadPort {
  triggerFileDownload(contents: string, filename: string): void;
}
