/**
 * Projects the captured root and control registry into the Research settings catalog.
 *
 * The ignore list needs every technology the player could name, labeled for display. The
 * captured path has neither the game's full action catalog nor its localization, so the known
 * set is the union of the root `tech` record (researched or otherwise seen technologies) and
 * the captured `tech-` controls (whatever the game has drawn and bound). Labels come from the
 * bound control's own title with the raw element id as fallback — the same rule the project
 * table uses. A technology the game has never drawn nor granted is absent rather than guessed.
 *
 * Order is root order first, then control-discovery order; it is deterministic per state but
 * not the game's catalog order, which nothing captured can reproduce.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { ResearchSettingsTechnologyCatalog } from "../../../../domain/progression/research/research-settings.ts";
import { readCapturedControlLabel } from "../../captured-control-label.ts";
import { isRecord, readProperty } from "../../../validation.ts";

/** The element id for a root `tech` key: the game renders each technology as `tech-<id>`. */
export function readTechElementId(rootKey: string): string {
  return rootKey.startsWith("tech-") ? rootKey : `tech-${rootKey}`;
}

function readRootTechIds(root: unknown): readonly string[] {
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return Object.freeze([]);
  return Object.freeze(Object.keys(tech).map(readTechElementId));
}

function readCapturedTechControlIds(
  controls: GameControlRegistry,
): readonly string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of controls.capturedElementIds()) {
    if (!id.startsWith("tech-") || id.length <= "tech-".length) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze(ids);
}

export function readCapturedResearchTechnologies(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
): ResearchSettingsTechnologyCatalog {
  const root = rootState.readRoot();
  const seen = new Set<string>();
  const technologies: Record<string, { _vueBinding: string; name: string }> =
    {};
  for (const elementId of [
    ...readRootTechIds(root),
    ...readCapturedTechControlIds(controls),
  ]) {
    if (seen.has(elementId)) continue;
    seen.add(elementId);
    const handle = controls.resolve(elementId);
    technologies[elementId] = Object.freeze({
      _vueBinding: elementId,
      name:
        handle === undefined
          ? elementId
          : readCapturedControlLabel(handle, elementId),
    });
  }
  return Object.freeze(technologies);
}

const TECH_LOCALIZE_PATTERN = /^tech_(.+?)(_(effect|desc))?$/;

/**
 * Answers the localization keys the research read model asks for. Base keys resolve to the
 * bound control's title with the element id as fallback; effect descriptions have no captured
 * source and answer empty rather than echoing the id as a hint.
 */
export function createCapturedResearchLocalize(
  controls: GameControlRegistry,
): (key: string) => string {
  return (key: string): string => {
    const match = TECH_LOCALIZE_PATTERN.exec(key);
    if (match === null) return key;
    const elementId = readTechElementId(match[1] ?? "");
    if (match[2] !== undefined) return "";
    const handle = controls.resolve(elementId);
    return handle === undefined
      ? elementId
      : readCapturedControlLabel(handle, elementId);
  };
}
