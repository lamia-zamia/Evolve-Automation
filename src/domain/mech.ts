export interface MechSummary {
  readonly id: number;
  readonly size: string;
  readonly infernal: boolean;
  readonly power: number;
  readonly efficiency: number;
}

export interface MechCycleInput {
  readonly available: boolean;
  readonly prolongActive: boolean;
  readonly savingSupply: boolean;
  readonly totalMechs: number;
  readonly activeMechs: readonly MechSummary[];
  readonly inactiveMechs: readonly MechSummary[];
  readonly hasTask: boolean;
  readonly buildMode: string;
}

export interface MechCycleDecision {
  readonly kind: "prepare-mech-cycle";
  readonly prolongActive: boolean;
  readonly savingSupply: boolean;
  readonly proceed: boolean;
  readonly drag: { readonly oldId: number; readonly newId: number } | null;
}

export interface MechDesign {
  readonly token: string;
  readonly size: string;
  readonly power: number;
  readonly efficiency: number;
}

export interface MechCost {
  readonly gems: number;
  readonly supply: number;
  readonly space: number;
}

export interface MechResourceInput {
  readonly current: number;
  readonly maximum: number;
  readonly spare: number;
  readonly spareMaximum: number;
  readonly rate: number;
  readonly storageRatio: number;
}

export interface MechScrapCandidate extends MechSummary {
  readonly bestPower: number;
  readonly gemRefund: number;
  readonly supplyRefund: number;
  readonly space: number;
}

export interface MechPlanningInput {
  readonly design: MechDesign;
  readonly cost: MechCost;
  readonly forceBuild: boolean;
  readonly prolongActive: boolean;
  readonly savingSupply: boolean;
  readonly fillBay: boolean;
  readonly baySpace: number;
  readonly bayMaximum: number;
  readonly scouts: number;
  readonly sizeOrder: readonly string[];
  readonly supply: MechResourceInput;
  readonly gems: MechResourceInput;
  readonly lastFloor: boolean;
  readonly canExpandBay: boolean;
  readonly configuredScrapMode: string;
  readonly waygateActiveCount: number;
  readonly minimumSupplyRate: number;
  readonly saveSupplyRatio: number;
  readonly scrapEfficiency: number;
  readonly scoutsRatio: number;
  readonly rebuildScouts: boolean;
  readonly mechsPower: number;
  readonly timeToClear: number;
  readonly activeMechs: readonly MechScrapCandidate[];
}

export interface MechScrapDecision {
  readonly ids: readonly number[];
  readonly supplyGained: number;
  readonly gemsGained: number;
  readonly spaceGained: number;
  readonly averageRating: number;
}

export interface MechContinuation {
  readonly kind: "continue-mech-cycle";
  readonly scrap: MechScrapDecision | null;
  readonly halt: boolean;
  readonly trySmaller: boolean;
  readonly baySpace: number;
  readonly supplyCurrent: number;
  readonly supplySpare: number;
  readonly gemsCurrent: number;
  readonly gemsSpare: number;
  readonly supplyMaximum: number;
  readonly prolongActive: boolean;
}

export interface MechBuildDecision {
  readonly kind: "build-mech";
  readonly designToken: string;
  readonly cost: MechCost;
  readonly prolongActive: boolean;
}

export function planMechCycle(
  input: Readonly<MechCycleInput>,
): Readonly<MechCycleDecision> | null {
  if (!input.available) return null;
  let drag: MechCycleDecision["drag"] = null;
  if (input.inactiveMechs.length > 0 && input.activeMechs.length > 0) {
    const active = [...input.activeMechs].sort(
      (left, right) => left.efficiency - right.efficiency,
    );
    const inactive = [...input.inactiveMechs].sort(
      (left, right) => right.efficiency - left.efficiency,
    );
    const worstActive = active[0];
    const bestInactive = inactive[0];
    if (
      worstActive !== undefined &&
      bestInactive !== undefined &&
      worstActive.efficiency < bestInactive.efficiency
    ) {
      drag = Object.freeze({
        oldId:
          active.length > inactive.length ? worstActive.id : bestInactive.id,
        newId: active.length > inactive.length ? input.totalMechs - 1 : 0,
      });
    }
  }
  return Object.freeze({
    kind: "prepare-mech-cycle",
    prolongActive: input.prolongActive,
    savingSupply: input.savingSupply,
    proceed:
      input.inactiveMechs.length === 0 &&
      !input.hasTask &&
      (input.buildMode === "random" || input.buildMode === "user"),
    drag,
  });
}

export function shouldSaveMechSupply(input: {
  readonly saveSupplyRatio: number;
  readonly lastFloor: boolean;
  readonly forceBuild: boolean;
  readonly supplyMaximum: number;
  readonly supplyCurrent: number;
  readonly supplyRate: number;
  readonly baySpace: number;
  readonly designSpace: number;
  readonly titanSupplyRefund: number;
  readonly timeToClear: number;
}): boolean {
  if (input.saveSupplyRatio <= 0 || input.lastFloor || input.forceBuild) {
    return false;
  }
  let missing =
    input.supplyMaximum * input.saveSupplyRatio - input.supplyCurrent;
  if (input.baySpace < input.designSpace) {
    missing -= input.titanSupplyRefund;
  }
  return input.timeToClear <= missing / input.supplyRate;
}

export function resolveMechScrapMode(
  input: Pick<
    MechPlanningInput,
    | "canExpandBay"
    | "supply"
    | "prolongActive"
    | "minimumSupplyRate"
    | "configuredScrapMode"
    | "waygateActiveCount"
    | "baySpace"
    | "cost"
    | "saveSupplyRatio"
    | "gems"
    | "mechsPower"
    | "design"
    | "timeToClear"
    | "lastFloor"
  >,
): string {
  if (
    input.canExpandBay &&
    input.supply.current < input.supply.maximum &&
    !input.prolongActive &&
    input.supply.rate >= input.minimumSupplyRate
  ) {
    return "none";
  }
  if (input.configuredScrapMode !== "mixed") {
    return input.configuredScrapMode;
  }
  if (input.waygateActiveCount === 1) return "single";
  const mechToBuild = Math.floor(input.baySpace / input.cost.space);
  const supplyCost =
    mechToBuild * input.cost.supply +
    input.supply.maximum * input.saveSupplyRatio;
  const timeToFullBay = Math.max(
    (supplyCost - input.supply.current) / input.supply.rate,
    (mechToBuild * input.cost.gems - input.gems.current) / input.gems.rate,
  );
  const estimatedTotalPower =
    input.mechsPower + mechToBuild * input.design.power;
  const estimatedTimeToClear =
    input.timeToClear * (input.mechsPower / estimatedTotalPower);
  return timeToFullBay > estimatedTimeToClear && !input.lastFloor
    ? "single"
    : "all";
}

export function shouldReadMechScrapCandidates(
  input: Readonly<MechPlanningInput>,
): boolean {
  const mode = resolveMechScrapMode(input);
  return (
    input.cost.supply < input.supply.spareMaximum &&
    ((mode === "single" && input.baySpace < input.cost.space) ||
      (mode === "all" &&
        (input.baySpace < input.cost.space ||
          input.supply.spare < input.cost.supply ||
          input.gems.spare < input.cost.gems)))
  );
}

export function planMechContinuation(
  input: Readonly<MechPlanningInput>,
): Readonly<MechContinuation> {
  const scrapMode = resolveMechScrapMode(input);
  let scrap: MechScrapDecision | null = null;
  let waitForReplacement = false;
  let spaceGained = 0;
  let supplyGained = 0;
  let gemsGained = 0;

  if (shouldReadMechScrapCandidates(input)) {
    const threshold =
      (input.fillBay
        ? input.baySpace === 0
        : input.baySpace < input.cost.space) &&
      input.supply.storageRatio > 0.9 &&
      !input.savingSupply
        ? 0
        : input.lastFloor
          ? Math.min(input.scrapEfficiency, 1)
          : input.scrapEfficiency;
    const candidates = input.activeMechs
      .filter((mech) => {
        if (
          (mech.infernal && mech.size !== "collector") ||
          mech.power >= mech.bestPower
        ) {
          return false;
        }
        if (input.forceBuild) return true;
        const costRatio = Math.min(
          (mech.gemRefund || 0.5) / input.cost.gems,
          mech.supplyRefund / input.cost.supply,
        );
        return costRatio / (mech.power / input.design.power) > threshold;
      })
      .sort((left, right) => left.efficiency - right.efficiency);
    let extraScouts = input.rebuildScouts
      ? Number.MAX_SAFE_INTEGER
      : input.scouts - (input.bayMaximum * input.scoutsRatio) / 2;
    const trash: MechScrapCandidate[] = [];
    let powerLost = 0;
    for (
      let index = 0;
      index < candidates.length &&
      (input.baySpace + spaceGained < input.cost.space ||
        (scrapMode === "all" &&
          (input.supply.spare + supplyGained < input.cost.supply ||
            input.gems.spare + gemsGained < input.cost.gems)));
      index++
    ) {
      const mech = candidates[index];
      if (mech === undefined) continue;
      if (mech.size === "small") {
        if (extraScouts < 1) continue;
        extraScouts--;
      }
      spaceGained += mech.space;
      supplyGained += mech.supplyRefund;
      gemsGained += mech.gemRefund;
      powerLost += mech.power;
      trash.push(mech);
    }
    const enoughForReplacement =
      input.baySpace + spaceGained >= input.cost.space &&
      input.supply.spare + supplyGained >= input.cost.supply &&
      input.gems.spare + gemsGained >= input.cost.gems;
    if (
      trash.length > 0 &&
      (input.forceBuild || powerLost / spaceGained < input.design.efficiency) &&
      enoughForReplacement
    ) {
      const sorted = [...trash].sort((left, right) => right.id - left.id);
      scrap = Object.freeze({
        ids: Object.freeze(sorted.map((mech) => mech.id)),
        supplyGained,
        gemsGained,
        spaceGained,
        averageRating:
          sorted.reduce((sum, mech) => sum + mech.power / mech.bestPower, 0) /
          sorted.length,
      });
    } else if (input.baySpace + spaceGained >= input.cost.space) {
      waitForReplacement = true;
      spaceGained = 0;
      supplyGained = 0;
      gemsGained = 0;
    } else {
      spaceGained = 0;
      supplyGained = 0;
      gemsGained = 0;
    }
  }

  const baySpace = input.baySpace + spaceGained;
  return Object.freeze({
    kind: "continue-mech-cycle",
    scrap,
    halt: waitForReplacement,
    trySmaller:
      !waitForReplacement &&
      input.fillBay &&
      !input.savingSupply &&
      ((!input.canExpandBay && baySpace < input.cost.space) ||
        input.supply.maximum < input.cost.supply),
    baySpace,
    supplyCurrent: Math.min(
      input.supply.current + supplyGained,
      input.supply.maximum,
    ),
    supplySpare: input.supply.spare + supplyGained,
    gemsCurrent: input.gems.current + gemsGained,
    gemsSpare: input.gems.spare + gemsGained,
    supplyMaximum: input.supply.maximum,
    prolongActive: input.prolongActive,
  });
}

export function smallerMechFits(
  continuation: Readonly<MechContinuation>,
  cost: Readonly<MechCost>,
): boolean {
  return (
    cost.space <= continuation.baySpace &&
    cost.supply <= continuation.supplyMaximum
  );
}

export function planMechBuild(
  continuation: Readonly<MechContinuation>,
  design: Readonly<MechDesign>,
  cost: Readonly<MechCost>,
): Readonly<MechBuildDecision> | null {
  if (
    continuation.halt ||
    continuation.gemsSpare < cost.gems ||
    continuation.supplySpare < cost.supply ||
    continuation.baySpace < cost.space
  ) {
    return null;
  }
  return Object.freeze({
    kind: "build-mech",
    designToken: design.token,
    cost: Object.freeze({ ...cost }),
    prolongActive: continuation.prolongActive,
  });
}
