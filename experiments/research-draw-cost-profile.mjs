// Re-analyze the bounded V8 profiles produced by full-runtime-profile.mjs `profile` and `phases`.
// No game page is launched and no Research draw is performed.
//
//   node experiments/research-draw-cost-profile.mjs --artifacts <test-artifacts/perf-profile>
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const option = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
};
const artifactRoot = option("artifacts");
if (!artifactRoot)
  throw new Error("pass --artifacts <full-runtime perf-profile directory>");
const ticksPerProfile = Number(option("ticks") ?? 100);
if (!Number.isInteger(ticksPerProfile) || ticksPerProfile < 1)
  throw new Error("--ticks must be a positive integer");

const groupFunctions = [
  "drawTech",
  "checkTechPath",
  "checkOldTech",
  "checkTechQualifications",
  "checkTechRequirements",
  "checkAffordable",
  "adjustCosts",
  "get",
  "govActive",
  "technocracy",
  "parseHTML",
  "toNodes",
  "createElement",
  "appendChild",
];
const htmlHelpers = new Set([
  "parseHTML",
  "toNodes",
  "createElement",
  "appendChild",
  "append",
  "addClass",
  "toArray",
  "_DomList",
]);

const readJson = async (path) =>
  JSON.parse(await readFile(resolve(path), "utf8"));
const stackFor = (sample, parents, nodes) => {
  const stack = [];
  for (let id = sample; id !== undefined; id = parents.get(id))
    stack.push(nodes.get(id));
  return stack;
};
const round = (value) => Number(value.toFixed(3));
const summaries = await readJson(resolve(artifactRoot, "summary-phases.json"));
const output = {};

for (const save of ["early", "mid", "late"]) {
  const profiles = [];
  const callbackLines = new Map();
  for (const repeat of [0, 1]) {
    const profile = await readJson(
      resolve(
        artifactRoot,
        "cpuprofiles",
        `${save}-active-r${repeat}.cpuprofile`,
      ),
    );
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
    const parents = new Map();
    for (const node of profile.nodes)
      for (const child of node.children ?? []) parents.set(child, node.id);

    const selfUs = new Map();
    const insideDrawUs = new Map();
    let drawUs = 0;
    let gcUs = 0;
    for (let index = 0; index < profile.samples.length; index++) {
      const elapsedUs = profile.timeDeltas[index] ?? 0;
      const stack = stackFor(profile.samples[index], parents, nodes);
      const leafName = stack[0]?.callFrame.functionName || "(anonymous)";
      if (leafName === "(garbage collector)") gcUs += elapsedUs;

      const drawDepth = stack.findIndex(
        (node) => node.callFrame.functionName === "drawTech",
      );
      if (drawDepth < 0) continue;
      drawUs += elapsedUs;
      selfUs.set(leafName, (selfUs.get(leafName) ?? 0) + elapsedUs);

      const rowCallback = stack[drawDepth - 2]?.callFrame;
      const inActionRow = stack.some(
        (node) => node.callFrame.functionName === "setAction",
      );
      const inAddAction = stack.some(
        (node) => node.callFrame.functionName === "addAction",
      );
      if (inActionRow && inAddAction && rowCallback) {
        const rowLine = rowCallback.lineNumber;
        callbackLines.set(rowLine, (callbackLines.get(rowLine) ?? 0) + 1);
        insideDrawUs.set(
          leafName,
          (insideDrawUs.get(leafName) ?? 0) + elapsedUs,
        );
      }
    }
    profiles.push({ drawUs, gcUs, selfUs, insideDrawUs });
  }

  const oldCallbackLine = [...callbackLines.keys()].sort((a, b) => b - a)[0];
  if (callbackLines.size !== 2)
    throw new Error(
      `${save}: expected two drawTech addAction/setAction row callbacks; found ${callbackLines.size}`,
    );

  // The higher callback location is the later old_techs loop in pinned drawTech(); new_techs is above it.
  const oldRows = await Promise.all(
    [0, 1].map(async (repeat) => {
      const profile = await readJson(
        resolve(
          artifactRoot,
          "cpuprofiles",
          `${save}-active-r${repeat}.cpuprofile`,
        ),
      );
      const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
      const parents = new Map();
      for (const node of profile.nodes)
        for (const child of node.children ?? []) parents.set(child, node.id);
      const leaves = new Map();
      for (let index = 0; index < profile.samples.length; index++) {
        const elapsedUs = profile.timeDeltas[index] ?? 0;
        const stack = stackFor(profile.samples[index], parents, nodes);
        const drawDepth = stack.findIndex(
          (node) => node.callFrame.functionName === "drawTech",
        );
        if (drawDepth < 0) continue;
        const rowCallback = stack[drawDepth - 2]?.callFrame;
        if (
          !stack.some((node) => node.callFrame.functionName === "setAction") ||
          !stack.some((node) => node.callFrame.functionName === "addAction") ||
          rowCallback?.lineNumber !== oldCallbackLine
        )
          continue;
        const leafName = stack[0]?.callFrame.functionName || "(anonymous)";
        leaves.set(leafName, (leaves.get(leafName) ?? 0) + elapsedUs);
      }
      return leaves;
    }),
  );

  const averageLeaf = (profilesForRows, field, name) =>
    profilesForRows.reduce(
      (sum, profile) => sum + (profile[field].get(name) ?? 0),
      0,
    ) /
    (profilesForRows.length * ticksPerProfile * 1000);
  const oldRowLeaf = (name) =>
    oldRows.reduce((sum, leaves) => sum + (leaves.get(name) ?? 0), 0) /
    (oldRows.length * ticksPerProfile * 1000);
  const phaseRows = summaries[save].table;
  const phase = (name) =>
    phaseRows.find((row) => row.name === name)?.inCycleMsPerWorkTick ?? null;
  const counters = summaries[save].counters;
  const draws =
    counters["discovery.actual-draw research-catalog"]?.total ?? null;
  const matchedOffers = counters["research.offers.matched"]?.total ?? null;
  const bindingEvents =
    counters["research.binding.capture.events"]?.total ?? null;
  const workTicks = summaries[save].workTicks;
  const self = Object.fromEntries(
    groupFunctions.map((name) => [
      name,
      round(averageLeaf(profiles, "selfUs", name)),
    ]),
  );
  const oldTotalUs = oldRows.reduce(
    (sum, leaves) => sum + [...leaves.values()].reduce((a, b) => a + b, 0),
    0,
  );
  const oldHtmlUs = oldRows.reduce(
    (sum, leaves) =>
      sum +
      [...leaves].reduce(
        (subtotal, [name, us]) => subtotal + (htmlHelpers.has(name) ? us : 0),
        0,
      ),
    0,
  );
  const oldSelectorUs = oldRows.reduce(
    (sum, leaves) =>
      sum +
      (leaves.get("querySelector") ?? 0) +
      (leaves.get("querySelectorAll") ?? 0),
    0,
  );
  output[save] = {
    phaseMsPerTick: {
      nativeDraw: phase(
        "research.draw.native-switch-drawTech-and-dom-generation",
      ),
      workspaceCreate: phase("research.draw.workspace-create"),
      workspaceRelease: phase("research.draw.workspace-release"),
      observer: phase("research.draw.binding-and-dom-observation"),
    },
    counters: {
      workTicks,
      draws,
      drawsPerWorkTick: round(draws / workTicks),
      offersPerDraw: round(matchedOffers / draws),
      bindingEventsPerWorkTick: round(bindingEvents / workTicks),
    },
    sampledCpuMsPerTick: {
      drawTechInclusive: round(
        profiles.reduce((sum, profile) => sum + profile.drawUs, 0) /
          (profiles.length * ticksPerProfile * 1000),
      ),
      self,
      completedRows: {
        total: round(oldTotalUs / (oldRows.length * ticksPerProfile * 1000)),
        htmlAndDomHelpers: round(
          oldHtmlUs / (oldRows.length * ticksPerProfile * 1000),
        ),
        selectorHelpers: round(
          oldSelectorUs / (oldRows.length * ticksPerProfile * 1000),
        ),
        parseHTML: round(oldRowLeaf("parseHTML")),
        toNodes: round(oldRowLeaf("toNodes")),
      },
      gcWholeProfile: round(
        profiles.reduce((sum, profile) => sum + profile.gcUs, 0) /
          (profiles.length * ticksPerProfile * 1000),
      ),
    },
    profileRowCallbackLines: [...callbackLines.keys()].sort((a, b) => a - b),
  };
}

console.log(JSON.stringify(output, null, 2));
