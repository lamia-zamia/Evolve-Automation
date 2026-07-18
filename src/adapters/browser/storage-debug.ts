import type { StorageDebugSource } from "../../ports/storage-allocation.ts";

export function createStorageDebugSource(
  getWindow: () => unknown,
): StorageDebugSource {
  return Object.freeze({
    readEnabled(): boolean {
      const value = getWindow();
      return (
        typeof value === "object" &&
        value !== null &&
        Reflect.get(value, "storageDebug") === true
      );
    },
  });
}
