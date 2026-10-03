/** Retains the running game's private Space info closures from one protected render. */
import { OUTER_FLEET_REGIONS } from "../../domain/combat/outer-fleet-regions.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../ports/game-tab-discovery.ts";
import type { GameSpaceRegionMechanics } from "../../ports/game-space-region-mechanics.ts";
import {
  isNonArrayRecord,
  readProperty,
  type UnknownRecord,
} from "../validation.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_PANELS,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SUB_TAB_CONTROLS,
} from "./captured-tab-discovery.ts";
import { observeScopedObjectKeys } from "./scoped-object-keys.ts";

interface CapturedSpaceRegionDependencies {
  readonly pageWindow: unknown;
  readonly rootState: GameRootStateSource;
  readonly discovery: GameTabDiscovery;
}

function spaceRegionInfoCandidate(
  value: unknown,
): Map<string, UnknownRecord> | undefined {
  if (!isNonArrayRecord(value)) return undefined;
  const infos = new Map<string, UnknownRecord>();
  for (const region of OUTER_FLEET_REGIONS) {
    const entry = readProperty(value, region);
    const info = readProperty(entry, "info");
    if (
      !isNonArrayRecord(entry) ||
      !isNonArrayRecord(info) ||
      typeof readProperty(info, "nav") !== "function" ||
      typeof readProperty(info, "syndicate") !== "function"
    )
      return undefined;
    infos.set(region, info);
  }
  return infos;
}

export function createCapturedSpaceRegionMechanics(
  dependencies: CapturedSpaceRegionDependencies,
): GameSpaceRegionMechanics {
  let spaceRegionAuthority: Map<string, UnknownRecord> | undefined;
  let spaceRegionCaptureInFlight = false;

  function captureSpaceRegionAuthority(): boolean {
    if (spaceRegionCaptureInFlight) return false;
    spaceRegionCaptureInFlight = true;
    let candidateIdentity: unknown;
    let candidateInfos: Map<string, UnknownRecord> | undefined;
    let ambiguousSpaceMetadata = false;
    let protectedSpaceDrawSucceeded = false;
    try {
      const observedKeys = observeScopedObjectKeys(
        dependencies.pageWindow,
        (argument) => {
          if (candidateIdentity === argument && candidateInfos !== undefined)
            return;
          const infos = spaceRegionInfoCandidate(argument);
          if (infos === undefined) return;
          if (candidateInfos !== undefined) ambiguousSpaceMetadata = true;
          else {
            candidateIdentity = argument;
            candidateInfos = infos;
          }
        },
        () => {
          const panel = MAIN_TAB_PANELS[MAIN_TAB_INDEX.civilization];
          const result = dependencies.discovery.discover(
            [
              {
                setting: MAIN_TAB_SETTING,
                control: MAIN_TAB_CONTROL,
                index: MAIN_TAB_INDEX.civilization,
              },
              {
                setting: SPACE_TABS_SETTING,
                control: SUB_TAB_CONTROLS[SPACE_TABS_SETTING] ?? "",
                index: SPACE_TAB_INDEX.space,
              },
            ],
            {
              forceDraw: true,
              ...(panel === undefined ? {} : { mount: [`#${panel}`] }),
            },
          );
          protectedSpaceDrawSucceeded = result.outcome.status === "succeeded";
        },
      );
      if (
        !observedKeys ||
        !protectedSpaceDrawSucceeded ||
        ambiguousSpaceMetadata ||
        candidateInfos === undefined
      )
        return false;
      spaceRegionAuthority = candidateInfos;
      return true;
    } finally {
      spaceRegionCaptureInFlight = false;
    }
  }

  return Object.freeze({
    read(region: string) {
      if (!OUTER_FLEET_REGIONS.includes(region))
        return { kind: "invalid" as const };
      if (spaceRegionAuthority === undefined && !captureSpaceRegionAuthority())
        return { kind: "absent" as const };
      const info = spaceRegionAuthority?.get(region);
      if (info === undefined) return { kind: "invalid" as const };
      try {
        const nav = info["nav"];
        const syndicate = info["syndicate"];
        if (typeof nav !== "function" || typeof syndicate !== "function")
          return { kind: "invalid" as const };
        let reachable = Boolean(Reflect.apply(nav, info, []));
        const syndicateEnabled = Boolean(Reflect.apply(syndicate, info, []));
        // ships.js:regionReachable adds this edge after info.nav(); all other gates stay native.
        if (region === "spc_moon") {
          const root = dependencies.rootState.readRoot();
          const race = readProperty(root, "race");
          if (!isNonArrayRecord(root) || !isNonArrayRecord(race))
            return { kind: "invalid" as const };
          if (race["orbit_decayed"]) reachable = false;
        }
        return {
          kind: "value" as const,
          value: Object.freeze({ reachable, syndicateEnabled }),
        };
      } catch {
        return { kind: "invalid" as const };
      }
    },
  });
}
