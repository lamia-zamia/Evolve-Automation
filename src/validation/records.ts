/** Structural record guards shared by pure layers and external-value adapters. */
export type UnknownRecord = Record<PropertyKey, unknown>;

/** Non-throwing object guard; arrays are objects and are intentionally accepted here. */
export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/** Object guard for keyed bags; arrays are rejected. */
export function isNonArrayRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
