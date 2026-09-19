/**
 * The one owner of the foreign-affairs policy vocabulary.
 *
 * A policy id is the value persisted in `foreignPolicyInferior` / `foreignPolicySuperior` /
 * `foreignPolicyRival` and read back by `capturedForeignPolicy`. Four independent things used to
 * restate that list: the espionage operation switch, the settings select options, the rival select
 * options, and the legacy adapter's walk over `SpyManager.Types`. They are one table here, so a
 * policy cannot be selectable without an operation mapping or vice versa.
 *
 * The ids mirror the game's own espionage missions (`spy_influence`, `spy_sabotage`,
 * `spy_incite`, `spy_annex`, `spy_purchase` in `src/civics.js`) plus the two policies the script
 * owns: `Ignore` (do nothing) and `Occupy` (take by force, which prepares with sabotage).
 *
 * Labels are the upstream `civics_spy_<id>` strings in English. Localization is unreachable from a
 * capture, so they are restated rather than resolved — the same call the other captured catalogs
 * make.
 */

/** An espionage mission the captured runtime can run against a foreign power. */
export type CapturedEspionageOperation =
  "influence" | "sabotage" | "incite" | "annex" | "purchase";

export interface CapturedForeignPolicyEntry {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  /** `null` where the policy runs no espionage mission of its own. */
  readonly espionageOperation: CapturedEspionageOperation | null;
}

/** Selectable against an Inferior or Superior power, in the order the panel lists them. */
export const CAPTURED_FOREIGN_POLICIES: readonly CapturedForeignPolicyEntry[] =
  Object.freeze([
    Object.freeze({
      id: "Ignore",
      label: "Ignore",
      hint: "",
      espionageOperation: null,
    }),
    Object.freeze({
      id: "Influence",
      label: "Influence",
      hint: "",
      espionageOperation: "influence" as const,
    }),
    Object.freeze({
      id: "Sabotage",
      label: "Sabotage",
      hint: "",
      espionageOperation: "sabotage" as const,
    }),
    Object.freeze({
      id: "Incite",
      label: "Incite",
      hint: "",
      espionageOperation: "incite" as const,
    }),
    Object.freeze({
      id: "Annex",
      label: "Annex",
      hint: "",
      espionageOperation: "annex" as const,
    }),
    Object.freeze({
      id: "Purchase",
      label: "Purchase",
      hint: "",
      espionageOperation: "purchase" as const,
    }),
    // Occupy has no mission of its own: the espionage planner weakens the target with sabotage
    // until the battle planner can take it.
    Object.freeze({
      id: "Occupy",
      label: "Occupy",
      hint: "",
      espionageOperation: null,
    }),
  ]);

/**
 * Selectable against the True Path rival, which is a different relationship: the rival is never
 * annexed or purchased, and `Betrayal` switches between influence and sabotage on its own.
 */
export const CAPTURED_FOREIGN_RIVAL_POLICIES: readonly CapturedForeignPolicyEntry[] =
  Object.freeze([
    Object.freeze({
      id: "Ignore",
      label: "Ignore",
      hint: "Does nothing",
      espionageOperation: null,
    }),
    Object.freeze({
      id: "Influence",
      label: "Alliance",
      hint: "Influence rival up to best relations",
      espionageOperation: "influence" as const,
    }),
    Object.freeze({
      id: "Sabotage",
      label: "War",
      hint: "Sabotage and plunder rival",
      espionageOperation: "sabotage" as const,
    }),
    // Betrayal is decided per cycle from the rival's military and hostility, so it carries no
    // fixed operation here; `capturedEspionageOperationForPolicy` owns that branch.
    Object.freeze({
      id: "Betrayal",
      label: "Betrayal",
      hint: "Influence rival up to best relations, and start sabotaging. Once military power reached minimum - start plundering it",
      espionageOperation: null,
    }),
  ]);

/** The espionage mission a fixed policy asks for, or `null` where the policy decides per cycle. */
export function capturedForeignPolicyEspionageOperation(
  policy: string,
): CapturedEspionageOperation | null {
  return (
    CAPTURED_FOREIGN_POLICIES.find((entry) => entry.id === policy)
      ?.espionageOperation ?? null
  );
}
