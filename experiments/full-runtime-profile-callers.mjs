// Caller attribution for one automation function in .cpuprofile files: for every sample whose stack
// contains the target (matched by name and bundle module), charges the sample to the chain of the
// first three distinct callers outside the target's module, above its outermost occurrence.
//   node experiments/full-runtime-profile-callers.mjs <name> <module-substring> <a.cpuprofile> [...]
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const [target, moduleHint, ...paths] = process.argv.slice(2);
const root = fileURLToPath(new URL("..", import.meta.url));
const lines = (
  await readFile(`${root}evolve_automation.user.js`, "utf8")
).split("\n");
const starts = [];
lines.forEach((line, index) => {
  const match = /^ {2}\/\/ (src\/\S+)$/u.exec(line);
  if (match) starts.push([index, match[1]]);
});
const moduleAt = (line) => {
  let found;
  for (const [start, path] of starts) {
    if (start > line) break;
    found = path;
  }
  return found;
};
const callers = new Map();
let totalUs = 0;
for (const path of paths) {
  const profile = JSON.parse(await readFile(path, "utf8"));
  const parent = new Map();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parent.set(child, node.id);
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const frameOf = (id) => {
    const { functionName, url, lineNumber } = byId.get(id).callFrame;
    return {
      name: functionName || `(anon ${lineNumber + 1})`,
      module: url.includes("automation.user.js")
        ? moduleAt(lineNumber)
        : url.slice(-24),
    };
  };
  for (let index = 0; index < profile.samples.length; index++) {
    const us = profile.timeDeltas[index + 1] ?? 0;
    const stack = [];
    for (let at = profile.samples[index]; at !== undefined; at = parent.get(at))
      stack.push(frameOf(at));
    const hit = stack.findIndex(
      (frame) => frame.name === target && frame.module?.includes(moduleHint),
    );
    if (hit < 0) continue;
    totalUs += us;
    // Outermost occurrence, then the first two distinct callers outside the target's module.
    let outer = hit;
    for (let i = hit; i < stack.length; i++)
      if (stack[i].name === target && stack[i].module?.includes(moduleHint))
        outer = i;
    const chain = [];
    for (let i = outer + 1; i < stack.length && chain.length < 3; i++) {
      const frame = stack[i];
      if (frame.module?.includes(moduleHint)) continue;
      const label = `${frame.name} (${(frame.module ?? "").replace("src/", "")})`;
      if (chain.at(-1) !== label) chain.push(label);
    }
    const key = chain.join(" < ");
    callers.set(key, (callers.get(key) ?? 0) + us);
  }
}
console.log(
  `${target}: ${(totalUs / 1000 / paths.length).toFixed(1)} ms per profile`,
);
for (const [key, us] of [...callers].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log(`${(us / 1000 / paths.length).toFixed(1).padStart(8)}  ${key}`);
