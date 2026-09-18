/**
 * Projects the captured market resources into the Market settings catalog.
 *
 * DeadSpace draws one `#market-<id>` row per tradable resource under `#market`
 * (`src/resources.js` `drawMarket`), so the element id is `market-` followed by
 * the resource id. The catalog is the same resource list the lifecycle defaults
 * are computed from, with the game's own root title where the record carries
 * one and the raw id otherwise. Galaxy rows come from the resolved offer
 * identities the galaxy automation clicks. No manager, entity bridge, or
 * compatibility object is consulted.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { readMarketResetContext } from "../../captured-settings-defaults.ts";
import {
  capturedGalaxyOfferIdentities,
  type CapturedGalaxyOfferIdentity,
} from "./captured-galaxy-market.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export interface CapturedMarketSettingsEntry {
  readonly resourceId: string;
  readonly elementId: string;
  readonly label: string;
}

export interface CapturedMarketGalaxyEntry {
  readonly buyId: string;
  readonly buyLabel: string;
  readonly sellId: string;
  readonly sellLabel: string;
}

function readCapturedMarketResourceTitle(
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

export function readCapturedMarketSettingsEntries(
  root: unknown,
  controls: GameControlRegistry,
): readonly Readonly<CapturedMarketSettingsEntry>[] {
  const { tradableResourceIds } = readMarketResetContext(root, controls);
  return Object.freeze(
    tradableResourceIds.map((resourceId) =>
      Object.freeze({
        resourceId,
        elementId: `market-${resourceId}`,
        label: readCapturedMarketResourceTitle(root, resourceId),
      }),
    ),
  );
}

export function readCapturedMarketGalaxyEntries(
  root: unknown,
): readonly Readonly<CapturedMarketGalaxyEntry>[] {
  const offers: readonly CapturedGalaxyOfferIdentity[] =
    capturedGalaxyOfferIdentities(root);
  return Object.freeze(
    offers.map((offer) =>
      Object.freeze({
        buyId: offer.buyResourceId,
        buyLabel: readCapturedMarketResourceTitle(root, offer.buyResourceId),
        sellId: offer.sellResourceId,
        sellLabel: readCapturedMarketResourceTitle(root, offer.sellResourceId),
      }),
    ),
  );
}
