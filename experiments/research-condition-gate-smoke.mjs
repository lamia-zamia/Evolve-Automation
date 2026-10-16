import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolsDir =
  process.env.EA_TOOLS_DIR ??
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../Evolve-Automation/tools",
  );
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsDir, "chromium-evolve-runner.mjs")).href
);

const input = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || process.argv[index + 1] === undefined)
    throw new Error(`missing --${name}`);
  return resolve(process.argv[index + 1]);
};

const game = input("game");
const bundle = input("bundle");
const save = parseSave(await readFile(input("save"), "utf8"));
const settings = await readFile(input("settings"), "utf8");
const argValue = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : Number(process.argv[index + 1]);
};
const warmup = argValue("warmup", 400);
const periods = argValue("periods", 800);
const injectDrawError = process.argv.includes("--inject-draw-error");
const removeTechDom = process.argv.includes("--remove-tech-dom");
const replaceRootDuringDraw = process.argv.includes(
  "--replace-root-during-draw",
);
const runner = await createChromiumRunner({
  game,
  upstream: "D:/work/Evolve-DeadSpace",
});
let session;
try {
  session = await runner.openSession({ bundle, save, settings, seed: 42 });
  await session.evaluate(() => {
    window.__EA_RESEARCH_GATE_EVENTS__ = [];
    window.__EA_TEST_HOOKS__ = {
      ...(window.__EA_TEST_HOOKS__ ?? {}),
      researchConditionGate(event) {
        window.__EA_RESEARCH_GATE_EVENTS__.push(event);
      },
    };
  });
  await session.advance(warmup);
  const initialState = await session.readState();
  if (injectDrawError)
    await session.evaluate(() => {
      const original = Document.prototype.querySelectorAll;
      let injected = false;
      Document.prototype.querySelectorAll = function (selector) {
        if (!injected && selector === "#tech") {
          injected = true;
          Document.prototype.querySelectorAll = original;
          throw new Error("intentional Research draw failure");
        }
        return Reflect.apply(original, this, [selector]);
      };
    });
  if (removeTechDom)
    await session.evaluate(() => {
      const original = Document.prototype.getElementById;
      window.__EA_ORIGINAL_GET_ELEMENT_BY_ID__ = original;
      Document.prototype.getElementById = function (id) {
        if (id === "tech" || id === "oldTech") {
          window.__EA_MISSING_DOM_INTERCEPTS__ =
            (window.__EA_MISSING_DOM_INTERCEPTS__ ?? 0) + 1;
          return null;
        }
        return Reflect.apply(original, this, [id]);
      };
    });
  if (replaceRootDuringDraw)
    await session.evaluate(() => {
      window.__EA_REPLACE_ROOT__ = true;
      const original = Node.prototype.appendChild;
      window.__EA_ORIGINAL_APPEND_CHILD__ = original;
      let replacedRoot = false;
      Node.prototype.appendChild = function (child) {
        if (
          !replacedRoot &&
          window.__EA_REPLACE_ROOT__ &&
          this instanceof Element &&
          (this.id === "tech" || this.id === "oldTech")
        ) {
          replacedRoot = true;
          window.__EA_ROOT_REPLACED__ = true;
          const empty = {};
          window.Vue.reactive({
            resource: empty,
            race: empty,
            stats: empty,
            tech: empty,
            city: empty,
            civic: empty,
          });
        }
        return Reflect.apply(original, this, [child]);
      };
    });
  await session.advance(periods);
  if (removeTechDom)
    await session.evaluate(() => {
      Document.prototype.getElementById =
        window.__EA_ORIGINAL_GET_ELEMENT_BY_ID__;
      delete window.__EA_ORIGINAL_GET_ELEMENT_BY_ID__;
    });
  if (replaceRootDuringDraw)
    await session.evaluate(() => {
      Node.prototype.appendChild = window.__EA_ORIGINAL_APPEND_CHILD__;
      delete window.__EA_ORIGINAL_APPEND_CHILD__;
      delete window.__EA_REPLACE_ROOT__;
    });
  const normalResearchRender = await session.evaluate(() => {
    const before = window.__EA_RESEARCH_GATE_EVENTS__.length;
    const researchTab = Array.from(
      document.querySelectorAll("#mainTabs .tabs li"),
    ).find((tab) => /research/i.test(tab.textContent ?? ""));
    researchTab?.querySelector("a")?.click();
    return {
      foundResearchTab: researchTab !== undefined,
      gateEventsBefore: before,
      offeredRows: document.querySelectorAll("#tech .action").length,
      grantedRows: document.querySelectorAll("#oldTech .action").length,
      gateEventsAfter: window.__EA_RESEARCH_GATE_EVENTS__.length,
    };
  });
  const result = await session.evaluate(() => {
    const events = window.__EA_RESEARCH_GATE_EVENTS__;
    return {
      events: {
        count: events.length,
        registryEnumerations: events.filter((event) => event.registryEnumerated)
          .length,
        installed: events.reduce((sum, event) => sum + event.installed, 0),
        invoked: events.reduce((sum, event) => sum + event.invoked, 0),
        restored: events.reduce((sum, event) => sum + event.restored, 0),
        restorationFailures: events.reduce(
          (sum, event) => sum + event.restorationFailures,
          0,
        ),
        uniqueCompletedKeys: [
          ...new Set(events.flatMap((event) => event.registryKeys)),
        ].sort(),
      },
      rootReplacementTriggered: window.__EA_ROOT_REPLACED__ === true,
      missingDomInterceptions: window.__EA_MISSING_DOM_INTERCEPTS__ ?? 0,
      researchTabLabels: Array.from(
        document.querySelectorAll("#mainTabs .tabs li"),
        (tab) => tab.textContent?.trim(),
      ),
      currentResearchPanel: document.querySelector("#mTabResearch") !== null,
      offeredRows: document.querySelectorAll("#tech .action").length,
      grantedRows: document.querySelectorAll("#oldTech .action").length,
      renderedOffers: Array.from(
        document.querySelectorAll("#tech .action"),
        (row) => ({
          id: row.id,
          title: row.querySelector(".button")?.textContent?.trim() ?? "",
          priceAttributes: Object.fromEntries(
            Array.from(row.querySelector(".button")?.attributes ?? [])
              .filter((attribute) => attribute.name.startsWith("data-"))
              .map((attribute) => [attribute.name, attribute.value]),
          ),
        }),
      ),
    };
  });
  const finalState = await session.readState();
  const diagnostics = await session.diagnostics();
  await writeFile(
    input("out"),
    `${JSON.stringify(
      {
        game,
        bundle,
        periods,
        result,
        warmup,
        normalResearchRender,
        progression: {
          initialDay: initialState.stats?.days,
          finalDay: finalState.stats?.days,
          initialTech: initialState.tech,
          finalTech: finalState.tech,
          finalQueues: {
            queue: finalState.queue,
            researchQueue: finalState.r_queue,
          },
        },
        diagnostics: {
          counts: diagnostics.counts,
          controlUsage: diagnostics.controlUsage,
          randomCalls: diagnostics.randomCalls,
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify(result));
} finally {
  await session?.close();
  await runner.close();
}
