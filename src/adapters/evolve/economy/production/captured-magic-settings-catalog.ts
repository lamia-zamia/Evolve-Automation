/**
 * Projects the captured magic resources into the Magic settings catalog.
 *
 * DeadSpace draws one `#alchemy<id>` row per transmutable resource under the
 * alchemy panel (`src/resources.js` `loadAlchemy`), so the alchemy rows are the
 * captured `alchemy<id>` control ids in discovery order. Upstream gates the
 * panel on the magic universe with a `basic` flag taken straight from the
 * resource's tradable flag, and it no longer has transmute tiers — so the
 * legacy tier color keeps its basic/advanced split through that flag: basic
 * (tradable) rows read info, the rest advanced. Ritual rows are the fixed
 * eight-spell set the pylon automation clicks; their labels are the game's own
 * `modal_pylon_spell_*` strings (`strings/strings.json` at the port reference
 * commit), restated here because localization is unreachable from a capture.
 * No manager, entity bridge, or compatibility object is consulted.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { readMagicResetContext } from "../../captured-settings-defaults.ts";
import { PYLON_SPELL_IDS } from "./captured-pylon.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export interface CapturedMagicAlchemyEntry {
  readonly resourceId: string;
  readonly label: string;
  readonly color: "has-text-advanced" | "has-text-info";
}

export interface CapturedMagicPylonEntry {
  readonly spellId: string;
  readonly label: string;
}

const PYLON_SPELL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  farmer: "Farming",
  miner: "Mining",
  lumberjack: "Lumber",
  science: "Science",
  factory: "Cement",
  army: "War",
  hunting: "Hunting",
  crafting: "Crafting",
});

function readCapturedMagicResourceTitle(
  root: unknown,
  resourceId: string,
): string {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  if (!isRecord(resource)) return resourceId;
  const title = readProperty(resource, "title");
  if (typeof title === "string" && title.length > 0) return title;
  const name = readProperty(resource, "name");
  return typeof name === "string" && name.length > 0 ? name : resourceId;
}

function readCapturedMagicTradable(root: unknown, resourceId: string): boolean {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  if (!isRecord(resource)) return false;
  return (
    readProperty(resource, "tradable") === true ||
    readProperty(readProperty(resource, "is"), "tradable") === true
  );
}

export function readCapturedMagicAlchemyEntries(
  root: unknown,
  controls: GameControlRegistry,
): readonly Readonly<CapturedMagicAlchemyEntry>[] {
  const { alchemyResourceIds } = readMagicResetContext(controls);
  return Object.freeze(
    alchemyResourceIds.map((resourceId) =>
      Object.freeze({
        resourceId,
        label: readCapturedMagicResourceTitle(root, resourceId),
        color: readCapturedMagicTradable(root, resourceId)
          ? ("has-text-info" as const)
          : ("has-text-advanced" as const),
      }),
    ),
  );
}

export function readCapturedMagicPylonEntries(): readonly Readonly<CapturedMagicPylonEntry>[] {
  return Object.freeze(
    PYLON_SPELL_IDS.map((spellId) =>
      Object.freeze({
        spellId,
        label: PYLON_SPELL_LABELS[spellId] ?? spellId,
      }),
    ),
  );
}
