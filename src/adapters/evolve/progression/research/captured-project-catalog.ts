/**
 * The A.R.P.A. offer catalog as the running bundle's own mechanics answer it.
 *
 * Membership, rank, progress, and the exact per-percent price all come from the captured lexical
 * mechanics, so a sample costs one synchronous price read per offered project and no panel draw. The
 * element id is the one the Physics panel binds, the build queue stores, and the stored conditions
 * name, so a candidate key, a queue entry, and a condition operand stay one identity.
 */

import type { CapturedArpaMechanics } from "../../../../ports/captured-arpa-mechanics.ts";
import type {
  GameProjectCatalog,
  OfferedProject,
} from "../../../../ports/game-project-catalog.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { arpaProjectElementId } from "./arpa-project-identity.ts";

export interface CapturedProjectCatalogDependencies {
  readonly rootState: GameRootStateSource;
  readonly mechanics: CapturedArpaMechanics;
  readonly onUnavailable?: (reason: string) => void;
  readonly onDiagnostic?: (reason: string) => void;
}

export function createCapturedProjectCatalog(
  dependencies: CapturedProjectCatalogDependencies,
): GameProjectCatalog {
  const { rootState, mechanics } = dependencies;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});
  const reportDiagnostic = dependencies.onDiagnostic ?? (() => {});

  return Object.freeze({
    readProjects(): readonly Readonly<OfferedProject>[] | undefined {
      // The lexical bridge is the only A.R.P.A. authority there is, and it is captured once. This is
      // the single controlled Physics draw in the feature's life, and it happens here rather than
      // per sample: afterwards nothing in the catalog needs a panel.
      const capture = mechanics.ensureCaptured();
      if (capture.kind !== "captured") {
        reportUnavailable(`native A.R.P.A. capture failed: ${capture.reason}`);
        return undefined;
      }
      const root = rootState.readRoot();
      if (root === undefined) {
        reportUnavailable("the game root has not been captured yet");
        return undefined;
      }
      const offers = mechanics.readOffers(root);
      if (offers === undefined) {
        reportDiagnostic(
          "the offered project catalog is unreadable against the captured registry",
        );
        return undefined;
      }
      return Object.freeze(
        offers.map((offer) =>
          Object.freeze({
            elementId: arpaProjectElementId(offer.projectId),
            projectId: offer.projectId,
            cost: offer.percentCosts,
            rank: offer.rank,
            progress: offer.progress,
          }),
        ),
      );
    },
  });
}
