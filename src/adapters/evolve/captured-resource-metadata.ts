/**
 * Reading one resource's record, and its display label, out of the captured root.
 *
 * Market, Storage, Production, Magic, Ejector and Building each read the same two fields in the
 * same order with the same fallbacks. Only that much is shared here: anything a section decides
 * *about* a resource — its colour, whether it is tradable, whether it matches a cost — stays with
 * that section, because those are different questions that merely start from the same record.
 */

import { isRecord, readProperty } from "../validation.ts";

/** The resource's own record, or `undefined` when the root does not carry it. */
export function readCapturedResource(
  root: unknown,
  resourceId: string,
): Record<string, unknown> | undefined {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  return isRecord(resource) ? resource : undefined;
}

/**
 * The game's own localized title, its internal name as a fallback, and the raw id when the root
 * carries neither. An empty string counts as absent: the game leaves a title blank while a
 * resource is still being initialized, and a blank row label is never what the player wants.
 */
export function readCapturedResourceLabel(
  root: unknown,
  resourceId: string,
): string {
  const resource = readCapturedResource(root, resourceId);
  if (resource === undefined) return resourceId;
  const title = readProperty(resource, "title");
  if (typeof title === "string" && title.length > 0) return title;
  const name = readProperty(resource, "name");
  return typeof name === "string" && name.length > 0 ? name : resourceId;
}
