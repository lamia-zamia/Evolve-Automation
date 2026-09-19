/**
 * The Government settings option catalogs for the captured runtime.
 *
 * Both lists are fully static. Government ids are verified against `drawGovModal` in
 * `src/civics.js` at the port reference commit: the eleven governments the modal offers,
 * in its order (anarchy is never offered and stays out). Governor backgrounds are the ten
 * `gmen` keys in `src/governor.js` at the same commit; candidates are drawn from exactly
 * those backgrounds every run. The compatibility panel reads the same two sets through its
 * managers; nothing here consults them.
 *
 * Labels and hints have no captured source — the game localizes them through `loc`, which
 * the captured ports do not carry — so labels echo the raw id and hints stay empty rather
 * than inventing copy. The adapter prepends each select's leading `none` entry, mirroring
 * the compatibility reader.
 */

import type { GovernmentSettingsOption } from "../../../domain/civic/government-settings.ts";

/** Selectable governments in upstream modal order, before the adapter's `none`. */
const GOVERNMENT_IDS: readonly string[] = Object.freeze([
  "autocracy",
  "democracy",
  "oligarchy",
  "theocracy",
  "republic",
  "socialist",
  "corpocracy",
  "technocracy",
  "federation",
  "magocracy",
  "dictator",
]);

/** Governor backgrounds in upstream `gmen` order, before the adapter's `none`. */
const GOVERNOR_IDS: readonly string[] = Object.freeze([
  "soldier",
  "criminal",
  "entrepreneur",
  "educator",
  "spiritual",
  "bluecollar",
  "noble",
  "media",
  "sports",
  "bureaucrat",
]);

function readStaticOptions(
  ids: readonly string[],
): readonly GovernmentSettingsOption[] {
  return Object.freeze(
    ids.map((id) => Object.freeze({ val: id, label: id, hint: "" })),
  );
}

const GOVERNMENT_OPTIONS: readonly GovernmentSettingsOption[] =
  readStaticOptions(GOVERNMENT_IDS);

const GOVERNOR_OPTIONS: readonly GovernmentSettingsOption[] =
  readStaticOptions(GOVERNOR_IDS);

export function readCapturedGovernmentOptions(): readonly GovernmentSettingsOption[] {
  return GOVERNMENT_OPTIONS;
}

export function readCapturedGovernorOptions(): readonly GovernmentSettingsOption[] {
  return GOVERNOR_OPTIONS;
}
