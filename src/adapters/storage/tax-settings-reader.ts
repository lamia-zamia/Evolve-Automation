import type { TaxSettings } from "../../domain/tax.ts";
import type { SettingsReader } from "../../ports/settings-reader.ts";
import { requireBoolean, requireNumber, requireRecord } from "../validation.ts";

export function createTaxSettingsReader(
  getSettings: () => unknown,
): SettingsReader<TaxSettings> {
  function readSettings(): Readonly<TaxSettings> {
    const settings = requireRecord(getSettings(), "settings");
    return Object.freeze({
      requestedRate: requireNumber(
        settings["generalRequestedTaxRate"],
        "settings.generalRequestedTaxRate",
      ),
      minimumRate: requireNumber(
        settings["generalMinimumTaxRate"],
        "settings.generalMinimumTaxRate",
      ),
      minimumMorale: requireNumber(
        settings["generalMinimumMorale"],
        "settings.generalMinimumMorale",
      ),
      maximumMorale: requireNumber(
        settings["generalMaximumMorale"],
        "settings.generalMaximumMorale",
      ),
      manageAuthority: requireBoolean(
        settings["authorityManage"],
        "settings.authorityManage",
      ),
      authorityTarget: requireNumber(
        settings["generalMinimumAuthority"],
        "settings.generalMinimumAuthority",
      ),
    });
  }

  return Object.freeze({ readSettings });
}
