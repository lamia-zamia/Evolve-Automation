/**
 * Pinned structural compatibility with DeadSpace `ships.js:shipBound()` at
 * `6cc9ba8ce714e9ef474b468be93b4c7edfb98830`.
 *
 * The shipped IIFE exposes no callable `shipBound` or read-only bound-destination control. Its
 * `shipMoving`, `shipPort`, `shipDestination`, `legsOf` and `legPlace` helpers therefore define this
 * small reader, guarded by the snapshot regression in `tests/evolve/space/captured-ship-route-test.mjs`.
 * A moving ship keeps the port it left in `location`; only its final leg names its assignment.
 * Unreadable structures are unavailable so a matching hull cannot silently free a target slot.
 */
import { isNonArrayRecord } from "../../validation.ts";

export type CapturedShipBound =
  | { readonly kind: "region"; readonly region: string }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable" };

export function capturedShipBound(ship: unknown): CapturedShipBound {
  try {
    if (!isNonArrayRecord(ship)) return { kind: "unavailable" };
    const shipRouteMovement = ship["movement"];
    if (!shipRouteMovement) {
      const shipRouteLocation = ship["location"];
      return isNonArrayRecord(shipRouteLocation) &&
        typeof shipRouteLocation["id"] === "string"
        ? { kind: "region", region: shipRouteLocation["id"] }
        : { kind: "unavailable" };
    }
    if (!isNonArrayRecord(shipRouteMovement)) return { kind: "unavailable" };
    const shipRouteLegs = shipRouteMovement["legs"];
    if (!Array.isArray(shipRouteLegs)) return { kind: "unavailable" };
    if (shipRouteLegs.length === 0) return { kind: "none" };
    const shipRouteFinalLeg: unknown = shipRouteLegs[shipRouteLegs.length - 1];
    if (!isNonArrayRecord(shipRouteFinalLeg)) return { kind: "unavailable" };
    const shipRouteDestination = shipRouteFinalLeg["to"];
    return isNonArrayRecord(shipRouteDestination) &&
      typeof shipRouteDestination["id"] === "string"
      ? { kind: "region", region: shipRouteDestination["id"] }
      : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
