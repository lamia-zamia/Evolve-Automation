import type { StorageAllocationInput } from "../domain/storage-allocation.ts";

export interface StorageAllocationReader {
  read(): StorageAllocationInput;
}

export interface StorageExpansionRequester {
  expand(storageToBuild: number): boolean;
}

export interface StorageDebugSource {
  readEnabled(): boolean;
}
