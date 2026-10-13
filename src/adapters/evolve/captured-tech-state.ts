/**
 * The game's technology bag in one comparable value.
 *
 * Upstream's research action reports nothing a caller can use, so a research is confirmed by the
 * only thing that proves it: the technology state moved. Any grant moves it, and nothing else
 * does, so a change across a click is proof the click researched something.
 */

import { isRecord, readProperty } from "../validation.ts";

export function readCapturedTechState(root: unknown): string {
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return "none";
  const parts: string[] = [];
  for (const key of Object.keys(tech).sort()) {
    parts.push(`${key}:${String(tech[key])}`);
  }
  return parts.join(",");
}

/** Reads one native grant level with the same absent-key zero behavior as checkTechRequirements. */
export function readCapturedTechnologyLevel(
  root: unknown,
  technologyId: string,
): number | undefined {
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return undefined;
  const value = readProperty(tech, technologyId);
  if (value === undefined || value === null) return 0;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
