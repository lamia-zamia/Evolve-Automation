import {
  freezeStateLogObservation,
  type StateLogObservation,
} from "../../domain/state-log.ts";
import type {
  GameIdentitySource,
  GameResourceSource,
} from "../../ports/game-world-state.ts";
import type { ConstructionReadoutSnapshot } from "../../ports/game-construction-observations.ts";
import type { StateLogObservationReader } from "../../ports/state-log.ts";

// The progression catalog is the authoritative source for offered technologies, but refreshing it
// can draw the hidden Research tab. State Log deliberately omits that field instead of causing a
// UI discovery whose only consumer would be telemetry.

export interface CapturedStateLogReaderDependencies {
  readonly identity: GameIdentitySource;
  readonly resources: GameResourceSource;
  readonly readConstruction: () => Readonly<ConstructionReadoutSnapshot> | null;
}

function capturedStateLogConstruction(
  snapshot: Readonly<ConstructionReadoutSnapshot> | null,
): StateLogObservation["construction"] {
  if (snapshot === null) return undefined;
  const target =
    snapshot.detailLevel === "planner"
      ? snapshot.targets.find((candidate) => !candidate.queued)
      : undefined;
  return Object.freeze({
    cycleId: snapshot.cycleId,
    detailLevel: snapshot.detailLevel,
    ...(target === undefined
      ? {}
      : {
          target: Object.freeze({
            key: target.key,
            family: target.family,
            blocker: target.blocker,
            ...(target.resourceId === undefined
              ? {}
              : { resourceId: target.resourceId }),
            ...(target.timeSeconds === undefined
              ? {}
              : { timeSeconds: target.timeSeconds }),
          }),
        }),
  });
}

export function createCapturedStateLogReader({
  identity,
  resources,
  readConstruction,
}: CapturedStateLogReaderDependencies): StateLogObservationReader {
  return Object.freeze({
    read(tick: number): Readonly<StateLogObservation> | undefined {
      const identitySample = identity.readIdentity();
      const resourceSample = resources.readResources(["Money", "Knowledge"]);
      if (
        identitySample === undefined ||
        resourceSample === undefined ||
        !Number.isSafeInteger(identitySample.resets) ||
        identitySample.resets < 0 ||
        !Number.isSafeInteger(identitySample.days) ||
        identitySample.days < 0
      ) {
        return undefined;
      }
      const money = resourceSample.resources.get("Money");
      const knowledge = resourceSample.resources.get("Knowledge");
      if (money === undefined || knowledge === undefined) return undefined;

      const constructionSnapshot = readConstruction();
      const construction = capturedStateLogConstruction(constructionSnapshot);
      return freezeStateLogObservation({
        reset: identitySample.resets,
        species: identitySample.species,
        tick,
        day: identitySample.days,
        resources: Object.freeze({ Money: money, Knowledge: knowledge }),
        ...(construction === undefined ? {} : { construction }),
      });
    },
  });
}
