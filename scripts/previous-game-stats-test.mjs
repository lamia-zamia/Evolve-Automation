import assert from "node:assert/strict";

import { createPreviousGameStats } from "../src/ui/previous-game-stats.ts";

function makeContext(overrides = {}) {
  const appended = [];
  return {
    game: { loc: (key) => `loc:${key}` },
    win: { LZString: { decompressFromUTF16: (value) => value } },
    panelCount: 1,
    backup: null,
    jquery: (selector) => ({
      length: selector === "#statsPanel .cstat" ? context.panelCount : 1,
      append: (value) => appended.push(value),
    }),
    appended,
    ...overrides,
  };
}

let context = makeContext();
const storageReads = [];
const storage = {
  getItem(key) {
    storageReads.push(key);
    return context.backup;
  },
};
const { renderPreviousGameStats } = createPreviousGameStats({
  getGame: () => context.game,
  getWin: () => context.win,
  getJQuery: () => context.jquery,
  storage,
});

// The panel count gate avoids even reading the backup.
context.panelCount = 2;
renderPreviousGameStats();
assert.deepEqual(storageReads, []);
assert.deepEqual(context.appended, []);

// A whole-context replacement is observed, and only positive optional counters are rendered.
context = makeContext({
  backup: JSON.stringify({
    stats: {
      know: 1,
      starved: 2,
      died: 3,
      attacks: 4,
      days: 5,
      dkills: 6,
      sac: 0,
      murders: 7,
      psykill: 0,
    },
  }),
});
renderPreviousGameStats();
assert.deepEqual(storageReads, ["evolveBak"]);
assert.equal(context.appended.length, 1);
const html = context.appended[0];
for (const label of [
  "knowledge_spent",
  "starved_to_death",
  "died_in_combat",
  "attacks_made",
  "game_days_played",
  "demons_kills",
  "murders",
]) {
  assert.ok(html.includes(`loc:achieve_stats_${label}`));
}
assert.equal(html.includes("sacrificed"), false);
assert.equal(html.includes("psymurders"), false);

// A missing/decompression-empty backup leaves the panel untouched.
context = makeContext({ backup: "encoded" });
context.win.LZString.decompressFromUTF16 = () => null;
renderPreviousGameStats();
assert.deepEqual(context.appended, []);

console.log("Previous game stats module tests passed");
