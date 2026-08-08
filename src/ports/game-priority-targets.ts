/**
 * The game's live priority-target surface: the building and research queues,
 * the next outer-fleet ship, the mech bay and its preferred next design, the
 * active trigger actions, and the tech tab's rendered action buttons.
 *
 * Every read returns normalized values sampled once, so the planner above this
 * port stays a pure function over its inputs. The jQuery `#tech .action` sweep
 * is owned here: the game reads tech actions through the DOM, and nothing above
 * this port should reach into it.
 */
export type GameQueueKind = "queue" | "r_queue";

export interface GameQueueRead {
  /** Whether the game currently shows this queue. */
  readonly display: boolean;
  /** The raw queue items. A hidden queue may still hold entries. */
  readonly items: readonly unknown[];
  /** Whether the noorder setting for this queue is enabled. */
  readonly noorder: boolean;
}

export interface GameMechBayRead {
  readonly max: number;
  readonly bay: number;
  readonly blueprintSize: string;
}

export interface GameOuterFleetNextShip {
  readonly affordable: boolean;
  readonly name: string;
  readonly cost: Readonly<Record<string, number>>;
}

export interface GameTriggerRead {
  readonly actionId: string;
}

export interface GamePriorityTargetsPort {
  readQueue(kind: GameQueueKind): GameQueueRead;
  readSpyPurchaseMoney(): number;
  readOuterFleetNextShip(): GameOuterFleetNextShip;
  readMechBay(): GameMechBayRead;
  /** Whether the mech lab is built and rendered; sampled once per cycle. */
  readMechLabReady(): boolean;
  /**
   * The preferred next design size the game would build. Only meaningful after
   * `readMechLabReady()` returned true; absent when the game offers no taste.
   * A forced mech (`titan`) and a fixed `mechBuild` skip this read entirely.
   */
  readMechPreferredSize(): string | undefined;
  /** The design's build cost elements; the first entry is the gem cost. */
  readMechCost(size: string): number;
  readTriggerTargets(): readonly GameTriggerRead[];
  resetTargetTriggers(): void;
  readTechActionIds(): readonly string[];
}
