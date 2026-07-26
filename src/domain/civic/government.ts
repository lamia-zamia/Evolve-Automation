/**
 * Pure equivalent of the legacy `autoGovernment` decision. Given the sampled
 * government/governor state it returns which government to set (or null) and
 * which governor candidate index to appoint (or null). The composition root
 * performs the `setGovernment` and Vue `appoint` calls.
 */

export interface GovernmentInput {
  readonly isEnabled: boolean;
  readonly guardAnarchist: boolean;
  readonly haveQFactory: boolean;
  readonly haveGovernorTech: boolean;
  readonly currentGovernor: string;
  readonly govSpace: string;
  readonly govFinal: string;
  readonly govInterim: string;
  readonly govGovernor: string;
  readonly govSpaceUnlocked: boolean;
  readonly govFinalUnlocked: boolean;
  readonly govInterimUnlocked: boolean;
  /** Routes already satisfy Trade Federation and Federation is available. */
  readonly tradeFederationReady: boolean;
  /** `game.global.race.governor?.candidates ?? []` background ids, in order. */
  readonly candidateBackgrounds: readonly string[];
}

export interface GovernmentDecision {
  /** Government type to switch to, or null to leave unchanged. */
  readonly government: string | null;
  /** Candidate index to appoint, or null when none matches / not appointing. */
  readonly appointCandidate: number | null;
  /** Expected background at `appointCandidate`, used as a stale precondition. */
  readonly appointCandidateBackground: string | null;
}

export function planGovernment(
  input: Readonly<GovernmentInput>,
): GovernmentDecision {
  let government: string | null = null;
  if (input.isEnabled && !input.guardAnarchist) {
    if (input.tradeFederationReady) {
      government = "federation";
    } else if (
      input.govSpace !== "none" &&
      input.haveQFactory &&
      input.govSpaceUnlocked
    ) {
      government = input.govSpace;
    } else if (input.govFinal !== "none" && input.govFinalUnlocked) {
      government = input.govFinal;
    } else if (input.govInterim !== "none" && input.govInterimUnlocked) {
      government = input.govInterim;
    }
  }

  let appointCandidate: number | null = null;
  let appointCandidateBackground: string | null = null;
  if (
    input.haveGovernorTech &&
    input.govGovernor !== "none" &&
    input.currentGovernor === "none"
  ) {
    for (let i = 0; i < input.candidateBackgrounds.length; i++) {
      if (input.candidateBackgrounds[i] === input.govGovernor) {
        appointCandidate = i;
        appointCandidateBackground = input.govGovernor;
        break;
      }
    }
  }

  return Object.freeze({
    government,
    appointCandidate,
    appointCandidateBackground,
  });
}
