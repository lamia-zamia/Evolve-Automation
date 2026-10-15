// Analyzes V8 .cpuprofile files from experiments/full-runtime-profile.mjs `profile` mode.
//
// Functions are keyed by script location (url:line:column), never by functionName alone: V8
// reported the same calibration function once as "globalThis.__eaCalibrationBurn" and once with an
// empty name. Module ownership comes from esbuild's module marker comments in the served bytes.
//
//   node experiments/full-runtime-profile-cpuprofile.mjs <a.cpuprofile> [...] [--top 30] [--json out.json]
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Line -> module path from the bundle's `  // <path>` module comments (0-based lines, as V8 reports). */
async function moduleIndex(path, pattern) {
  const lines = (await readFile(path, "utf8")).split("\n");
  const starts = [];
  lines.forEach((line, index) => {
    const match = pattern.exec(line);
    if (match) starts.push([index, match[1]]);
  });
  return { lines, starts };
}
const indexes = {
  automation: await moduleIndex(
    `${root}evolve_automation.user.js`,
    /^ {2}\/\/ (src\/\S+)$/u,
  ),
  game: await moduleIndex(
    `${root}test-artifacts/game/evolve-deadspace.js`,
    /^ {2}\/\/ \S*?(?:source\/)?((?:src|node_modules)\/\S+)$/u,
  ),
};
const moduleAt = (owner, line) => {
  const index = indexes[owner];
  if (!index) return undefined;
  let lo = 0;
  let hi = index.starts.length - 1;
  let found;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (index.starts[mid][0] <= line) {
      found = index.starts[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
};
/** Best-effort declared name at a location, read from the served source text. */
const declaredName = (owner, line, column) => {
  const text = indexes[owner]?.lines[line];
  if (text === undefined) return undefined;
  const before = text.slice(0, column + 1);
  const match =
    /(?:function\*?\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?)?(?:\([^)]*)?$/u.exec(
      before,
    ) ??
    /([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:function\s*)?\(?[^()]*$/u.exec(
      before,
    ) ??
    /([A-Za-z_$][\w$]*)\s*\([^)]*$/u.exec(before);
  return match?.[1];
};

export const ownerOf = (url, functionName) => {
  if (url.includes("automation.user.js")) return "automation";
  if (url.includes("evolve/main.js")) return "game";
  if (url.includes("/npm/"))
    return `lib:${url.split("/npm/")[1].split("/")[0]}`;
  if (url.includes("/lib/"))
    return `lib:${url.split("/lib/")[1].split(".")[0]}`;
  if (url === "") {
    if (functionName === "(program)") return "program";
    if (functionName === "(idle)") return "idle";
    if (functionName === "(garbage collector)") return "gc";
    if (functionName === "(root)") return "root";
    return "native";
  }
  if (url.startsWith("pptr:") || url.includes("evolve-runner"))
    return "harness";
  return `other:${url.slice(-40)}`;
};

// Automation frames that only pass the game's own call through (not automation work): the
// worker-capture listener wrapper, which V8 names "wrapper" (its binding) or "messageListener".
const isPassthrough = (frame) =>
  frame.module === "src/adapters/evolve/worker-capture.ts" &&
  (frame.name === "wrapper" || frame.name === "messageListener");

export async function analyzeProfiles(paths, { top = 30 } = {}) {
  const fn = new Map(); // key -> {owner, module, name, selfUs, inclUs, names:Set}
  const owners = new Map();
  const causal = new Map();
  const modules = new Map();
  const paths4 = new Map();
  const automationIntoGame = new Map();
  let totalUs = 0;
  let profiles = 0;
  for (const path of paths) {
    const profile = JSON.parse(await readFile(path, "utf8"));
    profiles++;
    const byId = new Map(profile.nodes.map((node) => [node.id, node]));
    const parent = new Map();
    for (const node of profile.nodes)
      for (const child of node.children ?? []) parent.set(child, node.id);
    const info = new Map();
    for (const node of profile.nodes) {
      const { url, functionName, lineNumber, columnNumber } = node.callFrame;
      const owner = ownerOf(url, functionName);
      const key =
        owner === "automation" || owner === "game" || owner.startsWith("lib:")
          ? `${owner}:${lineNumber}:${columnNumber}`
          : `${owner}:${functionName}`;
      const module =
        owner === "automation" || owner === "game"
          ? moduleAt(owner, lineNumber)
          : undefined;
      const name =
        functionName ||
        declaredName(owner, lineNumber, columnNumber) ||
        `(anonymous ${lineNumber + 1}:${columnNumber + 1})`;
      info.set(node.id, { key, owner, module, name, line: lineNumber + 1 });
    }
    const stackCache = new Map();
    const stackOf = (id) => {
      let cached = stackCache.get(id);
      if (cached) return cached;
      const out = [];
      for (let at = id; at !== undefined; at = parent.get(at)) out.push(at);
      stackCache.set(id, out);
      return out;
    };
    const { samples, timeDeltas } = profile;
    for (let index = 0; index < samples.length; index++) {
      const us = timeDeltas[index + 1] ?? 0;
      if (us <= 0) continue;
      totalUs += us;
      const stack = stackOf(samples[index]);
      const leaf = info.get(stack[0]);
      // Self ownership: a native frame is charged to its nearest JS ancestor's owner.
      let selfOwner = leaf.owner;
      if (selfOwner === "native") {
        const js = stack
          .map((id) => info.get(id))
          .find((frame) => frame.owner !== "native");
        selfOwner =
          js && js.owner !== "root" ? `native<-${js.owner}` : "native";
      }
      owners.set(selfOwner, (owners.get(selfOwner) ?? 0) + us);
      // Causal ownership: any non-passthrough automation frame on the stack means automation asked.
      const frames = stack.map((id) => info.get(id));
      const automationWork = frames.some(
        (frame) => frame.owner === "automation" && !isPassthrough(frame),
      );
      const special = ["idle", "program", "gc", "root"].includes(leaf.owner);
      const cause = special
        ? leaf.owner
        : automationWork
          ? "automation-initiated"
          : frames.some((f) => f.owner === "game" || f.owner.startsWith("lib:"))
            ? "game-initiated"
            : frames.some((f) => f.owner === "harness")
              ? "harness"
              : "other";
      causal.set(cause, (causal.get(cause) ?? 0) + us);
      const seen = new Set();
      for (const [depth, frame] of frames.entries()) {
        let entry = fn.get(frame.key);
        if (!entry) {
          entry = {
            key: frame.key,
            owner: frame.owner,
            module: frame.module,
            name: frame.name,
            line: frame.line,
            selfUs: 0,
            selfAutomationUs: 0,
            inclUs: 0,
          };
          fn.set(frame.key, entry);
        }
        if (depth === 0) {
          entry.selfUs += us;
          if (automationWork) entry.selfAutomationUs += us;
        }
        if (!seen.has(frame.key)) {
          seen.add(frame.key);
          entry.inclUs += us;
        }
      }
      // Module self/inclusive for automation and game.
      const seenModule = new Set();
      for (const [depth, frame] of frames.entries()) {
        if (!frame.module) continue;
        const key = `${frame.owner}:${frame.module}`;
        let entry = modules.get(key);
        if (!entry) modules.set(key, (entry = { key, selfUs: 0, inclUs: 0 }));
        if (depth === 0) entry.selfUs += us;
        if (!seenModule.has(key)) {
          seenModule.add(key);
          entry.inclUs += us;
        }
      }
      // Automation frames that directly call game/lib code: what automation makes the game do.
      for (let depth = 1; depth < frames.length; depth++) {
        const caller = frames[depth];
        const callee = frames[depth - 1];
        if (
          caller.owner === "automation" &&
          !isPassthrough(caller) &&
          (callee.owner === "game" || callee.owner.startsWith("lib:"))
        ) {
          const key = `${caller.name} (${caller.module}) -> ${callee.name} (${callee.module ?? callee.owner})`;
          automationIntoGame.set(key, (automationIntoGame.get(key) ?? 0) + us);
          break;
        }
      }
      if (!special) {
        const path4 = frames
          .filter((f) => f.owner !== "native" || f === frames[0])
          .slice(0, 5)
          .map(
            (f) =>
              `${f.name}[${f.owner === "automation" || f.owner === "game" ? `${f.owner[0]}:${f.module?.split("/").pop()}` : f.owner}]`,
          )
          .reverse()
          .join(" > ");
        paths4.set(path4, (paths4.get(path4) ?? 0) + us);
      }
    }
  }
  const ms = (us) => Number((us / 1000 / profiles).toFixed(2));
  const sortBy = (map, field) =>
    [...map.values()].sort((a, b) => b[field] - a[field]);
  const shape = (entry) => ({
    name: entry.name,
    owner: entry.owner,
    module: entry.module,
    line: entry.line,
    selfMs: ms(entry.selfUs),
    inclMs: ms(entry.inclUs),
    selfAutomationInitiatedPct:
      entry.selfUs > 0
        ? Math.round((100 * entry.selfAutomationUs) / entry.selfUs)
        : null,
  });
  return {
    profiles,
    note: "ms are per profile window (averaged over the profiles given)",
    totalSampledMs: ms(totalUs),
    selfByOwner: Object.fromEntries(
      [...owners].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, ms(v)]),
    ),
    causal: Object.fromEntries(
      [...causal].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, ms(v)]),
    ),
    topSelf: sortBy(fn, "selfUs").slice(0, top).map(shape),
    topInclusiveAutomation: sortBy(fn, "inclUs")
      .filter((e) => e.owner === "automation")
      .slice(0, top)
      .map(shape),
    topInclusiveGame: sortBy(fn, "inclUs")
      .filter((e) => e.owner === "game")
      .slice(0, top)
      .map(shape),
    automationModules: sortBy(modules, "inclUs")
      .filter((e) => e.key.startsWith("automation:"))
      .slice(0, top)
      .map((e) => ({
        module: e.key.slice(11),
        selfMs: ms(e.selfUs),
        inclMs: ms(e.inclUs),
      })),
    gameModules: sortBy(modules, "selfUs")
      .filter((e) => e.key.startsWith("game:"))
      .slice(0, 15)
      .map((e) => ({
        module: e.key.slice(5),
        selfMs: ms(e.selfUs),
        inclMs: ms(e.inclUs),
      })),
    automationIntoGame: [...automationIntoGame]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k, v]) => ({ edge: k, ms: ms(v) })),
    topPaths: [...paths4]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([k, v]) => ({ path: k, selfMs: ms(v) })),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const jsonIndex = args.indexOf("--json");
  const json = jsonIndex >= 0 ? args.splice(jsonIndex, 2)[1] : undefined;
  const topIndex = args.indexOf("--top");
  const top = topIndex >= 0 ? Number(args.splice(topIndex, 2)[1]) : 30;
  const result = await analyzeProfiles(args, { top });
  if (json) await writeFile(json, `${JSON.stringify(result, null, 1)}\n`);
  console.log(JSON.stringify(result, null, 1));
}
