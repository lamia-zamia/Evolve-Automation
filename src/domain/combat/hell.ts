export interface HellCycleInput {
  readonly available: boolean;
  readonly warlord: boolean;
  readonly enemies: number;
  readonly minions: number;
  readonly handleEnemyFortress: boolean;
  readonly minimumMinions: number;
  readonly maximumSoldiers: number;
  readonly currentSoldiers: number;
  readonly currentCityGarrison: number;
  readonly maximumCityGarrison: number;
  readonly hellSoldiers: number;
  readonly hellPatrols: number;
  readonly hellPatrolSize: number;
  readonly hellAssigned: number;
  readonly hellReservedSoldiers: number;
  readonly currentHellGarrison: number;
  readonly homeGarrison: number;
  readonly minimumHellSoldiers: number;
  readonly minimumSoldierPercent: number;
  readonly elysiumUnlocked: boolean;
  readonly fortressWalls: number;
  readonly fortressThreat: number;
  readonly lowWallsMultiplier: number;
  readonly targetFortressDamage: number;
  readonly turretCount: number;
  readonly turretTechnology: number;
  readonly handlePatrolSize: boolean;
  readonly patrolThreatPercent: number;
  readonly patrolDroneModifier: number;
  readonly patrolDroidModifier: number;
  readonly patrolBootcampModifier: number;
  readonly minimumPatrolRating: number;
  readonly bolsterPatrolRating: number;
  readonly bolsterPercentTop: number;
  readonly bolsterPercentBottom: number;
  readonly warDroneCount: number;
  readonly portalTechnology: number;
  readonly warDroidCount: number;
  readonly hellDroidTechnology: boolean;
  readonly bootCampCount: number;
  readonly manageAuthority: boolean;
  readonly minimumAuthority: number;
  readonly minimumAuthorityPatrolPercent: number;
  readonly evilTechnology: number;
  readonly grenadier: boolean;
  readonly government: string;
}

export type HellAdjustmentKind =
  | "remove-patrol-size"
  | "remove-patrol"
  | "remove-garrison"
  | "add-garrison"
  | "add-patrol-size"
  | "add-patrol";

export interface HellAdjustmentCommand {
  readonly kind: HellAdjustmentKind;
  readonly count: number;
}

export interface HellManageDecision {
  readonly kind: "manage-hell";
  readonly commands: readonly HellAdjustmentCommand[];
  readonly authorityAdjusted: boolean;
  readonly authorityDebug: HellAuthorityDebug | null;
}

export interface HellAttackDecision {
  readonly kind: "attack-enemy-fortress";
  readonly enemyIndex: 0;
}

export type HellDecision = HellManageDecision | HellAttackDecision;

export interface HellTargetRequest {
  readonly kind: "calculate-hell-targets";
  readonly input: Readonly<HellCycleInput>;
  readonly targetHellSoldiers: number;
  readonly availableHellSoldiers: number;
  readonly garrisonRating: number;
  readonly patrolRating: number | null;
}

export interface HellSoldierTargets {
  readonly garrisonSoldiers: number;
  readonly patrolSoldiers: number;
}

export interface HellAuthorityInput {
  readonly unlocked: boolean;
  readonly current: number;
  readonly maximum: number;
  readonly scriptTick: number;
  readonly debugEnabled: boolean;
}

export interface HellCalculationInput extends HellSoldierTargets {
  readonly authority: Readonly<HellAuthorityInput>;
}

export interface HellBaseTargets {
  readonly hellGarrison: number;
  readonly patrolSize: number;
}

export interface HellAuthorityDebug {
  readonly amount: number;
  readonly target: number;
  readonly perSoldier: number;
  readonly currentStationed: number;
  readonly neededStationed: number;
  readonly defenseGarrison: number;
  readonly authorityGarrison: number;
  readonly maximumStationed: number;
  readonly patrolReserve: number;
  readonly patrolSize: number;
  readonly availableSoldiers: number;
}

function freezeCommands(
  commands: readonly HellAdjustmentCommand[],
): readonly HellAdjustmentCommand[] {
  return Object.freeze(commands.map((command) => Object.freeze(command)));
}

function manageDecision(
  commands: readonly HellAdjustmentCommand[],
  authorityAdjusted = false,
  authorityDebug: HellAuthorityDebug | null = null,
): Readonly<HellManageDecision> | null {
  if (commands.length === 0 && !authorityAdjusted && authorityDebug === null) {
    return null;
  }
  return Object.freeze({
    kind: "manage-hell",
    commands: freezeCommands(commands),
    authorityAdjusted,
    authorityDebug:
      authorityDebug === null ? null : Object.freeze(authorityDebug),
  });
}

function adjustmentCommands(
  input: Readonly<HellCycleInput>,
  targetSoldiers: number,
  targetPatrols: number,
  targetPatrolSize: number,
): readonly HellAdjustmentCommand[] {
  const commands: HellAdjustmentCommand[] = [];
  if (input.handlePatrolSize && input.hellPatrolSize > targetPatrolSize) {
    commands.push({
      kind: "remove-patrol-size",
      count: input.hellPatrolSize - targetPatrolSize,
    });
  }
  if (input.hellPatrols > targetPatrols) {
    commands.push({
      kind: "remove-patrol",
      count: input.hellPatrols - targetPatrols,
    });
  }
  if (input.hellSoldiers > targetSoldiers) {
    commands.push({
      kind: "remove-garrison",
      count: input.hellSoldiers - targetSoldiers,
    });
  }
  if (input.hellSoldiers < targetSoldiers) {
    commands.push({
      kind: "add-garrison",
      count: targetSoldiers - input.hellSoldiers,
    });
  }
  if (input.handlePatrolSize && input.hellPatrolSize < targetPatrolSize) {
    commands.push({
      kind: "add-patrol-size",
      count: targetPatrolSize - input.hellPatrolSize,
    });
  }
  if (input.hellPatrols < targetPatrols) {
    commands.push({
      kind: "add-patrol",
      count: targetPatrols - input.hellPatrols,
    });
  }
  return commands;
}

function calculatePatrolRating(input: Readonly<HellCycleInput>): number {
  let rating = (input.fortressThreat * input.patrolThreatPercent) / 100;
  rating -=
    input.patrolDroneModifier *
    input.warDroneCount *
    (input.portalTechnology >= 7 ? 1.5 : 1);
  rating -=
    input.patrolDroidModifier *
    input.warDroidCount *
    (input.hellDroidTechnology ? 2 : 1);
  rating -= input.patrolBootcampModifier * input.bootCampCount;
  rating = Math.max(rating, input.minimumPatrolRating);

  if (input.bolsterPatrolRating > 0 && input.bolsterPercentTop > 0) {
    const fillRatio = input.currentCityGarrison / input.maximumCityGarrison;
    if (fillRatio <= input.bolsterPercentTop / 100) {
      if (fillRatio <= input.bolsterPercentBottom / 100) {
        rating += input.bolsterPatrolRating;
      } else if (input.bolsterPercentBottom < input.bolsterPercentTop) {
        rating +=
          ((input.bolsterPatrolRating *
            (input.bolsterPercentTop / 100 - fillRatio)) /
            (input.bolsterPercentTop - input.bolsterPercentBottom)) *
          100;
      }
    }
  }
  return rating;
}

export function prepareHellCycle(
  input: Readonly<HellCycleInput>,
): Readonly<HellDecision> | Readonly<HellTargetRequest> | null {
  if (!input.available) return null;
  if (input.warlord) {
    return input.enemies > 0 &&
      input.handleEnemyFortress &&
      input.minions > input.minimumMinions
      ? Object.freeze({ kind: "attack-enemy-fortress", enemyIndex: 0 })
      : null;
  }

  let homeSoldiers = input.homeGarrison;
  if (input.elysiumUnlocked && homeSoldiers < 100) homeSoldiers = 100;
  const canEnter =
    input.maximumSoldiers > homeSoldiers + input.minimumHellSoldiers &&
    (input.hellSoldiers > input.minimumHellSoldiers ||
      input.currentSoldiers >=
        (input.maximumSoldiers * input.minimumSoldierPercent) / 100);
  if (!canEnter) {
    if (input.hellAssigned > 0) {
      return manageDecision([
        { kind: "remove-patrol-size", count: input.hellPatrolSize },
        { kind: "remove-patrol", count: input.hellPatrols },
        { kind: "remove-garrison", count: input.hellSoldiers },
      ]);
    }
    return manageDecision(adjustmentCommands(input, 0, 0, 0));
  }

  const targetHellSoldiers =
    Math.min(input.currentSoldiers, input.maximumSoldiers) - homeSoldiers;
  const availableHellSoldiers = targetHellSoldiers - input.hellReservedSoldiers;
  const wallMultiplier =
    input.lowWallsMultiplier * (1 - input.fortressWalls / 100);
  const targetDefense =
    (input.fortressThreat * 35) / input.targetFortressDamage;
  const turretPower =
    input.turretCount *
    (input.turretTechnology ? (input.turretTechnology >= 2 ? 70 : 50) : 35);
  return Object.freeze({
    kind: "calculate-hell-targets",
    input,
    targetHellSoldiers,
    availableHellSoldiers,
    garrisonRating: Math.max(0, wallMultiplier * targetDefense - turretPower),
    patrolRating: input.handlePatrolSize ? calculatePatrolRating(input) : null,
  });
}

export function calculateHellBaseTargets(
  request: Readonly<HellTargetRequest>,
  targets: Readonly<HellSoldierTargets>,
): Readonly<HellBaseTargets> {
  let hellGarrison = targets.garrisonSoldiers;
  if (request.availableHellSoldiers < hellGarrison) {
    hellGarrison = 0;
  } else if (request.availableHellSoldiers < hellGarrison * 2) {
    hellGarrison = Math.floor(request.availableHellSoldiers / 2);
  }
  const patrolSize = request.input.handlePatrolSize
    ? Math.min(
        targets.patrolSoldiers,
        request.availableHellSoldiers - hellGarrison,
      )
    : request.input.hellPatrolSize;
  return Object.freeze({ hellGarrison, patrolSize });
}

export function planHell(
  request: Readonly<HellTargetRequest>,
  calculated: Readonly<HellCalculationInput>,
): Readonly<HellManageDecision> | null {
  const input = request.input;
  const base = calculateHellBaseTargets(request, calculated);
  let hellGarrison = base.hellGarrison;
  let patrolSize = base.patrolSize;
  let authorityAdjusted = false;
  let authorityDebug: HellAuthorityDebug | null = null;

  if (
    input.manageAuthority &&
    input.minimumAuthority !== 0 &&
    calculated.authority.unlocked &&
    patrolSize > 0
  ) {
    let perSoldier = 0.7 + 0.1 * input.evilTechnology;
    if (input.grenadier) perSoldier *= 1.75;
    if (input.government === "autocracy") perSoldier *= 1.08;
    else if (input.government === "dictator") perSoldier *= 1.12;
    const authorityTarget =
      input.minimumAuthority < 0
        ? calculated.authority.maximum
        : input.minimumAuthority;
    const deficit = authorityTarget - calculated.authority.current;
    const neededStationed =
      input.currentHellGarrison + Math.ceil(deficit / perSoldier);
    let patrolReserve = 1;
    if (input.minimumAuthority < 0 && input.minimumAuthorityPatrolPercent > 0) {
      patrolReserve = Math.min(
        request.availableHellSoldiers,
        Math.ceil(
          (request.availableHellSoldiers *
            input.minimumAuthorityPatrolPercent) /
            100,
        ),
      );
    }
    const maximumStationed = Math.max(
      0,
      request.availableHellSoldiers - patrolReserve,
    );
    const authorityGarrison = Math.max(
      hellGarrison,
      Math.min(neededStationed, maximumStationed),
    );
    patrolSize = Math.min(
      patrolSize,
      Math.max(1, request.availableHellSoldiers - authorityGarrison),
    );
    authorityAdjusted = authorityGarrison !== input.currentHellGarrison;
    if (
      calculated.authority.debugEnabled &&
      authorityGarrison !== hellGarrison
    ) {
      authorityDebug = {
        amount: calculated.authority.current,
        target: authorityTarget,
        perSoldier,
        currentStationed: input.currentHellGarrison,
        neededStationed,
        defenseGarrison: hellGarrison,
        authorityGarrison,
        maximumStationed,
        patrolReserve,
        patrolSize,
        availableSoldiers: request.availableHellSoldiers,
      };
    }
    hellGarrison = authorityGarrison;
  }

  let targetPatrols = Math.max(
    1,
    Math.floor((request.availableHellSoldiers - hellGarrison) / patrolSize),
  );
  if (input.handlePatrolSize && targetPatrols === 1) {
    const availableForPatrol = request.availableHellSoldiers - hellGarrison;
    if (availableForPatrol >= 1.5 * patrolSize) {
      patrolSize = Math.floor(availableForPatrol / 3);
      targetPatrols = Math.floor(availableForPatrol / patrolSize);
    }
  }
  return manageDecision(
    adjustmentCommands(
      input,
      request.targetHellSoldiers,
      targetPatrols,
      patrolSize,
    ),
    authorityAdjusted,
    authorityDebug,
  );
}
