import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline !== undefined) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const toolsRoot = resolve(
  process.env.EA_TOOLS_ROOT ?? resolve(root, "../Evolve-Automation/tools"),
);
const requireFromTools = createRequire(
  pathToFileURL(resolve(toolsRoot, "package.json")),
);
const { SourceMapConsumer } = requireFromTools("source-map-js");
const profilePath = resolve(
  option(
    "profile",
    resolve(root, "test-artifacts/perf-profile/p7-baseline.json"),
  ),
);
const mapPath = resolve(
  option(
    "map",
    resolve(root, "test-artifacts/perf-profile/p7-profile.user.js.map"),
  ),
);
const outPath = resolve(
  option(
    "out",
    resolve(root, "test-artifacts/perf-profile/p7-source-mapped.json"),
  ),
);
const [report, rawMap] = await Promise.all([
  readFile(profilePath, "utf8").then(JSON.parse),
  readFile(mapPath, "utf8").then(JSON.parse),
]);
const consumer = new SourceMapConsumer(rawMap);
const mapCallFrame = (frame) => {
  if (!/automation\.user\.js/u.test(frame.url ?? "") || frame.lineNumber < 0)
    return undefined;
  const position = consumer.originalPositionFor({
    line: frame.lineNumber + 1,
    column: frame.columnNumber,
  });
  if (position.source === null) return undefined;
  return {
    source: position.source,
    functionName: position.name ?? frame.functionName,
    line: position.line,
    column: position.column,
  };
};

const mappedRuns = report.rawProfiles.map((run) => {
  const { profile } = run;
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parent.set(child, node.id);
  const paths = new Map();
  const getterSamples = new Map();
  const categoryTotals = new Map();
  let totalVueGetterUs = 0;
  let totalVueGetterSamples = 0;
  let automationFrameGetterUs = 0;
  let automationFrameGetterSamples = 0;
  for (let index = 0; index < (profile.samples ?? []).length; index += 1) {
    const leafId = profile.samples[index];
    const leaf = nodes.get(leafId);
    if (
      leaf?.callFrame.functionName !== "get" ||
      !/vue(?:\.global\.prod|\.min)?\.js/u.test(leaf.callFrame.url ?? "")
    )
      continue;
    const weightUs = profile.timeDeltas?.[index] ?? 1000;
    totalVueGetterUs += weightUs;
    totalVueGetterSamples += 1;
    const frames = [];
    let cursor = leafId;
    while (cursor !== undefined) {
      const node = nodes.get(cursor);
      if (node === undefined) break;
      const frame = node.callFrame;
      frames.push({
        owner: /evolve_automation|automation\.user\.js/u.test(frame.url ?? "")
          ? "automation"
          : /vue(?:\.global\.prod|\.min)?\.js/u.test(frame.url ?? "")
            ? "Vue"
            : /evolve\/main\.js(?:$|\?)/u.test(frame.url ?? "")
              ? "game"
              : frame.url === ""
                ? "native"
                : "other",
        functionName: frame.functionName || "(anonymous)",
        url: frame.url,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
        source: mapCallFrame(frame),
      });
      cursor = parent.get(cursor);
    }
    const hasAutomationFrame = frames.some(
      (frame) => frame.owner === "automation",
    );
    if (hasAutomationFrame) {
      automationFrameGetterUs += weightUs;
      automationFrameGetterSamples += 1;
    }
    const boundary = frames.find((frame) => frame.owner !== "Vue");
    const invocationFrames = frames.filter(
      (frame) => frame.owner === "automation" && frame.source !== undefined,
    );
    const automationIndex = frames.findIndex(
      (frame) => frame.owner === "automation",
    );
    const calledFromVueRender = frames
      .slice(automationIndex + 1)
      .some((frame) => frame.owner === "Vue");
    const invokedByAutomation = invocationFrames.some((frame) =>
      /^(invokeControl|invoke|probePrice|readCost)$/u.test(
        frame.source.functionName,
      ),
    );
    const category = !hasAutomationFrame
      ? "no automation frame (unclassified)"
      : boundary?.owner === "automation" && calledFromVueRender
        ? "automation reader called by Vue rendering"
        : boundary?.owner === "automation"
          ? "direct automation property read"
          : boundary?.owner === "game" && invokedByAutomation
            ? "native game callback invoked by automation (heuristic)"
            : boundary?.owner === "game"
              ? "ordinary game callback under the worker wrapper"
              : "other nested work";
    const categoryTotal = categoryTotals.get(category) ?? {
      weightUs: 0,
      samples: 0,
    };
    categoryTotal.weightUs += weightUs;
    categoryTotal.samples += 1;
    categoryTotals.set(category, categoryTotal);
    const pathKey = `${category}\u0000${frames
      .slice(0, 12)
      .map((frame) => {
        const source = frame.source;
        return source === undefined
          ? `${frame.owner}:${frame.functionName}`
          : `${frame.owner}:${source.source}:${source.functionName}:${source.line}`;
      })
      .join(" <- ")}`;
    const row = paths.get(pathKey) ?? {
      category,
      weightUs: 0,
      samples: 0,
      frames: frames.slice(0, 12),
    };
    row.weightUs += weightUs;
    row.samples += 1;
    paths.set(pathKey, row);
    if (category === "direct automation property read") {
      const owner = frames.find((frame) => frame.owner === "automation");
      const source = owner?.source;
      const key =
        source === undefined
          ? (owner?.functionName ?? "unmapped")
          : `${source.source}:${source.functionName}:${source.line}`;
      const reader = getterSamples.get(key) ?? {
        reader: key,
        weightUs: 0,
        samples: 0,
      };
      reader.weightUs += weightUs;
      reader.samples += 1;
      getterSamples.set(key, reader);
    }
  }
  const categoryGetterUs = [...categoryTotals.values()].reduce(
    (sum, row) => sum + row.weightUs,
    0,
  );
  const automationCategoryUs = [...categoryTotals.entries()]
    .filter(([category]) => category !== "no automation frame (unclassified)")
    .reduce((sum, [, row]) => sum + row.weightUs, 0);
  if (
    categoryGetterUs !== totalVueGetterUs ||
    automationCategoryUs !== automationFrameGetterUs
  ) {
    throw new Error(
      `Getter category weights do not reconcile: categories=${categoryGetterUs}, all=${totalVueGetterUs}, automationCategories=${automationCategoryUs}, automationFrames=${automationFrameGetterUs}`,
    );
  }
  const rows = [...paths.values()].sort((a, b) => b.weightUs - a.weightUs);
  return {
    scenario: run.scenario,
    repeat: run.repeat,
    totalVueGetterMs: Number((totalVueGetterUs / 1000).toFixed(2)),
    totalVueGetterSamples,
    automationFrameGetterMs: Number(
      (automationFrameGetterUs / 1000).toFixed(2),
    ),
    automationFrameGetterSamples,
    getterCategoryTotals: Object.fromEntries(
      [...categoryTotals.entries()].map(([category, row]) => [
        category,
        {
          sampledMs: Number((row.weightUs / 1000).toFixed(2)),
          sampleCount: row.samples,
          shareOfAutomationFrameGetterSamples:
            category === "no automation frame (unclassified)"
              ? null
              : Number(
                  (
                    (row.weightUs / Math.max(1, automationFrameGetterUs)) *
                    100
                  ).toFixed(2),
                ),
          shareOfAllVueGetterSamples: Number(
            ((row.weightUs / Math.max(1, totalVueGetterUs)) * 100).toFixed(2),
          ),
        },
      ]),
    ),
    getterStacks: rows.map((row) => ({
      category: row.category,
      sampledMs: Number((row.weightUs / 1000).toFixed(2)),
      sampleCount: row.samples,
      shareOfAutomationFrameGetterSamples:
        row.category === "no automation frame (unclassified)"
          ? null
          : Number(
              (
                (row.weightUs / Math.max(1, automationFrameGetterUs)) *
                100
              ).toFixed(2),
            ),
      shareOfAllVueGetterSamples: Number(
        ((row.weightUs / Math.max(1, totalVueGetterUs)) * 100).toFixed(2),
      ),
      frames: row.frames,
    })),
    directReaders: [...getterSamples.values()]
      .sort((a, b) => b.weightUs - a.weightUs)
      .map((row) => ({
        reader: row.reader,
        sampledMs: Number((row.weightUs / 1000).toFixed(2)),
        getterSamples: row.samples,
      })),
  };
});

await writeFile(outPath, `${JSON.stringify(mappedRuns, null, 2)}\n`);
consumer.destroy?.();
console.log(
  JSON.stringify(
    {
      outPath,
      runs: mappedRuns.map((run) => ({
        scenario: run.scenario,
        repeat: run.repeat,
        totalVueGetterMs: run.totalVueGetterMs,
        totalVueGetterSamples: run.totalVueGetterSamples,
        automationFrameGetterMs: run.automationFrameGetterMs,
        automationFrameGetterSamples: run.automationFrameGetterSamples,
        getterCategoryTotals: run.getterCategoryTotals,
        directReaders: run.directReaders.slice(0, 12),
        topStacks: run.getterStacks
          .slice(0, 8)
          .map(({ category, sampledMs, sampleCount, frames }) => ({
            category,
            sampledMs,
            sampleCount,
            path: frames.map((frame) =>
              frame.source === undefined
                ? `${frame.owner}:${frame.functionName}`
                : `${frame.owner}:${frame.source.source}:${frame.source.functionName}:${frame.source.line}`,
            ),
          })),
      })),
    },
    null,
    2,
  ),
);
