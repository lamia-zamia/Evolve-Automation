import type { StorageAllocationInput } from "../domain/economy/storage/storage-allocation.ts";

export interface StorageAllocationReader {
  read(): StorageAllocationInput;
}

export interface StorageExpansionRequester {
  expand(storageToBuild: number): boolean;
}

export interface StorageDebugSource {
  readEnabled(): boolean;
}
