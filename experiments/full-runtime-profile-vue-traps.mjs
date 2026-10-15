// Splits Vue reactive-trap self time (get/set/has/ownKeys) into automation-initiated and game-only.
//   node experiments/full-runtime-profile-vue-traps.mjs <a.cpuprofile> [...]
import { readFile } from "node:fs/promises";
const paths = process.argv.slice(2);
let auto = 0,
  game = 0,
  total = 0;
const parentsAuto = new Map();
for (const path of paths) {
  const p = JSON.parse(await readFile(path, "utf8"));
  const parent = new Map();
  for (const n of p.nodes)
    for (const c of n.children ?? []) parent.set(c, n.id);
  const by = new Map(p.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < p.samples.length; i++) {
    const us = p.timeDeltas[i + 1] ?? 0;
    const leaf = by.get(p.samples[i]).callFrame;
    if (!(
      leaf.url.includes("/npm/vue") &&
      (leaf.functionName === "get" ||
        leaf.functionName === "set" ||
        leaf.functionName === "has" ||
        leaf.functionName === "ownKeys")
    ))
      continue;
    total += us;
    let automationFrame = null,
      firstNonVue = null;
    for (
      let at = parent.get(p.samples[i]);
      at !== undefined;
      at = parent.get(at)
    ) {
      const f = by.get(at).callFrame;
      if (!firstNonVue && !f.url.includes("/npm/vue")) firstNonVue = f;
      if (
        f.url.includes("automation.user.js") &&
        !(f.functionName === "wrapper" || f.functionName === "messageListener")
      ) {
        automationFrame = f;
        break;
      }
    }
    if (automationFrame) {
      auto += us;
      if (firstNonVue?.url.includes("automation")) {
        const k = firstNonVue.functionName || "(anon)";
        parentsAuto.set(k, (parentsAuto.get(k) ?? 0) + us);
      }
    } else game += us;
  }
}
const ms = (v) => (v / 1000 / paths.length).toFixed(1);
console.log(
  "vue trap self ms/profile total",
  ms(total),
  "under automation",
  ms(auto),
  "game-only",
  ms(game),
);
console.log(
  "direct automation callers:",
  [...parentsAuto]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}=${ms(v)}`)
    .join(", "),
);
