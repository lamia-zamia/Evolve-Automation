import assert from "node:assert/strict";

import {
  createCapturedTriggers,
  triggersNeedGrantedTechs,
} from "../src/adapters/evolve/progression/build/captured-triggers.ts";

const root = {
  race: { species: "human" },
  city: {
    farm: { count: 3 },
    mine: { count: 0 },
    apartment: { count: 0 },
  },
  civic: {
    farmer: { workers: 3, max: 5, display: true },
  },
  arpa: { launch_facility: { rank: 0, complete: 10 } },
  resource: {
    Money: { amount: 500, max: 100000, display: true },
    Lumber: { amount: 100, max: 5000, display: true },
    Knowledge: { amount: 50, max: 1000, display: true },
    Stone: { amount: 0, max: 60, display: true },
  },
};

const COSTS = {
  "city-mine": { Money: 60, Lumber: 175 },
  "city-apartment": { Money: 875, Lumber: 600 },
  "city-amphitheatre": { Money: 500, Stone: 200 },
};

const OFFERED = [
  { elementId: "tech-mad", cost: { Knowledge: 600 }, generation: 1 },
];

const PROJECTS = [
  {
    elementId: "arpalaunch_facility",
    projectId: "launch_facility",
    rank: 0,
    progress: 10,
    cost: { Money: 100, Lumber: 50 },
    generation: 3,
  },
];

const ARPA_TARGET = {
  actionId: "arpalaunch_facility",
  actionType: "arpa",
  cost: { Money: 9000, Lumber: 4500 },
  projectId: "launch_facility",
  steps: 90,
  progress: 10,
  generation: 3,
};

function trigger(overrides = {}) {
  return {
    seq: 0,
    priority: 0,
    requirementType: "BuildingCount",
    requirementId: "city-farm",
    requirementCount: 3,
    actionType: "build",
    actionId: "city-mine",
    actionCount: 1,
    ...overrides,
  };
}

function triggers({
  settings = {},
  triggers: rows = [],
  rootValue = root,
  offered = OFFERED,
  granted,
  projects = PROJECTS,
  readOfferedProjects,
  readBuildingUnlocks,
  costs,
  controls,
} = {}) {
  const offeredProjects = projects === null ? undefined : projects;
  return createCapturedTriggers({
    rootState: { readRoot: () => rootValue },
    controls: controls ?? {
      resolve: (elementId) =>
        elementId in COSTS ||
        (offeredProjects ?? []).some(
          (project) => project.elementId === elementId,
        )
          ? { elementId, generation: 1, methods: [] }
          : undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => Object.keys(COSTS),
    },
    costs: { readCost: costs ?? ((actionId) => COSTS[actionId]) },
    readSettings: () => ({ autoTrigger: true, triggers: rows, ...settings }),
    readOfferedTechs: () => (offered === null ? undefined : offered),
    readGrantedTechs: () => granted,
    readOfferedProjects: readOfferedProjects ?? (() => offeredProjects),
    ...(readBuildingUnlocks === undefined ? {} : { readBuildingUnlocks }),
  });
}

// A met requirement makes the action a target, at the game's own current cost.
assert.deepEqual(triggers({ triggers: [trigger()] }).read(), [
  { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
]);

// The feature is off unless the player turned it on.
assert.deepEqual(
  triggers({ triggers: [trigger()], settings: { autoTrigger: false } }).read(),
  [],
);
assert.deepEqual(triggers({ triggers: [] }).read(), []);

// An unmet requirement, and one the captured root cannot answer, both raise no demand.
assert.deepEqual(
  triggers({ triggers: [trigger({ requirementCount: 4 })] }).read(),
  [],
);
// A `ResearchComplete` requirement is answered from the granted half of the research pass, and is
// unanswerable — so the trigger is dropped — when that half was not kept.
const researchRequirement = [
  trigger({
    requirementType: "ResearchComplete",
    requirementId: "tech-mad",
    // A boolean operand matches its stored count rather than exceeding it.
    requirementCount: 1,
  }),
];
assert.deepEqual(triggers({ triggers: researchRequirement }).read(), []);
assert.deepEqual(
  triggers({
    triggers: researchRequirement,
    granted: new Set(["tech-mad"]),
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);
assert.deepEqual(
  triggers({ triggers: researchRequirement, granted: new Set() }).read(),
  [],
);

// Job, governor, and fleet requirements are answered from the captured root.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "JobWorkers",
        requirementId: "farmer",
        requirementCount: 3,
      }),
    ],
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "JobWorkers",
        requirementId: "farmer",
        requirementCount: 4,
      }),
    ],
  }).read(),
  [],
);

// An action the game has already carried out is done with, and so is a malformed row.
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionId: "city-farm", actionCount: 3 })],
  }).read(),
  [],
);
assert.deepEqual(triggers({ triggers: [trigger({ actionId: 7 })] }).read(), []);

// A build action is only possible while the game has built its control and can price it.
assert.deepEqual(
  triggers({
    triggers: [trigger()],
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => [],
    },
  }).read(),
  [],
);
assert.deepEqual(
  triggers({ triggers: [trigger({ actionId: "city-sawmill" })] }).read(),
  [],
);

// A cost that does not fit in current storage is not a target: it could never be paid for.
assert.deepEqual(
  triggers({ triggers: [trigger({ actionId: "city-amphitheatre" })] }).read(),
  [],
);

// Research targets are priced from the offered catalog, and an unoffered technology is unknown.
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionType: "research", actionId: "tech-mad" })],
  }).read(),
  [{ actionId: "tech-mad", actionType: "research", cost: { Knowledge: 600 } }],
);
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionType: "research", actionId: "tech-wheel" })],
  }).read(),
  [],
);
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionType: "research", actionId: "tech-mad" })],
    offered: null,
  }).read(),
  [],
);

// A.R.P.A. triggers buy the whole remaining project at the drawn per-percent price.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ actionType: "arpa", actionId: "arpalaunch_facility" }),
    ],
  }).read(),
  [ARPA_TARGET],
);

// A project the panel is not offering, or whose panel cannot be read, raises no demand.
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionType: "arpa", actionId: "arpalhc" })],
  }).read(),
  [],
);
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ actionType: "arpa", actionId: "arpalaunch_facility" }),
    ],
    projects: null,
  }).read(),
  [],
);

// A project whose whole remaining cost does not fit in storage is not a target.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ actionType: "arpa", actionId: "arpalaunch_facility" }),
    ],
    projects: [
      {
        elementId: "arpalaunch_facility",
        projectId: "launch_facility",
        rank: 0,
        progress: 10,
        cost: { Money: 100, Lumber: 60 },
        generation: 3,
      },
    ],
  }).read(),
  [],
);

// A project already at its configured rank is done, like a finished building count.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        actionType: "arpa",
        actionId: "arpalaunch_facility",
        actionCount: 0,
      }),
    ],
  }).read(),
  [],
);

// A project whose control was never captured is not one the executor could press.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ actionType: "arpa", actionId: "arpalaunch_facility" }),
    ],
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => [],
    },
  }).read(),
  [],
);

// The project panel stays undrawn when no configured trigger names an A.R.P.A. action.
assert.deepEqual(
  triggers({
    triggers: [trigger()],
    readOfferedProjects: () => {
      throw new Error("the panel must not be drawn without an arpa trigger");
    },
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);

// A `ProjectUnlocked` condition needs the same panel, so it draws it on its own.
const projectUnlockedTrigger = [
  trigger({
    requirementType: "ProjectUnlocked",
    requirementId: "arpalaunch_facility",
    requirementCount: 1,
  }),
];
assert.deepEqual(triggers({ triggers: projectUnlockedTrigger }).read(), [
  { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
]);
// A project the panel did not draw is not unlocked, which is a real answer: the condition fails
// and the trigger raises no demand.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "ProjectUnlocked",
        requirementId: "arpalhc",
        requirementCount: 1,
      }),
    ],
  }).read(),
  [],
);
// A drawn panel and an unreadable one are not the same thing, which a condition asking for a
// project that is *not* unlocked tells apart: an empty panel answers it, an unread one does not.
const projectLockedTrigger = [
  trigger({
    requirementType: "ProjectUnlocked",
    requirementId: "arpalaunch_facility",
    requirementCount: 0,
  }),
];
assert.deepEqual(
  triggers({ triggers: projectLockedTrigger, projects: [] }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);
assert.deepEqual(
  triggers({ triggers: projectLockedTrigger, projects: null }).read(),
  [],
);

// --- BuildingAffordable conditions are priced from the cycle's cost reader --

// A named building is priced once for the condition pass however many rows name it, and the
// answer is the game's storage-capacity comparison over that price.
{
  const asked = [];
  const result = triggers({
    triggers: [
      trigger({
        priority: 0,
        requirementType: "BuildingAffordable",
        requirementId: "city-apartment",
        requirementCount: 1,
        actionId: "city-mine",
      }),
      trigger({
        priority: 1,
        requirementType: "BuildingAffordable",
        requirementId: "city-apartment",
        requirementCount: 1,
        actionId: "city-amphitheatre",
      }),
    ],
    costs: (actionId) => {
      asked.push(actionId);
      return COSTS[actionId];
    },
  }).read();
  // Both rows name the same building, and the condition pass prices it once.
  assert.equal(asked.filter((id) => id === "city-apartment").length, 1);
  // The apartment fits under Money and Lumber capacity, so both conditions hold; `city-mine`
  // then claims Money and Lumber and the amphitheatre loses the ordinary conflict on Money.
  assert.deepEqual(result, [
    { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
  ]);
}

// Stone capacity is 60, well under the 200 the amphitheatre costs, so the condition is a real
// refusal rather than unanswered, and the trigger is dropped.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "BuildingAffordable",
        requirementId: "city-amphitheatre",
        requirementCount: 1,
        actionId: "city-mine",
      }),
    ],
  }).read(),
  [],
);
// Asking for it to be unaffordable is answered, which is what separates a refusal from an
// unanswered pass.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "BuildingAffordable",
        requirementId: "city-amphitheatre",
        requirementCount: 0,
        actionId: "city-mine",
      }),
    ],
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);

// A building whose control the game never bound cannot be probed for a price, so its condition is
// unanswered and the trigger is dropped rather than treated as unaffordable.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "BuildingAffordable",
        requirementId: "space-never_bound",
        requirementCount: 0,
        actionId: "city-mine",
      }),
    ],
  }).read(),
  [],
);

// No cost condition means nothing is priced for one: only the trigger's own action is.
{
  const asked = [];
  triggers({
    triggers: [trigger()],
    costs: (actionId) => {
      asked.push(actionId);
      return COSTS[actionId];
    },
  }).read();
  assert.deepEqual(asked, ["city-mine"]);
}

// --- BuildingUnlocked conditions draw only the regions they name -----------

// The reader is asked for exactly the regions the configured conditions name, and nothing else.
{
  const asked = [];
  const rows = [
    trigger({
      priority: 0,
      requirementType: "BuildingUnlocked",
      requirementId: "city-bank",
      requirementCount: 1,
      actionId: "city-mine",
    }),
    trigger({
      priority: 1,
      requirementType: "BuildingUnlocked",
      requirementId: "portal-carport",
      requirementCount: 1,
      actionId: "city-apartment",
    }),
    // A requirement on something other than a building adds no region to the pass.
    trigger({ priority: 2, actionId: "city-amphitheatre" }),
  ];
  const result = triggers({
    triggers: rows,
    readBuildingUnlocks: (regions) => {
      asked.push([...regions].sort());
      return {
        unlocked: new Set(["city-bank"]),
        regions: new Set(["city"]),
      };
    },
  }).read();
  // Only the two building regions the conditions name, asked for in one pass. The third row's
  // `BuildingCount` requirement needs no panel and adds no region.
  assert.deepEqual(asked, [["city", "portal"]]);
  // The city condition is answered from the sample, so `city-mine` is a target. The portal one
  // names a region the sample could not speak for, so that trigger is dropped rather than treated
  // as locked — and `city-amphitheatre` then loses the ordinary cost conflict on Money.
  assert.deepEqual(result, [
    { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
  ]);
}

// No BuildingUnlocked condition means no panel is drawn at all.
assert.deepEqual(
  triggers({
    triggers: [trigger()],
    readBuildingUnlocks: () => {
      throw new Error(
        "must not draw a region panel without a building condition",
      );
    },
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);

// A drawn region that did not draw the building answers a real false, which a condition asking for
// the building to be absent tells apart from an unanswered one.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "BuildingUnlocked",
        requirementId: "city-bank",
        requirementCount: 0,
        actionId: "city-mine",
      }),
    ],
    readBuildingUnlocks: () => ({
      unlocked: new Set(["city-farm"]),
      regions: new Set(["city"]),
    }),
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);
// An unreadable pass leaves it unanswered, so the same trigger is dropped.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "BuildingUnlocked",
        requirementId: "city-bank",
        requirementCount: 0,
        actionId: "city-mine",
      }),
    ],
    readBuildingUnlocks: () => undefined,
  }).read(),
  [],
);

// A project trigger competes for its cost resources like any other trigger.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 0, actionId: "city-mine" }),
      trigger({
        priority: 1,
        actionType: "arpa",
        actionId: "arpalaunch_facility",
      }),
    ],
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        priority: 0,
        actionType: "arpa",
        actionId: "arpalaunch_facility",
      }),
      trigger({
        priority: 1,
        actionType: "research",
        actionId: "tech-mad",
      }),
    ],
  }).read(),
  [
    ARPA_TARGET,
    { actionId: "tech-mad", actionType: "research", cost: { Knowledge: 600 } },
  ],
);

// Chained triggers wait for the trigger before them to finish.
const chained = [
  trigger({ priority: 0, actionId: "city-farm", actionCount: 3 }),
  trigger({
    priority: 1,
    requirementType: "chain",
    requirementId: "",
    requirementCount: 0,
    actionId: "city-mine",
  }),
];
assert.deepEqual(triggers({ triggers: chained }).read(), [
  { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
]);
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 0, actionId: "city-apartment", actionCount: 1 }),
      chained[1],
    ],
  }).read(),
  [
    {
      actionId: "city-apartment",
      actionType: "build",
      cost: COSTS["city-apartment"],
    },
  ],
);
// A research action still being offered has demonstrably not been researched, so what is chained
// behind it waits.
const chainedBehindResearch = [
  trigger({ priority: 0, actionType: "research", actionId: "tech-mad" }),
  chained[1],
];
assert.deepEqual(triggers({ triggers: chainedBehindResearch }).read(), [
  { actionId: "tech-mad", actionType: "research", cost: { Knowledge: 600 } },
]);
// Once the pass reports it granted, the research trigger is done and the chain moves on.
assert.deepEqual(
  triggers({
    triggers: chainedBehindResearch,
    granted: new Set(["tech-mad"]),
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);
// A technology in neither half of the draw is off the current tech path: it is not decidable, so
// the trigger and everything chained behind it are dropped.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 0, actionType: "research", actionId: "tech-wheel" }),
      chained[1],
    ],
    granted: new Set(["tech-mad"]),
  }).read(),
  [],
);

// Which passes a configured trigger list needs. Keeping the granted half of the research draw is
// the larger part of it, so only a research action or a `ResearchComplete` condition asks for it.
assert.equal(triggersNeedGrantedTechs(undefined), false);
assert.equal(
  triggersNeedGrantedTechs({ autoTrigger: true, triggers: [trigger()] }),
  false,
);
assert.equal(
  triggersNeedGrantedTechs({
    autoTrigger: false,
    triggers: chainedBehindResearch,
  }),
  false,
);
assert.equal(
  triggersNeedGrantedTechs({
    autoTrigger: true,
    triggers: chainedBehindResearch,
  }),
  true,
);
assert.equal(
  triggersNeedGrantedTechs({
    autoTrigger: true,
    triggers: researchRequirement,
  }),
  true,
);
assert.equal(
  triggersNeedGrantedTechs({
    autoTrigger: true,
    triggers: [
      trigger({
        requirementType: "ResearchUnlocked",
        requirementId: "tech-mad",
      }),
    ],
  }),
  false,
);

// Two triggers competing for the same resource: only the higher-priority one is a target.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 1, actionId: "city-apartment" }),
      trigger({ priority: 0, actionId: "city-mine" }),
    ],
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);
// Costs that share nothing are both targets, in the player's priority order.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 1, actionType: "research", actionId: "tech-mad" }),
      trigger({ priority: 0, actionId: "city-mine" }),
    ],
  }).read(),
  [
    { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
    { actionId: "tech-mad", actionType: "research", cost: { Knowledge: 600 } },
  ],
);

// The game's own `checkMaxCosts` refuses a positive cost in a resource it is not displaying,
// whatever that resource's stored maximum says.
assert.deepEqual(
  triggers({
    triggers: [trigger()],
    rootValue: {
      ...root,
      resource: {
        ...root.resource,
        Lumber: { amount: 100, max: 5000, display: false },
      },
    },
  }).read(),
  [],
);

console.log("Captured trigger source tests passed");
