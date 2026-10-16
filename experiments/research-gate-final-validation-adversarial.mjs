import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { patchResearchSnapshot } from "./research-fast-scratch.mjs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i], process.argv[i + 1]);
const required = (name) => {
  const value = args.get(`--${name}`);
  if (!value) throw new Error(`missing --${name}`);
  return resolve(value);
};
const output = required("out"),
  sourceGame = required("game"),
  settingsPath = required("settings"),
  settings = await readFile(settingsPath, "utf8");
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir =
  process.env.EA_TOOLS_DIR ?? resolve(rootDir, "../Evolve-Automation/tools");
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsDir, "chromium-evolve-runner.mjs")).href
);
const artifactDir = dirname(output);
await mkdir(artifactDir, { recursive: true });
const baseSource = await readFile(sourceGame, "utf8");
const traceSource = patchResearchSnapshot(baseSource, {
  suppressCompleted: false,
  instrument: true,
});
const marker = "if (researchTrace) researchTrace.draws += 1;";
if (traceSource.split(marker).length !== 2)
  throw new Error("drawTech trace boundary was not unique");
const nativeMutation = `if (window.__EA_NATIVE_DRAW_MUTATION__) {
      const mutation = window.__EA_NATIVE_DRAW_MUTATION__;
      if (mutation.kind) {
        const action = actions.tech[mutation.key];
        window.__EA_NATIVE_MUTATION_BEFORE__ = {
          root: global,
          tech: global.tech,
          registry: actions.tech,
          action,
          condition: Object.getOwnPropertyDescriptor(action, "condition")?.value,
        };
        if (mutation.kind === "registry") actions.tech = { ...actions.tech };
        if (mutation.kind === "action") actions.tech[mutation.key] = { ...action };
        if (mutation.kind === "tech") global.tech = { ...global.tech };
        if (mutation.kind === "root") global = makeReactive({ ...global });
        window.__EA_NATIVE_MUTATION_AFTER__ = {
          root: global,
          tech: global.tech,
          registry: actions.tech,
          action: actions.tech[mutation.key],
        };
      } else {
        global.tech[mutation.key] = mutation.level;
        if (mutation.legacyKey) global.tech[mutation.legacyKey] = mutation.legacyLevel;
      }
      window.__EA_NATIVE_DRAW_MUTATION_FIRED__ = true;
      delete window.__EA_NATIVE_DRAW_MUTATION__;
    }
    window.__EA_GATE_BOUNDARY_TEST__ = {
      replaceRoot() {
        global = makeReactive({ ...global });
        window.__EA_GATE_BOUNDARY_LAST_ROOT__ = global;
      },
      replaceRegistry() { actions.tech = { ...actions.tech }; },
      replaceAction(key) { actions.tech[key] = { ...actions.tech[key] }; },
      readRoot() { return global; },
      readRegistry() { return actions.tech; },
    };`;
const instrumentedGame = traceSource.replace(
  marker,
  `${marker}\n    ${nativeMutation}`,
);
const testGame = resolve(artifactDir, "adversarial-research-game.js");
await writeFile(testGame, instrumentedGame);
await writeFile(
  `${testGame}.json`,
  await readFile(`${sourceGame}.json`, "utf8"),
);
const metadata =
  (
    await readFile(resolve(rootDir, "src/userscript.meta.js"), "utf8")
  ).trimEnd() +
  String.fromCharCode(10, 10) +
  "globalThis.__EA_TEST_HOOKS__ ??= {};";
const testBundle = resolve(artifactDir, "B2-test-surface.user.js");
await esbuild.build({
  absWorkingDir: rootDir,
  entryPoints: ["src/main.ts"],
  outfile: testBundle,
  bundle: true,
  banner: { js: metadata },
  format: "iife",
  platform: "browser",
  target: ["esnext"],
  treeShaking: true,
  minifySyntax: true,
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
    __EA_RESEARCH_CONDITION_GATE_ENABLED__: "true",
  },
});
const seed = 42,
  warmup = 400,
  runner = await createChromiumRunner({
    game: testGame,
    upstream: "D:/work/Evolve-DeadSpace",
  });
const mutationCases = [
    ["newly-completed", required("mid")],
    ["checkOldTech-vax_strat1", required("late")],
  ],
  mutationResults = [];
async function runMutation(name, savePath) {
  let session;
  try {
    const save = parseSave(await readFile(savePath, "utf8"));
    if (name === "checkOldTech-vax_strat1") {
      save.tech.focus_cure = 6;
      save.tech.vax_p = 1;
    }
    session = await runner.openSession({
      bundle: testBundle,
      save,
      settings,
      seed,
    });
    await session.advance(warmup);
    const prepared = await session.evaluate((name) => {
      const page = window[Symbol.for("evolve-automation.page-capture")],
        hooks = window.__EA_TEST_HOOKS__,
        root = page.rootState.readRoot(),
        definitions = page.mechanics.readTechDefinitions(),
        catalog = hooks.readCurrentResearchCatalog?.("", true);
      let candidate, mutation;
      if (name === "newly-completed") {
        const offered = new Set(
          (catalog?.offers ?? []).map((item) => item.elementId),
        );
        candidate = definitions.find(
          (item) =>
            offered.has(item.actionId) &&
            !(
              root.tech[item.grantTechnology] &&
              root.tech[item.grantTechnology] >= item.grantLevel
            ),
        );
        if (candidate)
          mutation = {
            key: candidate.grantTechnology,
            level: candidate.grantLevel,
          };
      } else {
        candidate = definitions.find(
          (item) =>
            item.registryKey === "vax_strat1" &&
            root.tech.vax_p &&
            root.tech[item.grantTechnology] >= item.grantLevel,
        );
        if (candidate) mutation = { key: "vax_p", level: 0 };
      }
      if (!candidate || !mutation)
        return {
          error: "no current native candidate",
          offerCount: catalog?.offers?.length,
          definitionCount: definitions?.length,
        };
      window.__EA_RESEARCH_DRAW_TRACE__ = {
        draws: 0,
        offers: 0,
        completed: 0,
        callbackCount: 0,
        completedCallbackMs: 0,
        conditionCalls: 0,
      };
      window.__EA_RESEARCH_GATE_EVENTS__ = [];
      hooks.researchConditionGate = (event) =>
        window.__EA_RESEARCH_GATE_EVENTS__.push(event);
      window.__EA_NATIVE_DRAW_MUTATION__ = mutation;
      window.__EA_NATIVE_DRAW_MUTATION_FIRED__ = false;
      return {
        actionId: candidate.actionId,
        registryKey: candidate.registryKey,
        grantTechnology: candidate.grantTechnology,
        grantLevel: candidate.grantLevel,
        beforeLevel: root.tech[candidate.grantTechnology] ?? 0,
        mutation,
        wasOffered: (catalog?.offers ?? []).some(
          (item) => item.elementId === candidate.actionId,
        ),
      };
    }, name);
    if (prepared.error) return { name, ...prepared };
    let advanceError;
    try {
      await session.advance(8);
    } catch (error) {
      advanceError = String(error);
    }
    let evidence;
    try {
      evidence = await session.evaluate((actionId) => {
        const hooks = window.__EA_TEST_HOOKS__,
          trace = window.__EA_RESEARCH_DRAW_TRACE__,
          events = window.__EA_RESEARCH_GATE_EVENTS__ ?? [];
        let fresh, readError;
        try {
          fresh = hooks.readCurrentResearchCatalog?.(actionId, true);
        } catch (error) {
          readError = String(error);
        }
        return {
          mutationFired: window.__EA_NATIVE_DRAW_MUTATION_FIRED__ === true,
          draws: trace?.draws ?? 0,
          gate: {
            invocations: events.length,
            installed: events.reduce((s, e) => s + e.installed, 0),
            invoked: events.reduce((s, e) => s + e.invoked, 0),
            restored: events.reduce((s, e) => s + e.restored, 0),
            restorationFailures: events.reduce(
              (s, e) => s + e.restorationFailures,
              0,
            ),
          },
          freshCurrent: fresh?.current,
          freshOffers: fresh?.offers?.map((item) => item.elementId) ?? [],
          freshOfferCount: fresh?.offers?.length ?? 0,
          readError,
        };
      }, prepared.actionId);
    } catch (error) {
      evidence = { evidenceError: String(error) };
    }
    const diagnostics = await session.diagnostics();
    return {
      name,
      ...prepared,
      ...evidence,
      advanceError,
      gameErrors: diagnostics.events
        .filter((e) => e.kind === "error")
        .map((e) => e.text),
    };
  } finally {
    await session?.close();
  }
}
try {
  for (const [name, savePath] of mutationCases) {
    const result = await runMutation(name, savePath);
    mutationResults.push(result);
    console.log(
      JSON.stringify({
        test: name,
        actionId: result.actionId,
        mutationFired: result.mutationFired,
        freshCurrent: result.freshCurrent,
        beforeOffer: result.wasOffered,
        afterOffer: result.freshOffers?.includes(result.actionId),
        gate: result.gate,
        errors: result.gameErrors,
      }),
    );
  }
  for (const kind of ["registry", "action", "tech", "root"]) {
    let session;
    try {
      session = await runner.openSession({
        bundle: testBundle,
        save: parseSave(await readFile(required("mid"), "utf8")),
        settings,
        seed,
      });
      await session.advance(warmup);
      const prepared = await session.evaluate((kind) => {
        const page = window[Symbol.for("evolve-automation.page-capture")],
          hooks = window.__EA_TEST_HOOKS__,
          root = page.rootState.readRoot(),
          definitions = page.mechanics.readTechDefinitions();
        const candidate = definitions.find(
          (item) => root.tech[item.grantTechnology] >= item.grantLevel,
        );
        if (!candidate)
          return { error: "no completed native action candidate" };
        window.__EA_RESEARCH_DRAW_TRACE__ = {
          draws: 0,
          offers: 0,
          completed: 0,
          callbackCount: 0,
          completedCallbackMs: 0,
          conditionCalls: 0,
        };
        window.__EA_RESEARCH_GATE_EVENTS__ = [];
        hooks.researchConditionGate = (event) =>
          window.__EA_RESEARCH_GATE_EVENTS__.push(event);
        window.__EA_NATIVE_DRAW_MUTATION__ = {
          kind,
          key: candidate.registryKey,
        };
        window.__EA_NATIVE_DRAW_MUTATION_FIRED__ = false;
        return {
          actionId: candidate.actionId,
          registryKey: candidate.registryKey,
        };
      }, kind);
      if (prepared.error) {
        mutationResults.push({ test: `replace-${kind}`, ...prepared });
        console.log(JSON.stringify({ test: `replace-${kind}`, ...prepared }));
        continue;
      }
      let advanceError;
      try {
        await session.advance(8);
      } catch (error) {
        advanceError = String(error);
      }
      const evidence = await session.evaluate((actionId) => {
        const page = window[Symbol.for("evolve-automation.page-capture")],
          hooks = window.__EA_TEST_HOOKS__,
          before = window.__EA_NATIVE_MUTATION_BEFORE__,
          after = window.__EA_NATIVE_MUTATION_AFTER__,
          events = window.__EA_RESEARCH_GATE_EVENTS__ ?? [];
        let catalog, readError;
        try {
          catalog = hooks.readCurrentResearchCatalog?.(actionId, true);
        } catch (error) {
          readError = String(error);
        }
        return {
          mutationFired: window.__EA_NATIVE_DRAW_MUTATION_FIRED__ === true,
          rootChanged: before?.root !== after?.root,
          rootObservedByRuntime: after?.root === page.rootState.readRoot(),
          techChanged: before?.tech !== after?.tech,
          registryChanged: before?.registry !== after?.registry,
          actionChanged: before?.action !== after?.action,
          oldActionConditionRestored:
            before?.action?.condition !== before?.condition,
          replacementRetainedGateWrapper:
            before?.action !== after?.action &&
            after?.action?.condition === before?.condition,
          freshCurrent: catalog?.current,
          freshOfferCount: catalog?.offers?.length ?? 0,
          readError,
          gate: {
            invocations: events.length,
            installed: events.reduce((sum, event) => sum + event.installed, 0),
            restored: events.reduce((sum, event) => sum + event.restored, 0),
            replacementRestored: events.reduce(
              (sum, event) => sum + event.replacementRestored,
              0,
            ),
            restorationFailures: events.reduce(
              (sum, event) => sum + event.restorationFailures,
              0,
            ),
          },
        };
      }, prepared.actionId);
      const result = {
        test: `replace-${kind}`,
        ...prepared,
        ...evidence,
        advanceError,
      };
      mutationResults.push(result);
      console.log(JSON.stringify(result));
    } finally {
      await session?.close();
    }
  }
  for (const timing of [
    "registry-before-validation",
    "root-between-validation-and-installation",
    "root-after-partial-installation",
    "root-during-restoration",
  ]) {
    let session;
    try {
      session = await runner.openSession({
        bundle: testBundle,
        save: parseSave(await readFile(required("mid"), "utf8")),
        settings,
        seed,
      });
      await session.advance(warmup);
      await session.evaluate((timing) => {
        const page = window[Symbol.for("evolve-automation.page-capture")],
          hooks = window.__EA_TEST_HOOKS__,
          definitions = page.mechanics.readTechDefinitions(),
          candidate = definitions?.[0];
        if (!candidate) throw new Error("no native action for boundary test");
        window.__EA_GATE_BOUNDARY_EVENTS__ = [];
        hooks.researchConditionGate = (event) =>
          window.__EA_GATE_BOUNDARY_EVENTS__.push(event);
        window.__EA_GATE_BOUNDARY_TIMING__ = timing;
        window.__EA_GATE_BOUNDARY_INSTALLS__ = 0;
        window.__EA_GATE_BOUNDARY_RESTORES__ = new WeakMap();
        window.__EA_GATE_BOUNDARY_ORIGINAL_DEFINE__ = Reflect.defineProperty;
        if (timing === "registry-before-validation") {
          window.__EA_GATE_BOUNDARY_PRIOR_REGISTRY__ =
            window.__EA_GATE_BOUNDARY_TEST__.readRegistry();
          window.__EA_GATE_BOUNDARY_TEST__.replaceRegistry();
        } else {
          const original = Reflect.defineProperty;
          Reflect.defineProperty = function (target, property, descriptor) {
            if (
              property === "condition" &&
              typeof descriptor.value === "function"
            ) {
              const installed =
                window.__EA_GATE_BOUNDARY_RESTORES__.get(target);
              const current = Reflect.getOwnPropertyDescriptor(
                target,
                property,
              );
              if (installed !== undefined && current?.value === installed) {
                if (timing === "root-during-restoration") {
                  window.__EA_GATE_BOUNDARY_TEST__.replaceRoot();
                  window.__EA_GATE_BOUNDARY_TIMING__ = "restoration-mutated";
                }
              } else if (installed === undefined) {
                window.__EA_GATE_BOUNDARY_INSTALLS__ += 1;
                if (
                  timing === "root-between-validation-and-installation" &&
                  window.__EA_GATE_BOUNDARY_INSTALLS__ === 1
                )
                  window.__EA_GATE_BOUNDARY_TEST__.replaceRoot();
                if (
                  timing === "root-after-partial-installation" &&
                  window.__EA_GATE_BOUNDARY_INSTALLS__ === 2
                )
                  window.__EA_GATE_BOUNDARY_TEST__.replaceRoot();
                const result = Reflect.apply(original, this, [
                  target,
                  property,
                  descriptor,
                ]);
                if (result)
                  window.__EA_GATE_BOUNDARY_RESTORES__.set(
                    target,
                    descriptor.value,
                  );
                return result;
              }
            }
            return Reflect.apply(original, this, [
              target,
              property,
              descriptor,
            ]);
          };
        }
      }, timing);
      let advanceError;
      try {
        await session.advance(8);
      } catch (error) {
        advanceError = String(error);
      }
      const evidence = await session.evaluate(async (timing) => {
        const page = window[Symbol.for("evolve-automation.page-capture")],
          hooks = window.__EA_TEST_HOOKS__,
          events = window.__EA_GATE_BOUNDARY_EVENTS__ ?? [],
          tab = [...document.querySelectorAll("#mainTabs .tabs li")].find(
            (row) => /research/i.test(row.textContent ?? ""),
          );
        Reflect.defineProperty = window.__EA_GATE_BOUNDARY_ORIGINAL_DEFINE__;
        if (timing === "registry-before-validation") {
          const other = [
            ...document.querySelectorAll("#mainTabs .tabs li"),
          ].find((row) => !/research/i.test(row.textContent ?? ""));
          other?.querySelector("a")?.click();
          tab?.querySelector("a")?.click();
          await new Promise((resolve) => window.Vue.nextTick(resolve));
        }
        let catalog;
        try {
          catalog = hooks.readCurrentResearchCatalog?.("", true);
        } catch {}
        const other = [...document.querySelectorAll("#mainTabs .tabs li")].find(
          (row) => !/research/i.test(row.textContent ?? ""),
        );
        other?.querySelector("a")?.click();
        tab?.querySelector("a")?.click();
        await new Promise((resolve) => window.Vue.nextTick(resolve));
        return {
          mutationCount: window.__EA_GATE_BOUNDARY_INSTALLS__,
          timing,
          rootWasReplaced: window.__EA_GATE_BOUNDARY_LAST_ROOT__ !== undefined,
          registryReplacedBeforeValidation:
            timing === "registry-before-validation" &&
            window.__EA_GATE_BOUNDARY_PRIOR_REGISTRY__ !==
              window.__EA_GATE_BOUNDARY_TEST__.readRegistry(),
          rootIsRuntimeAuthority:
            window.__EA_GATE_BOUNDARY_LAST_ROOT__ === undefined ||
            page.rootState.readRoot() ===
              window.__EA_GATE_BOUNDARY_TEST__.readRoot(),
          events: events.map((event) => ({
            installed: event.installed,
            restored: event.restored,
            restorationFailures: event.restorationFailures,
          })),
          freshCurrent: catalog?.current,
          freshOffers: catalog?.offers?.length,
          offersInUi: document.querySelectorAll("#tech .action").length,
          grantedInUi: document.querySelectorAll("#oldTech .action").length,
          uiMatchesFreshOffers:
            catalog?.offers?.length ===
            document.querySelectorAll("#tech .action").length,
          active: page.mechanics.researchConditionGateActive?.(),
          compromised: page.mechanics.researchConditionGateCompromised?.(),
        };
      }, timing);
      const result = { test: timing, ...evidence, advanceError };
      mutationResults.push(result);
      console.log(JSON.stringify(result));
    } finally {
      await session?.close();
    }
  }
  const save = parseSave(await readFile(required("mid"), "utf8"));
  let session;
  try {
    session = await runner.openSession({
      bundle: testBundle,
      save,
      settings,
      seed,
    });
    await session.advance(warmup);
    const reentrancy = await session.evaluate(async () => {
      const page = window[Symbol.for("evolve-automation.page-capture")],
        hooks = window.__EA_TEST_HOOKS__;
      window.__EA_RESEARCH_DRAW_TRACE__ = {
        draws: 0,
        offers: 0,
        completed: 0,
        callbackCount: 0,
        completedCallbackMs: 0,
        conditionCalls: 0,
      };
      const tabs = Array.from(document.querySelectorAll("#mainTabs .tabs li")),
        research = tabs.find((tab) => /research/i.test(tab.textContent ?? "")),
        other = tabs.find((tab) => !/research/i.test(tab.textContent ?? ""));
      const draw = () => {
        other?.querySelector("a")?.click();
        research?.querySelector("a")?.click();
        return {
          offers: Array.from(
            document.querySelectorAll("#tech .action"),
            (row) => row.id,
          ),
          granted: Array.from(
            document.querySelectorAll("#oldTech .action"),
            (row) => row.id,
          ),
        };
      };
      const flushUi = () =>
        new Promise((resolve) => window.Vue.nextTick(resolve));
      draw();
      await flushUi();
      const before = {
        offers: Array.from(
          document.querySelectorAll("#tech .action"),
          (row) => row.id,
        ),
        granted: Array.from(
          document.querySelectorAll("#oldTech .action"),
          (row) => row.id,
        ),
      };
      window.__EA_RESEARCH_GATE_EVENTS__ = [];
      hooks.researchConditionGate = (event) =>
        window.__EA_RESEARCH_GATE_EVENTS__.push(event);
      let nestedDraws = 0,
        nestedError,
        nestedOuterError,
        grantedRead,
        grantedError;
      try {
        page.mechanics.captureCompletedTechConditionsDuring(() => {
          try {
            page.mechanics.captureCompletedTechConditionsDuring(() => {
              nestedDraws += 1;
            });
          } catch (error) {
            nestedError = String(error);
          }
          try {
            grantedRead = hooks.readCurrentResearchCatalog?.("", true);
          } catch (error) {
            grantedError = String(error);
          }
        });
      } catch (error) {
        nestedOuterError = String(error);
      }
      const drawsAfterNested = window.__EA_RESEARCH_DRAW_TRACE__.draws;
      let during,
        outerError,
        clickWasReentrant = false;
      const researchAnchor = research?.querySelector("a");
      researchAnchor?.addEventListener("click", () => {
        clickWasReentrant =
          page.mechanics.researchConditionGateActive?.() === true;
      });
      try {
        page.mechanics.captureCompletedTechConditionsDuring(() => {
          other?.querySelector("a")?.click();
          researchAnchor?.click();
          during = draw();
        });
      } catch (error) {
        outerError = String(error);
      }
      await flushUi();
      const after = {
        offers: Array.from(
          document.querySelectorAll("#tech .action"),
          (row) => row.id,
        ),
        granted: Array.from(
          document.querySelectorAll("#oldTech .action"),
          (row) => row.id,
        ),
      };
      const events = window.__EA_RESEARCH_GATE_EVENTS__ ?? [];
      const equal = (a, b) =>
        JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      return {
        tabCount: tabs.length,
        tabLabels: tabs.map((tab) => tab.textContent?.trim()),
        researchTabFound: research !== undefined,
        researchPanelFound: document.querySelector("#mTabResearch") !== null,
        before: {
          offers: before.offers.length,
          granted: before.granted.length,
        },
        nested: {
          drawsAfterNested,
          nestedDraws,
          nestedError,
          nestedOuterError,
          grantedCatalogCurrent: grantedRead?.current,
          grantedError,
          active: page.mechanics.researchConditionGateActive?.(),
        },
        reentrantPlayerRender: {
          clickWasReentrant,
          during: {
            offers: during?.offers.length,
            granted: during?.granted.length,
          },
          after: { offers: after.offers.length, granted: after.granted.length },
          offerMembershipEqual: equal(during?.offers ?? [], after.offers),
          grantedMembershipEqual: equal(during?.granted ?? [], after.granted),
          outerError,
          draws: window.__EA_RESEARCH_DRAW_TRACE__.draws,
        },
        descriptors: {
          installed: events.reduce((s, e) => s + e.installed, 0),
          restored: events.reduce((s, e) => s + e.restored, 0),
          restorationFailures: events.reduce(
            (s, e) => s + e.restorationFailures,
            0,
          ),
        },
      };
    });
    mutationResults.push({ test: "reentrancy", ...reentrancy });
    console.log(JSON.stringify({ test: "reentrancy", ...reentrancy }));
  } finally {
    await session?.close();
  }
} finally {
  await runner.close();
}
await writeFile(
  output,
  JSON.stringify(
    {
      runner: "exact Chromium",
      game: sourceGame,
      testGame,
      testBundle,
      settings: settingsPath,
      seed,
      warmup,
      mutationResults,
    },
    null,
    2,
  ) + "\n",
);
