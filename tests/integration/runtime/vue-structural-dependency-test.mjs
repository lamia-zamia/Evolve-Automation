import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createChromiumRunner,
  parseSave,
} from "../../../tools/chromium-evolve-runner.mjs";

const root = resolve(import.meta.dirname, "../../..");
const runner = await createChromiumRunner({
  game: resolve(root, "test-artifacts/game/evolve-deadspace.js"),
});
let session;
try {
  session = await runner.openSession({
    bundle: resolve(root, "evolve_automation.user.js"),
    save: parseSave(
      await readFile(
        resolve(root, "test-artifacts/benchmark/saves/ds-late-2809.txt"),
        "utf8",
      ),
    ),
    settings: await readFile(
      resolve(root, "test-artifacts/benchmark/settings/late-2809.json"),
      "utf8",
    ),
    seed: 42,
  });
  const result = await session.evaluate(() => {
    const vue = globalThis.Vue;
    const root = vue.reactive({
      resource: { Food: { amount: 10, rate: 2 } },
      city: { observatory: { on: 0 } },
    });
    const structure = root.city.observatory;
    let structureIterations = 0;
    let ownOnChecks = 0;
    const stopStructure = vue.watchEffect(
      () => {
        const candidate = root.city.observatory;
        if (candidate !== null && typeof candidate === "object") {
          Reflect.ownKeys(candidate);
        }
        structureIterations += 1;
      },
      { flush: "sync" },
    );
    const stopOwnCheck = vue.watchEffect(
      () => {
        Object.hasOwn(structure, "on");
        ownOnChecks += 1;
      },
      { flush: "sync" },
    );

    structure.on = 1;
    root.resource.Food.amount += 1;
    root.resource.Food.rate += 1;
    const hotWrites = [structureIterations, ownOnChecks];
    structure.added = true;
    const add = [structureIterations, ownOnChecks];
    delete structure.on;
    const remove = [structureIterations, ownOnChecks];
    root.city.observatory = 0;
    const replacement = [structureIterations, ownOnChecks];
    stopStructure();
    stopOwnCheck();
    return { hotWrites, add, remove, replacement };
  });

  assert.deepEqual(result.hotWrites, [1, 1]);
  assert.deepEqual(result.add, [2, 1]);
  assert.deepEqual(result.remove, [3, 1]);
  assert.deepEqual(result.replacement, [4, 1]);
} finally {
  await session?.close();
  await runner.close();
}

console.log("pinned Vue structural dependency checks passed");
