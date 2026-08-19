import assert from "node:assert/strict";
import { planForeignAchievementGoal } from "../src/domain/combat/foreign-achievements.ts";

const neutral = () => ({ occupied: false, annexed: false, purchased: false });
const states = () => [neutral(), neutral(), neutral()];

const base = {
  guardWorldDomination: true,
  guardSyndicate: true,
  worldDominationUnlocked: false,
  syndicateUnlocked: false,
  pacifistGuardActive: false,
  foreignStates: states(),
};

assert.equal(planForeignAchievementGoal(base), "world-domination");
assert.equal(
  planForeignAchievementGoal({
    ...base,
    foreignStates: [{ ...neutral(), occupied: true }, neutral(), neutral()],
  }),
  "world-domination",
);
assert.equal(
  planForeignAchievementGoal({
    ...base,
    foreignStates: [{ ...neutral(), purchased: true }, neutral(), neutral()],
  }),
  "syndicate",
);
assert.equal(
  planForeignAchievementGoal({
    ...base,
    worldDominationUnlocked: true,
  }),
  "syndicate",
);
assert.equal(
  planForeignAchievementGoal({
    ...base,
    foreignStates: [{ ...neutral(), annexed: true }, neutral(), neutral()],
  }),
  null,
);
assert.equal(
  planForeignAchievementGoal({
    ...base,
    foreignStates: [
      { ...neutral(), occupied: true },
      { ...neutral(), purchased: true },
      neutral(),
    ],
  }),
  null,
);
assert.equal(
  planForeignAchievementGoal({ ...base, guardWorldDomination: false }),
  "syndicate",
);
assert.equal(
  planForeignAchievementGoal({ ...base, guardSyndicate: false }),
  "world-domination",
);
assert.equal(
  planForeignAchievementGoal({
    ...base,
    guardWorldDomination: false,
    guardSyndicate: false,
  }),
  null,
);

// World Domination needs every city occupied, and occupation needs an attack,
// so an armed Pacifist guard must leave the clean slate to Syndicate instead of
// pinning every government to a policy the guard forbids acting on.
assert.equal(
  planForeignAchievementGoal({ ...base, pacifistGuardActive: true }),
  "syndicate",
);
assert.equal(
  planForeignAchievementGoal({
    ...base,
    pacifistGuardActive: true,
    guardSyndicate: false,
  }),
  null,
);
assert.equal(
  planForeignAchievementGoal({
    ...base,
    pacifistGuardActive: true,
    syndicateUnlocked: true,
  }),
  null,
);

console.log("Foreign achievement domain tests passed");
