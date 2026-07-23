import { createSnapshotMetadata } from "../../domain/snapshot.ts";
import {
  unavailableTaxSnapshot,
  type ReadyTaxSnapshot,
  type TaxSnapshot,
} from "../../domain/civic/tax.ts";
import type { Clock } from "../../ports/clock.ts";
import type { GameReader } from "../../ports/game-reader.ts";
import type { TaxControls } from "../../ports/tax-controls.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
} from "../validation.ts";

export interface EvolveTaxReaderDependencies {
  readonly clock: Clock;
  readonly controls: TaxControls;
  readonly getGame: () => unknown;
  readonly getPoly: () => unknown;
  readonly getResources: () => unknown;
}

export function createEvolveTaxReader(
  dependencies: EvolveTaxReaderDependencies,
): GameReader<TaxSnapshot> {
  let snapshotSequence = 0;

  function readSnapshot(): TaxSnapshot {
    snapshotSequence += 1;
    const metadata = createSnapshotMetadata({
      id: `tax-snapshot-${snapshotSequence}`,
      capturedAtMs: dependencies.clock.nowMs(),
    });
    const resources = requireRecord(dependencies.getResources(), "resources");
    const morale = requireRecord(resources["Morale"], "resources.Morale");
    if (
      requireBoolean(morale["incomeAdusted"], "resources.Morale.incomeAdusted")
    ) {
      return unavailableTaxSnapshot(metadata, "morale-already-adjusted");
    }
    if (!dependencies.controls.isAvailable()) {
      return unavailableTaxSnapshot(metadata, "controls-unavailable");
    }

    const game = requireRecord(dependencies.getGame(), "game");
    const global = requireRecord(game["global"], "game.global");
    const civic = requireRecord(global["civic"], "game.global.civic");
    const taxes = requireRecord(civic["taxes"], "game.global.civic.taxes");
    if (!requireBoolean(taxes["display"], "game.global.civic.taxes.display")) {
      return unavailableTaxSnapshot(metadata, "taxes-hidden");
    }

    const poly = requireRecord(dependencies.getPoly(), "game compatibility");
    const taxCap = requireFunction(poly["taxCap"], "game compatibility.taxCap");
    const maximumRate = requireNumber(
      Reflect.apply(taxCap, poly, [false]),
      "maximum tax rate",
    );
    const minimumRate = requireNumber(
      Reflect.apply(taxCap, poly, [true]),
      "minimum tax rate",
    );
    if (minimumRate > maximumRate) {
      throw new TypeError("minimum tax rate cannot exceed maximum tax rate");
    }

    const money = requireRecord(resources["Money"], "resources.Money");
    const authority = requireRecord(
      resources["Authority"],
      "resources.Authority",
    );
    const race = requireRecord(global["race"], "game.global.race");
    const banana = Boolean(race["banana"]);
    const isDemanded = requireFunction(
      money["isDemanded"],
      "resources.Money.isDemanded",
    );
    const isAuthorityUnlocked = requireFunction(
      authority["isUnlocked"],
      "resources.Authority.isUnlocked",
    );

    const snapshot: ReadyTaxSnapshot = {
      metadata,
      status: "ready",
      tax: Object.freeze({
        currentRate: requireNumber(
          taxes["tax_rate"],
          "game.global.civic.taxes.tax_rate",
        ),
        minimumRate,
        maximumRate,
      }),
      morale: Object.freeze({
        current: requireNumber(
          morale["currentQuantity"],
          "resources.Morale.currentQuantity",
        ),
        projected: requireNumber(
          morale["rateOfChange"],
          "resources.Morale.rateOfChange",
        ),
        maximum: requireNumber(
          morale["maxQuantity"],
          "resources.Morale.maxQuantity",
        ),
      }),
      money: Object.freeze({
        storageRatio: requireNumber(
          money["storageRatio"],
          "resources.Money.storageRatio",
        ),
        demanded: banana
          ? false
          : requireBoolean(
              Reflect.apply(isDemanded, money, []),
              "resources.Money.isDemanded result",
            ),
      }),
      authority: Object.freeze({
        current: requireNumber(
          authority["currentQuantity"],
          "resources.Authority.currentQuantity",
        ),
        maximum: requireNumber(
          authority["maxQuantity"],
          "resources.Authority.maxQuantity",
        ),
        unlocked: requireBoolean(
          Reflect.apply(isAuthorityUnlocked, authority, []),
          "resources.Authority.isUnlocked result",
        ),
      }),
      banana,
    };
    return Object.freeze(snapshot);
  }

  return Object.freeze({ readSnapshot });
}
