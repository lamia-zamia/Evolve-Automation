/**
 * The game's own garrison and underworld fortress panels.
 *
 * Two panels: the city garrison (`garrison`), where a mercenary is hired, the
 * active tactic is picked, and battalion steps are added to a campaign against
 * a foreign power, and the underworld fortress (`fort`), where hell soldiers,
 * patrols, and patrol size are sized and an enemy fortress can be attacked.
 * Callers above this port name the control by the element id the game gives it.
 * With one exception — the campaign title read feeds the attack log — every
 * command here is one or more calls on the panel's component, and the step
 * families are paced by the game's own click-multiplier keys. How many calls a
 * count takes, and which methods perform them, is this port's business.
 */
export interface GameGarrisonCountRequest {
  /** The element the game gives this panel or the fortress. */
  readonly elementId: string;

  /** How many steps to move. Counts of zero or less move nothing. */
  readonly count: number;
}

/** Launching or releasing a campaign against a foreign power. */
export interface GameGarrisonCampaignRequest {
  /** The element the game gives the garrison panel. */
  readonly elementId: string;

  /** The foreign power the campaign targets. */
  readonly govIndex: number;
}

/** Naming or navigating the garrison's active tactic. */
export interface GameGarrisonTacticRequest {
  /** The element the game gives the garrison panel. */
  readonly elementId: string;

  /** The tactic index to name or move to. */
  readonly tactic: number;
}

/** Attacking an enemy fortress visible in the underworld. */
export interface GameGarrisonFortressRequest {
  /** The element the game gives the underworld fortress. */
  readonly elementId: string;

  /** The enemy fortress to attack. */
  readonly enemyIndex: number;
}

export interface GameGarrisonControlsPort {
  /** Whether the game currently renders the panel's control. */
  isRendered(elementId: string): boolean;

  /**
   * Launches a campaign against the foreign power. False means the garrison
   * panel was not actionable.
   */
  launchCampaign(request: GameGarrisonCampaignRequest): boolean;

  /**
   * Hires a mercenary into the garrison. False means the garrison panel was
   * not actionable.
   */
  hire(elementId: string): boolean;

  /**
   * Moves the garrison's active tactic to the target index. False means the
   * garrison panel was not actionable or its tactic could not be read.
   */
  setTactic(request: GameGarrisonTacticRequest): boolean;

  /**
   * The name of the garrison's tactic at the index, for the attack log. Null
   * when the garrison panel cannot answer.
   */
  campaignTitle(request: GameGarrisonTacticRequest): string | null;

  /** Adds battalion steps to the campaign army. */
  addBattalions(request: GameGarrisonCountRequest): boolean;

  /** Removes battalion steps from the campaign army. */
  removeBattalions(request: GameGarrisonCountRequest): boolean;

  /** Adds soldiers to the underworld fortress garrison. */
  addHellSoldiers(request: GameGarrisonCountRequest): boolean;

  /** Removes soldiers from the underworld fortress garrison. */
  removeHellSoldiers(request: GameGarrisonCountRequest): boolean;

  /** Adds patrols to the underworld fortress. */
  addHellPatrols(request: GameGarrisonCountRequest): boolean;

  /** Removes patrols from the underworld fortress. */
  removeHellPatrols(request: GameGarrisonCountRequest): boolean;

  /** Enlarges the underworld fortress's patrol size. */
  addHellPatrolSize(request: GameGarrisonCountRequest): boolean;

  /** Shrinks the underworld fortress's patrol size. */
  removeHellPatrolSize(request: GameGarrisonCountRequest): boolean;

  /**
   * Attacks an enemy fortress visible in the underworld. False means the
   * fortress panel was not actionable.
   */
  attackFortress(request: GameGarrisonFortressRequest): boolean;
}
