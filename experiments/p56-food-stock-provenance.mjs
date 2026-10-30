import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as prettier from "prettier";
import ts from "typescript";
import {
  compareP43NativeCallDiagnostics,
  normalizeNativeInvocationTrace,
  parseNativeTraceJsonl,
  summarizeNativeInvocationTrace,
} from "./p56-native-invocation-accounting.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value);
const nativeSnapshotPath = path.join(
  root,
  "test-artifacts/game/evolve-deadspace.js",
);
const p43TimelinePath = path.join(
  root,
  "experiments/p43-food-safe-jobs-timeline.json",
);
const p45TimelinePath = path.join(
  root,
  "experiments/p45-food-stock-timeline.json",
);
const p43ReplayPath = path.join(
  root,
  "experiments/p43-food-safe-jobs-exact.mjs",
);
const replayHarnessSourcePath = path.join(
  root,
  "experiments/p38-quarry-production-validation-exact.mjs",
);
const nativeTracePaths = {
  armA: path.join(root, "experiments/p56-native-invocation-trace-arm-a.jsonl"),
  armB: path.join(root, "experiments/p56-native-invocation-trace-arm-b.jsonl"),
};
const tmp = path.join(root, "test-artifacts/benchmark/tmp");
const sourceSnapshotSha256 =
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7";
const nativeTraceAuditReplayHarnessSha256 =
  "a71b6f7085c4b3449cfde442a3178431eab31cade57b4563dcb11cf9be462c43";
const pinnedGame =
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f";
const seed = 44;
const epoch = "2026-09-21T00:00:00.000Z";

const assignmentOperators = new Set([
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**=",
  "<<=",
  ">>=",
  ">>>=",
  "&=",
  "|=",
  "^=",
  "&&=",
  "||=",
  "??=",
]);

function functionDeclarations(sourceFile, name) {
  const matches = [];
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches;
}

function globalResourceAmount(node, sourceFile) {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== "amount")
    return null;
  const resource = node.expression;
  if (
    !ts.isPropertyAccessExpression(resource) &&
    !ts.isElementAccessExpression(resource)
  )
    return null;
  const base = resource.expression;
  const globalResourceProperty =
    ts.isPropertyAccessExpression(base) &&
    base.name.text === "resource" &&
    base.expression.getText(sourceFile) === "global";
  const globalResourceElement =
    ts.isElementAccessExpression(base) &&
    base.expression.getText(sourceFile) === "global" &&
    (ts.isStringLiteral(base.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(base.argumentExpression)) &&
    base.argumentExpression.text === "resource";
  if (!globalResourceProperty && !globalResourceElement) return null;
  if (ts.isPropertyAccessExpression(resource)) {
    return resource.name.text === "Food"
      ? { resourceExpression: resource.getText(sourceFile), key: "Food" }
      : null;
  }
  if (!ts.isElementAccessExpression(resource)) return null;
  const key = resource.argumentExpression;
  if (!key) return null;
  if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key))
    return key.text === "Food"
      ? { resourceExpression: resource.getText(sourceFile), key: "Food" }
      : null;
  if (key.getText(sourceFile) === "global.race.species") return null;
  return {
    resourceExpression: resource.getText(sourceFile),
    key: "dynamic",
  };
}

function enclosingFunctionName(node, sourceFile) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isFunctionDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isArrowFunction(parent)
    )
      return parent.name?.getText(sourceFile) ?? "<anonymous>";
  }
  return "<module>";
}

function helperSource(windows) {
  return `const __p56FoodWindows=${JSON.stringify(windows)};const __p56FoodTraceContext=(skip=0)=>{try{const period=Number(window.__EA_RUNNER__?.periods?.());const arm=window.__EA_TEST_HOOKS__?.p43Arm??null;if(!Number.isSafeInteger(period)||arm!=="B"||!__p56FoodWindows.some(([start,end])=>period>=start&&period<=end))return null;const event=window.__EA_TEST_HOOKS__?.p43Events?.at(-1)??null;const frames=String(new Error().stack??"").split("\\n").slice(2+skip,8+skip).map((frame)=>frame.trim());const identity=event?.identity??null;return{period,arm,phase:frames[0]??null,callsiteStack:frames,rootIdentity:identity?{observationPeriod:event.period??null,rootGeneration:identity.rootGeneration??null,progressionGeneration:identity.progressionGeneration??null,rootMatches:identity.rootMatches??null}:null,lastObservedFlow:event?{observationPeriod:event.period??null,foodProduction:event.foodOutput??null,foodConsumption:event.foodConsumption??null,foodNet:event.foodNet??null}:null};}catch{return null;}};const __p56FoodRecord=(context,row)=>{try{const writes=window.__P56_FOOD_WRITES__??(window.__P56_FOOD_WRITES__=[]);if(writes.length>=10000){window.__P56_FOOD_TRACE_OVERFLOW__=(window.__P56_FOOD_TRACE_OVERFLOW__??0)+1;return;}const food=global.resource.Food;writes.push({order:writes.length,period:context.period,phase:row.phase??context.phase,writer:row.writer,callsite:row.callsite??context.phase,cause:row.cause??context.phase,callsiteStack:context.callsiteStack,before:row.before,after:row.after,delta:row.after-row.before,requestedDelta:row.requestedDelta??null,poolScope:row.poolScope??row.poolMode??"unknown",poolMode:row.poolMode??"unknown",poolId:row.poolId??null,beforePool:row.beforePool??null,afterPool:row.afterPool??null,poolChanges:row.poolChanges??null,poolStatesBefore:row.poolStatesBefore??null,poolStatesAfter:row.poolStatesAfter??null,foodCapacity:row.foodCapacity??food?.max??null,foodDiff:food?.diff??null,foodDelta:food?.delta??null,notrack:row.notrack??null,relevantInput:row.relevantInput??context.lastObservedFlow,rootIdentity:context.rootIdentity??null});}catch{window.__P56_FOOD_TRACE_ERRORS__=(window.__P56_FOOD_TRACE_ERRORS__??0)+1;}};let __p56RegionalFoodWriteDepth=0;`;
}

function wrapperSource(name) {
  if (name === "modRes")
    return `;const __p56OriginalModRes=modRes;modRes=function(res,val,notrack,region){if(res!=="Food"||partitioned(res))return __p56OriginalModRes.apply(this,arguments);const context=__p56FoodTraceContext(1);if(!context)return __p56OriginalModRes.apply(this,arguments);const food=global.resource.Food;const before=food.amount;const poolMode=supplyMode();let result;try{result=__p56OriginalModRes.apply(this,arguments);}finally{const after=food.amount;if(after!==before)__p56FoodRecord(context,{writer:"modRes",before,after,requestedDelta:val,poolMode,poolScope:poolMode,poolId:region===void 0?"global":String(region),foodCapacity:food.max,notrack});}return result;};`;
  if (name === "modRegRes")
    return `;const __p56OriginalModRegRes=modRegRes;modRegRes=function(res,val,notrack,region){if(res!=="Food")return __p56OriginalModRegRes.apply(this,arguments);const context=__p56FoodTraceContext(1);if(!context)return __p56OriginalModRegRes.apply(this,arguments);const food=global.resource.Food;const before=food.amount;const beforePools=food.reg?Object.fromEntries(Object.entries(food.reg)):null;const poolMode=supplyMode();let result;__p56RegionalFoodWriteDepth++;try{result=__p56OriginalModRegRes.apply(this,arguments);}finally{__p56RegionalFoodWriteDepth--;const after=food.amount;const afterPools=food.reg?Object.fromEntries(Object.entries(food.reg)):null;const keys=new Set([...Object.keys(beforePools??{}),...Object.keys(afterPools??{})]);const poolChanges=[...keys].filter((key)=>beforePools?.[key]!==afterPools?.[key]).map((poolId)=>({poolId,before:beforePools?.[poolId]??0,after:afterPools?.[poolId]??0,delta:(afterPools?.[poolId]??0)-(beforePools?.[poolId]??0)}));if(after!==before||poolChanges.length)__p56FoodRecord(context,{writer:"modRegRes",before,after,requestedDelta:val,poolMode,poolScope:"regional",poolId:poolChanges.map((entry)=>entry.poolId).join(",")||String(region??"default"),poolChanges,beforePool:poolChanges.length===1?poolChanges[0].before:null,afterPool:poolChanges.length===1?poolChanges[0].after:null,foodCapacity:food.max,notrack});}return result;};`;
  if (name === "poolMod")
    return `;const __p56OriginalPoolMod=poolMod;poolMod=function(res,pool,val){if(res!=="Food"||__p56RegionalFoodWriteDepth>0)return __p56OriginalPoolMod.apply(this,arguments);const context=__p56FoodTraceContext(1);if(!context)return __p56OriginalPoolMod.apply(this,arguments);const food=global.resource.Food;const before=food.amount;const beforePools=food.reg?Object.fromEntries(Object.entries(food.reg)):null;const poolId=pool===ANYWHERE?"ANYWHERE":String(pool);let result;__p56RegionalFoodWriteDepth++;try{result=__p56OriginalPoolMod.apply(this,arguments);}finally{__p56RegionalFoodWriteDepth--;const after=food.amount;const afterPools=food.reg?Object.fromEntries(Object.entries(food.reg)):null;const keys=new Set([...Object.keys(beforePools??{}),...Object.keys(afterPools??{})]);const poolChanges=[...keys].filter((key)=>beforePools?.[key]!==afterPools?.[key]).map((key)=>({poolId:key,before:beforePools?.[key]??0,after:afterPools?.[key]??0,delta:(afterPools?.[key]??0)-(beforePools?.[key]??0)}));if(after!==before||poolChanges.length)__p56FoodRecord(context,{writer:"poolMod",before,after,requestedDelta:val,poolMode:supplyMode(),poolScope:"regional",poolId,poolChanges,beforePool:beforePools?.[poolId]??null,afterPool:afterPools?.[poolId]??null,foodCapacity:food.max});}return result;};`;
  if (name === "clampPools")
    return `;const __p56OriginalClampPools=clampPools;clampPools=function(res){if(res!=="Food"||__p56RegionalFoodWriteDepth>0)return __p56OriginalClampPools.apply(this,arguments);const context=__p56FoodTraceContext(1);if(!context)return __p56OriginalClampPools.apply(this,arguments);const food=global.resource.Food;const before=food.amount;const beforePools=food.reg?Object.fromEntries(Object.entries(food.reg)):null;let result;__p56RegionalFoodWriteDepth++;try{result=__p56OriginalClampPools.apply(this,arguments);}finally{__p56RegionalFoodWriteDepth--;const after=food.amount;const afterPools=food.reg?Object.fromEntries(Object.entries(food.reg)):null;const keys=new Set([...Object.keys(beforePools??{}),...Object.keys(afterPools??{})]);const poolChanges=[...keys].filter((key)=>beforePools?.[key]!==afterPools?.[key]).map((poolId)=>({poolId,before:beforePools?.[poolId]??0,after:afterPools?.[poolId]??0,delta:(afterPools?.[poolId]??0)-(beforePools?.[poolId]??0)}));if(after!==before||poolChanges.length)__p56FoodRecord(context,{writer:"clampPools",before,after,poolMode:supplyMode(),poolScope:supplyMode(),poolId:"all-regional-pools",poolChanges,poolStatesBefore:beforePools,poolStatesAfter:afterPools,foodCapacity:food.max});}return result;};`;
  if (name === "drawPools")
    return `;const __p56OriginalDrawPools=drawPools;drawPools=function(res,amount){if(res!=="Food"||__p56RegionalFoodWriteDepth>0)return __p56OriginalDrawPools.apply(this,arguments);const context=__p56FoodTraceContext(1);if(!context)return __p56OriginalDrawPools.apply(this,arguments);const food=global.resource.Food;const before=food.amount;const beforePools=food.reg?Object.fromEntries(Object.entries(food.reg)):null;let result;__p56RegionalFoodWriteDepth++;try{result=__p56OriginalDrawPools.apply(this,arguments);}finally{__p56RegionalFoodWriteDepth--;const after=food.amount;const afterPools=food.reg?Object.fromEntries(Object.entries(food.reg)):null;const keys=new Set([...Object.keys(beforePools??{}),...Object.keys(afterPools??{})]);const poolChanges=[...keys].filter((key)=>beforePools?.[key]!==afterPools?.[key]).map((poolId)=>({poolId,before:beforePools?.[poolId]??0,after:afterPools?.[poolId]??0,delta:(afterPools?.[poolId]??0)-(beforePools?.[poolId]??0)}));if(after!==before||poolChanges.length)__p56FoodRecord(context,{writer:"drawPools",before,after,requestedDelta:-amount,poolMode:supplyMode(),poolScope:"regional",poolId:"multiple-pools",poolChanges,poolStatesBefore:beforePools,poolStatesAfter:afterPools,foodCapacity:food.max});}return result;};`;
  if (name === "syncTotal")
    return `;const __p56OriginalSyncTotal=syncTotal;syncTotal=function(res){if(res!=="Food"||__p56RegionalFoodWriteDepth>0)return __p56OriginalSyncTotal.apply(this,arguments);const context=__p56FoodTraceContext(1);if(!context)return __p56OriginalSyncTotal.apply(this,arguments);const food=global.resource.Food;const before=food.amount;let result;__p56RegionalFoodWriteDepth++;try{result=__p56OriginalSyncTotal.apply(this,arguments);}finally{__p56RegionalFoodWriteDepth--;const after=food.amount;if(after!==before)__p56FoodRecord(context,{writer:"syncTotal",before,after,poolMode:supplyMode(),poolScope:"regional",poolId:"aggregate-sync",foodCapacity:food.max});}return result;};`;
  throw new Error(`unhandled P56 wrapper for ${name}`);
}

export function createP56FoodWriterSnapshot(source, windows) {
  const sourceFile = ts.createSourceFile(
    "evolve-deadspace.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const edits = [];
  const sites = [];
  const wrapperNames = [
    "syncTotal",
    "clampPools",
    "drawPools",
    "poolMod",
    "modRes",
    "modRegRes",
  ];
  for (const name of wrapperNames) {
    const declarations = functionDeclarations(sourceFile, name);
    assert.equal(
      declarations.length,
      1,
      `expected one native ${name} function`,
    );
    edits.push({
      start: declarations[0].end,
      end: declarations[0].end,
      text: wrapperSource(name),
    });
  }

  const isUpdate = (node) =>
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken);
  const visit = (node) => {
    const expression = ts.isBinaryExpression(node)
      ? assignmentOperators.has(node.operatorToken.getText(sourceFile))
        ? node
        : null
      : isUpdate(node)
        ? node
        : null;
    if (expression) {
      const left = ts.isBinaryExpression(expression)
        ? expression.left
        : expression.operand;
      const target = globalResourceAmount(left, sourceFile);
      if (
        target !== null &&
        !wrapperNames.includes(enclosingFunctionName(expression, sourceFile))
      ) {
        const statement = expression.parent;
        assert.ok(
          ts.isExpressionStatement(statement) &&
            statement.expression === expression,
          `P56 cannot safely instrument non-statement Food amount write at line ${sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile)).line + 1}`,
        );
        const line =
          sourceFile.getLineAndCharacterOfPosition(
            expression.getStart(sourceFile),
          ).line + 1;
        const owner = enclosingFunctionName(expression, sourceFile);
        const site = {
          line,
          owner,
          resourceKey: target.key,
          operation: statement.getText(sourceFile),
        };
        const suffix = String(sites.length);
        const resourceExpression = target.resourceExpression;
        const statementText = statement.getText(sourceFile);
        const siteText = JSON.stringify(
          `test-artifacts/game/evolve-deadspace.js:${line} ${owner}`,
        );
        const replacement = `{const __p56Context${suffix}=__p56FoodTraceContext();const __p56Resource${suffix}=__p56Context${suffix}?(${resourceExpression}):null;const __p56Active${suffix}=__p56Context${suffix}!==null&&__p56Resource${suffix}===global.resource.Food;const __p56Before${suffix}=__p56Active${suffix}?__p56Resource${suffix}.amount:null;${statementText}if(__p56Active${suffix}){const __p56After${suffix}=__p56Resource${suffix}.amount;if(__p56After${suffix}!==__p56Before${suffix})__p56FoodRecord(__p56Context${suffix},{writer:"direct-amount-assignment",callsite:${siteText},operation:${JSON.stringify(statementText)},before:__p56Before${suffix},after:__p56After${suffix},poolMode:supplyMode(),poolScope:supplyMode(),poolId:"global-amount",foodCapacity:__p56Resource${suffix}.max});}}`;
        edits.push({
          start: statement.getStart(sourceFile),
          end: statement.end,
          text: replacement,
        });
        sites.push(site);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  assert.ok(source.startsWith("(() => {"), "unexpected pinned game wrapper");
  edits.push({
    start: "(() => {".length,
    end: "(() => {".length,
    text: helperSource(windows),
  });
  edits.sort((left, right) => right.start - left.start);
  let instrumented = source;
  for (const edit of edits)
    instrumented =
      instrumented.slice(0, edit.start) +
      edit.text +
      instrumented.slice(edit.end);
  assert.equal(
    instrumented.split(/\r?\n/u).length,
    source.split(/\r?\n/u).length,
    "P56 snapshot transformation must preserve native line numbers",
  );
  return {
    source: instrumented,
    directWriteSites: sites,
    wrappedFunctions: wrapperNames,
  };
}

function foodResilienceTransitions(timeline) {
  const transitions = [];
  for (let index = 1; index < timeline.points.length; index++) {
    const before = timeline.points[index - 1];
    const after = timeline.points[index];
    if (before.foodStock < 40 && after.foodStock === 50)
      transitions.push({ before, after });
  }
  return transitions;
}

function projectSample(point, timelineArm) {
  const event = timelineArm.events.find(
    (entry) => entry.period === point.period,
  );
  const checkpoint = timelineArm.checkpoints.find(
    (entry) => entry.period === point.period,
  );
  const exactState = checkpoint?.state ?? null;
  return {
    period: point.period,
    source: point.source,
    samplePhase: point.source.includes("Jobs observation")
      ? "P43 pre-executor Jobs observation"
      : point.source.includes("exact checkpoint")
        ? "P43 exact post-period checkpoint"
        : "P45 retained stock point; phase not separately retained",
    foodStock: point.foodStock,
    foodCapacity: point.foodCapacity,
    foodProduction:
      event?.foodProduction ?? checkpoint?.production?.foodOutput ?? null,
    foodConsumption:
      event?.foodConsumption ?? checkpoint?.production?.foodConsumption ?? null,
    foodNet: event?.foodNet ?? null,
    starvationCount: point.starvationCount,
    civilianPopulation: point.civilianPopulation,
    occupiedJobs: event?.occupiedJobs ?? exactState?.jobs ?? null,
    jobCatalog: event?.jobCatalog ?? null,
    ordinaryAssignments: event?.ordinaryAssignments ?? null,
    constrainedAssignments: event?.constrainedAssignments ?? null,
    defaultJobId: event?.defaultJobId ?? null,
    weather: event?.foodProducerRows?.["ᄂWeather"] ?? null,
    modifierInputs: event?.foodModifierInputs ?? null,
    rootIdentity: event?.identity ?? null,
    nativeActionDigest: checkpoint
      ? {
          count: checkpoint.nativeCallsCount,
          sha256: checkpoint.nativeCallsSha256,
        }
      : null,
    controlUsage: checkpoint?.controlUsage ?? null,
  };
}

function compareCheckpoint(left, right) {
  return (
    left.period === right.period &&
    left.saveSha256 === right.saveSha256 &&
    canonical(left.state) === canonical(right.state) &&
    canonical(left.production) === canonical(right.production) &&
    left.nativeCallsSha256 === right.nativeCallsSha256 &&
    left.nativeCallsCount === right.nativeCallsCount &&
    canonical(left.controlUsage) === canonical(right.controlUsage) &&
    left.randomCalls === right.randomCalls &&
    left.rngState === right.rngState &&
    canonical(left.native?.foodLedger ?? null) ===
      canonical(right.native?.foodLedger ?? null)
  );
}

function parityArm(left, right) {
  const rightByPeriod = new Map(
    right.armB.checkpoints.map((checkpoint) => [checkpoint.period, checkpoint]),
  );
  const checkpoints = left.armB.checkpoints.map((checkpoint) => ({
    period: checkpoint.period,
    exact: compareCheckpoint(
      checkpoint,
      rightByPeriod.get(checkpoint.period) ?? {},
    ),
  }));
  const leftTimeline = left.timeline;
  const rightTimeline = right.timeline;
  return {
    checkpointCount: checkpoints.length,
    checkpointExactCount: checkpoints.filter((entry) => entry.exact).length,
    checkpoints,
    eventsEqual:
      canonical(leftTimeline.armB.events) ===
      canonical(rightTimeline.armB.events),
    finalExportEqual:
      left.armB.finalExportSha256 === right.armB.finalExportSha256,
    finalRngEqual:
      canonical(left.armB.finalRng) === canonical(right.armB.finalRng),
    nativeActionSequenceEqual:
      canonical(left.armB.nativeActionSequence) ===
      canonical(right.armB.nativeActionSequence),
    interventionEventsEqual:
      left.armB.p43EventsSha256 === right.armB.p43EventsSha256 &&
      left.armB.p43EventCount === right.armB.p43EventCount,
  };
}

function parityRepeatedArm(left, right) {
  const rightByPeriod = new Map(
    right.checkpoints.map((checkpoint) => [checkpoint.period, checkpoint]),
  );
  const checkpoints = left.checkpoints.map((checkpoint) => ({
    period: checkpoint.period,
    exact: compareCheckpoint(
      checkpoint,
      rightByPeriod.get(checkpoint.period) ?? {},
    ),
  }));
  return {
    checkpointCount: checkpoints.length,
    checkpointExactCount: checkpoints.filter((entry) => entry.exact).length,
    checkpoints,
    eventsEqual:
      left.p43EventCount === right.p43EventCount &&
      left.p43EventsSha256 === right.p43EventsSha256,
    finalExportEqual: left.finalExportSha256 === right.finalExportSha256,
    finalRngEqual: canonical(left.finalRng) === canonical(right.finalRng),
    nativeActionSequenceEqual:
      canonical(left.nativeActionSequence) ===
      canonical(right.nativeActionSequence),
  };
}

function nativeTraceReconciliation(
  rawTraces,
  historicalTimeline,
  currentTimeline,
) {
  return Object.fromEntries(
    ["armA", "armB"].map((armName) => {
      const rawTrace = rawTraces[armName];
      const summary = summarizeNativeInvocationTrace(rawTrace);
      const checkpoints = compareP43NativeCallDiagnostics(
        rawTrace,
        historicalTimeline[armName]?.checkpoints ?? [],
        currentTimeline[armName]?.checkpoints ?? [],
      );
      return [
        armName,
        {
          rawTraceFile: nativeTracePaths[armName]
            .slice(root.length + 1)
            .replaceAll(path.sep, "/"),
          ...summary,
          foodHarvestActionInvocations: normalizeNativeInvocationTrace(
            rawTrace,
          ).filter(
            (entry) =>
              entry.method === "action" &&
              String(entry.elementId ?? "")
                .toLowerCase()
                .includes("food"),
          ).length,
          historicalP43CheckpointCount: checkpoints.length,
          historicalP43RawRecordCountsExact: checkpoints.every(
            (entry) => entry.historicalCountMatches,
          ),
          historicalP43RawRecordHashesExact: checkpoints.every(
            (entry) => entry.historicalHashMatches,
          ),
          reproducedP56InvocationCountsExact: checkpoints.every(
            (entry) => entry.reproducedCountMatches,
          ),
          reproducedP56InvocationHashesExact: checkpoints.every(
            (entry) => entry.reproducedHashMatches,
          ),
          transformedCountsExact: checkpoints.every(
            (entry) => entry.transformedCountMatches,
          ),
          transformedHashesExact: checkpoints.every(
            (entry) => entry.transformedHashMatches,
          ),
          checkpointComparisons: checkpoints,
        },
      ];
    }),
  );
}

function sourceReplayParity(clean, instrumented) {
  const result = parityArm(clean, instrumented);
  const retainedTimeline = JSON.parse(clean.retainedP43TimelineText);
  const retainedArms = ["armA", "armB", "armBRepeat"];
  const withoutNativeCallDigest = (checkpoint) => {
    const {
      nativeCallsCount: _count,
      nativeCallsSha256: _sha256,
      ...rest
    } = checkpoint;
    return rest;
  };
  const matchesRetained = retainedArms.every((armName) => {
    const current = clean.timeline[armName];
    const retained = retainedTimeline[armName];
    const currentCheckpoints = new Map(
      (current?.checkpoints ?? []).map((checkpoint) => [
        checkpoint.period,
        checkpoint,
      ]),
    );
    return (
      canonical(current?.events ?? []) === canonical(retained?.events ?? []) &&
      (retained?.checkpoints ?? []).every(
        (checkpoint) =>
          canonical(
            withoutNativeCallDigest(
              currentCheckpoints.get(checkpoint.period) ?? {},
            ),
          ) === canonical(withoutNativeCallDigest(checkpoint)),
      )
    );
  });
  const retainedNativeCallDigestsExact = retainedArms.every((armName) => {
    const currentByPeriod = new Map(
      (clean.timeline[armName]?.checkpoints ?? []).map((checkpoint) => [
        checkpoint.period,
        checkpoint,
      ]),
    );
    return (retainedTimeline[armName]?.checkpoints ?? []).every(
      (checkpoint) => {
        const current = currentByPeriod.get(checkpoint.period);
        return (
          current?.nativeCallsCount === checkpoint.nativeCallsCount &&
          current?.nativeCallsSha256 === checkpoint.nativeCallsSha256
        );
      },
    );
  });
  return {
    ...result,
    matchesRetainedP43StateAndEvents: matchesRetained,
    retainedNativeCallDigestsExact,
    retainedTimelineSha256: sha256(clean.retainedP43TimelineText),
    reproducedTimelineSha256: sha256(clean.timelineText),
  };
}

function mutationEvidence(transitions, run, timeline, nativeInvocations) {
  const arm = timeline.armB;
  const trace = run.armB.foodWriterTrace ?? [];
  const actions = run.armB.foodActionInvocations ?? [];
  const markers = run.armB.foodWriterMarkers ?? [];
  return transitions.map(({ before, after }, index) => {
    const beforeSample = projectSample(before, arm);
    const afterSample = projectSample(after, arm);
    const startPhase = before.source.includes("Jobs observation")
      ? "pre-executor-jobs"
      : "post-period-checkpoint";
    const endPhase = after.source.includes("Jobs observation")
      ? "pre-executor-jobs"
      : "post-period-checkpoint";
    const startMarker = markers.find(
      (entry) => entry.period === before.period && entry.phase === startPhase,
    );
    const endMarker = markers.find(
      (entry) => entry.period === after.period && entry.phase === endPhase,
    );
    const markerSlice =
      Number.isSafeInteger(startMarker?.writerOrder) &&
      Number.isSafeInteger(endMarker?.writerOrder)
        ? trace.filter(
            (entry) =>
              entry.order >= startMarker.writerOrder &&
              entry.order < endMarker.writerOrder,
          )
        : null;
    const jobsObservationSlice =
      before.source.includes("Jobs observation") &&
      after.source.includes("Jobs observation")
        ? trace.filter(
            (entry) =>
              Number.isSafeInteger(entry.rootIdentity?.observationPeriod) &&
              entry.rootIdentity.observationPeriod >= before.period &&
              entry.rootIdentity.observationPeriod < after.period,
          )
        : null;
    const boundaryWriters =
      markerSlice ??
      jobsObservationSlice ??
      trace.filter(
        (entry) => entry.period > before.period && entry.period <= after.period,
      );
    const sliceMethod =
      markerSlice !== null
        ? "writer-order between exact post-period checkpoint markers"
        : jobsObservationSlice !== null
          ? "root observation period between retained P43 pre-executor Jobs observations"
          : "period-only fallback; phase edge is unproven";
    const actionWriters = boundaryWriters.filter((entry) =>
      entry.callsiteStack?.some((frame) => frame.includes("runAction")),
    );
    const intervalActionDiagnosticCount = actions.filter(
      (entry) => entry.period > before.period && entry.period <= after.period,
    ).length;
    const foodHarvestActionInvocationCount = nativeInvocations.filter(
      (entry) =>
        entry.method === "action" &&
        String(entry.elementId ?? "")
          .toLowerCase()
          .includes("food") &&
        entry.period > before.period &&
        entry.period <= after.period,
    ).length;
    assert.equal(
      intervalActionDiagnosticCount,
      foodHarvestActionInvocationCount * 2,
      `Food action trace records must pair in ${before.period}–${after.period}`,
    );
    const observedDelta = after.foodStock - before.foodStock;
    const writerDelta = boundaryWriters.reduce(
      (sum, entry) => sum + Number(entry.delta ?? 0),
      0,
    );
    const priorNet = Number(beforeSample.foodNet);
    const boundaryHeldExpected = Number.isFinite(priorNet)
      ? (after.period - before.period) * 0.25 * priorNet
      : null;
    return {
      id: `food-50-${String(index + 1).padStart(2, "0")}`,
      fromPeriod: before.period,
      toPeriod: after.period,
      before: beforeSample,
      after: afterSample,
      observedNetStockChange: observedDelta,
      boundaryHeldExpectedChange: boundaryHeldExpected,
      boundaryHeldResidual:
        boundaryHeldExpected === null
          ? null
          : observedDelta - boundaryHeldExpected,
      starvationAndCivilianPopulationUnchanged:
        before.starvationCount === after.starvationCount &&
        before.civilianPopulation === after.civilianPopulation,
      phaseBoundary: {
        start: startMarker ?? { period: before.period, phase: startPhase },
        end: endMarker ?? { period: after.period, phase: endPhase },
        sliceMethod,
        exactWriterSlice: markerSlice !== null || jobsObservationSlice !== null,
      },
      foodWriters: boundaryWriters,
      foodActionTraceRecordCount: intervalActionDiagnosticCount,
      foodHarvestActionInvocationCount,
      foodActionWriterCount: actionWriters.length,
      foodActionWriterDelta: actionWriters.reduce(
        (sum, entry) => sum + Number(entry.delta ?? 0),
        0,
      ),
      writerDelta,
      writerDeltaMatchesObservedStockChange:
        Math.abs(writerDelta - observedDelta) < 1e-8,
      supplyModes: [...new Set(boundaryWriters.map((entry) => entry.poolMode))],
      writerGroups: Object.fromEntries(
        [...new Set(boundaryWriters.map((entry) => entry.writer))].map(
          (writer) => [
            writer,
            {
              count: boundaryWriters.filter((entry) => entry.writer === writer)
                .length,
              delta: boundaryWriters
                .filter((entry) => entry.writer === writer)
                .reduce((sum, entry) => sum + Number(entry.delta ?? 0), 0),
            },
          ],
        ),
      ),
    };
  });
}

function canonicalizeWriterCallsite(writer) {
  const sourceFrame = writer.callsiteStack?.find((frame) =>
    frame.includes("evolve/main.js:"),
  );
  const match = sourceFrame?.match(/evolve\/main\.js:(\d+):(\d+)/u);
  if (match)
    writer.callsite = `test-artifacts/game/evolve-deadspace.js:${match[1]}:${match[2]}`;
  if (
    writer.callsiteStack?.some((frame) => frame.includes("runAction")) &&
    writer.writer === "modRes"
  )
    writer.actionIdentity =
      "native Food resource action invoked by existing Gather adapter";
}

/*
 * The compact replay record omits phase markers. Read the same-run interim
 * captures, which retain those markers, so phase attribution uses observed
 * writer order rather than a period-only approximation.
 */
async function attachInterimFoodMarkers(run, kind) {
  const interim = JSON.parse(
    await readFile(path.join(tmp, `p56-${kind}-interim.json`), "utf8"),
  );
  assert.equal(interim.runtimeBundleSha256, run.runtimeBundleSha256);
  assert.equal(interim.policyBundleSha256, run.policyBundleSha256);
  assert.equal(interim.p38PolicyBundleSha256, run.p38PolicyBundleSha256);
  assert.equal(interim.replayHarnessSha256, run.replayHarnessSha256);
  for (const [recordKey, interimKey] of [
    ["armB", "B"],
    ["armBRepeat", "B-repeat"],
  ]) {
    const interimArm = interim.arms?.[interimKey];
    assert.ok(interimArm, `missing ${kind} interim arm ${interimKey}`);
    assert.equal(
      run[recordKey].foodWriterTrace?.length ?? 0,
      interimArm.p56FoodWriterTrace?.length ?? 0,
    );
    assert.equal(
      canonical(run[recordKey].nativeActionSequence),
      canonical(interimArm.p56NativeActionSequence),
    );
    const markers = interimArm.p56FoodMarkers;
    if (Array.isArray(markers)) run[recordKey].foodWriterMarkers = markers;
  }
  return run;
}

async function runReplay(kind, gamePath, gameSha256, windows) {
  const recordPath = path.join(tmp, `p56-${kind}-replay.json`);
  const child = spawnSync(
    process.execPath,
    [p43ReplayPath, "--p56-food-stock-provenance"],
    {
      cwd: root,
      env: {
        ...process.env,
        P56_RUN_KIND: kind,
        P56_GAME_PATH: gamePath,
        P56_SOURCE_GAME_PATH: nativeSnapshotPath,
        P56_EXPECTED_GAME_SHA256: gameSha256,
        P56_WINDOWS_JSON: JSON.stringify(windows),
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `${kind} P43 Chromium replay failed`);
  return JSON.parse(await readFile(recordPath, "utf8"));
}

async function readRun(kind) {
  const record = JSON.parse(
    await readFile(path.join(tmp, `p56-${kind}-replay.json`), "utf8"),
  );
  const timelineText = await readFile(
    path.join(tmp, `p56-${kind}-p43-timeline.json`),
    "utf8",
  );
  const p43EvidenceText = await readFile(
    path.join(tmp, `p56-${kind}-p43-evidence.json`),
    "utf8",
  );
  const run = {
    ...record,
    timeline: JSON.parse(timelineText),
    timelineText,
    p43Evidence: JSON.parse(p43EvidenceText),
  };
  return attachInterimFoodMarkers(run, kind);
}

async function main() {
  const reconcileOnly = process.env.P56_RECONCILE_ONLY === "1";
  const [
    sourceBytes,
    sidecarText,
    p43TimelineText,
    p45TimelineText,
    p18SettingsText,
    replayHarnessSourceBytes,
    armANativeTraceText,
    armBNativeTraceText,
  ] = await Promise.all([
    readFile(nativeSnapshotPath),
    readFile(`${nativeSnapshotPath}.json`, "utf8"),
    readFile(p43TimelinePath, "utf8"),
    readFile(p45TimelinePath, "utf8"),
    readFile(
      path.join(root, "experiments/p18-standard-human-settings.json"),
      "utf8",
    ),
    readFile(replayHarnessSourcePath),
    readFile(nativeTracePaths.armA, "utf8"),
    readFile(nativeTracePaths.armB, "utf8"),
  ]);
  assert.equal(sha256(sourceBytes), sourceSnapshotSha256);
  const sidecar = JSON.parse(sidecarText);
  assert.equal(
    sidecar.sourceRef ?? sidecar.commit?.split(" ")[0],
    pinnedGame.split("@")[1],
  );
  const p43Timeline = JSON.parse(p43TimelineText);
  const p45Timeline = JSON.parse(p45TimelineText);
  const p18Settings = JSON.parse(p18SettingsText);
  const nativeTraces = {
    armA: parseNativeTraceJsonl(armANativeTraceText),
    armB: parseNativeTraceJsonl(armBNativeTraceText),
  };
  assert.equal(sha256(p43TimelineText), p45Timeline.sourceSha256);
  const transitions = foodResilienceTransitions(p45Timeline);
  assert.equal(transitions.length, 39);
  assert.equal(
    transitions.filter(
      ({ before, after }) =>
        before.starvationCount === after.starvationCount &&
        before.civilianPopulation === after.civilianPopulation,
    ).length,
    29,
    "recomputed endpoint-stable count differs from P45 prose's reported 28",
  );
  const windows = transitions.map(({ before, after }) => [
    before.period,
    after.period,
  ]);
  const exhaustionStarvationWindow = [5624, 5632];
  const diagnosticWindows = [...windows, exhaustionStarvationWindow];
  const p45StockTransitions = transitions.map(({ before, after }) => ({
    fromPeriod: before.period,
    toPeriod: after.period,
    beforeFood: before.foodStock,
    afterFood: after.foodStock,
    starvationCountBefore: before.starvationCount,
    starvationCountAfter: after.starvationCount,
    civilianPopulationBefore: before.civilianPopulation,
    civilianPopulationAfter: after.civilianPopulation,
  }));

  await mkdir(tmp, { recursive: true });
  const transformed = createP56FoodWriterSnapshot(
    sourceBytes.toString("utf8"),
    diagnosticWindows,
  );
  const instrumentedGamePath = path.join(
    tmp,
    "p56-evolve-food-instrumented.js",
  );
  const instrumentedBytes = Buffer.from(transformed.source);
  let instrumentedSha256 = sha256(instrumentedBytes);
  if (!reconcileOnly) {
    await writeFile(instrumentedGamePath, instrumentedBytes);
    await writeFile(`${instrumentedGamePath}.json`, sidecarText);
  }

  if (!reconcileOnly) {
    await runReplay(
      "control",
      nativeSnapshotPath,
      sourceSnapshotSha256,
      diagnosticWindows,
    );
    await runReplay(
      "instrumented",
      instrumentedGamePath,
      instrumentedSha256,
      diagnosticWindows,
    );
  }
  const [control, instrumented] = await Promise.all([
    readRun("control"),
    readRun("instrumented"),
  ]);
  assert.equal(sha256(p18SettingsText), control.settingsSha256);
  if (reconcileOnly) instrumentedSha256 = instrumented.runtimeGameSha256;
  control.retainedP43TimelineText = p43TimelineText;
  const parity = sourceReplayParity(control, instrumented);
  const controlRepeatParity = parityRepeatedArm(
    control.armB,
    control.armBRepeat,
  );
  const instrumentedRepeatParity = parityRepeatedArm(
    instrumented.armB,
    instrumented.armBRepeat,
  );
  const repeatedArmInstrumentationParity = parityRepeatedArm(
    control.armBRepeat,
    instrumented.armBRepeat,
  );
  const nativeTraceAudit = nativeTraceReconciliation(
    nativeTraces,
    p43Timeline,
    control.timeline,
  );
  const nativeInvocations = {
    armA: normalizeNativeInvocationTrace(nativeTraces.armA),
    armB: normalizeNativeInvocationTrace(nativeTraces.armB),
  };
  assert.equal(
    nativeTraceAudit.armB.rawTraceRecords,
    control.armB.nativeActionSequence.count,
    "captured B raw trace count must match the retained P56 trace count",
  );
  assert.equal(
    nativeTraceAudit.armB.rawTraceSha256,
    control.armB.nativeActionSequence.sha256,
    "captured B raw trace hash must match the retained P56 trace hash",
  );
  const mutations = mutationEvidence(
    transitions,
    instrumented,
    instrumented.timeline,
    nativeInvocations.armB,
  );
  for (const transition of mutations) {
    for (const writer of transition.foodWriters)
      canonicalizeWriterCallsite(writer);
  }
  const writerTraceOverflow =
    instrumented.armB.foodTraceStatus.overflow > 0 ||
    instrumented.armB.foodWriterTrace.length >= 10000;
  const writerTraceErrors = instrumented.armB.foodTraceStatus.errors;
  const allTransitionsExplained = mutations.every(
    (transition) =>
      transition.phaseBoundary.exactWriterSlice &&
      transition.foodWriters.length > 0 &&
      transition.foodActionTraceRecordCount === 100 &&
      transition.foodHarvestActionInvocationCount === 50 &&
      transition.foodActionWriterCount === 50 &&
      transition.foodActionWriterDelta === 50 &&
      transition.writerDeltaMatchesObservedStockChange,
  );
  const exhaustionPoints = p45Timeline.points
    .filter(
      (point) =>
        point.period >= exhaustionStarvationWindow[0] &&
        point.period <= exhaustionStarvationWindow[1],
    )
    .map((point) => projectSample(point, instrumented.timeline.armB));
  const exhaustionMarkers = instrumented.armB.foodWriterMarkers ?? [];
  const exhaustionStartMarker = exhaustionMarkers.find(
    (entry) =>
      entry.period === exhaustionStarvationWindow[0] &&
      entry.phase === "post-period-checkpoint",
  );
  const exhaustionEndMarker = exhaustionMarkers.find(
    (entry) =>
      entry.period === exhaustionStarvationWindow[1] &&
      entry.phase === "post-period-checkpoint",
  );
  const exhaustionWriters =
    Number.isSafeInteger(exhaustionStartMarker?.writerOrder) &&
    Number.isSafeInteger(exhaustionEndMarker?.writerOrder)
      ? instrumented.armB.foodWriterTrace.filter(
          (entry) =>
            entry.order >= exhaustionStartMarker.writerOrder &&
            entry.order < exhaustionEndMarker.writerOrder,
        )
      : [];
  for (const writer of exhaustionWriters) canonicalizeWriterCallsite(writer);
  const exhaustionObservedDelta =
    (exhaustionPoints.at(-1)?.foodStock ?? Number.NaN) -
    (exhaustionPoints[0]?.foodStock ?? Number.NaN);
  const exhaustionWriterDelta = exhaustionWriters.reduce(
    (sum, entry) => sum + Number(entry.delta ?? 0),
    0,
  );
  const exhaustionActionDiagnosticCount =
    instrumented.armB.foodActionInvocations.filter(
      (entry) =>
        entry.period > exhaustionStarvationWindow[0] &&
        entry.period <= exhaustionStarvationWindow[1],
    ).length;
  const exhaustionFoodHarvestActionInvocationCount =
    nativeInvocations.armB.filter(
      (entry) =>
        entry.method === "action" &&
        String(entry.elementId ?? "")
          .toLowerCase()
          .includes("food") &&
        entry.period > exhaustionStarvationWindow[0] &&
        entry.period <= exhaustionStarvationWindow[1],
    ).length;
  assert.equal(
    exhaustionActionDiagnosticCount,
    exhaustionFoodHarvestActionInvocationCount * 2,
    "the starvation window Food trace rows must pair into native action invocations",
  );
  const exhaustionFoodWriterMutationCount = exhaustionWriters.filter((entry) =>
    entry.callsiteStack?.some((frame) => frame.includes("runAction")),
  ).length;
  const exhaustionIntervalExplained =
    exhaustionPoints.length === 9 &&
    exhaustionStartMarker !== undefined &&
    exhaustionEndMarker !== undefined &&
    exhaustionWriters.length > 0 &&
    Math.abs(exhaustionWriterDelta - exhaustionObservedDelta) < 1e-8;
  const p43HistoricalExact = parity.matchesRetainedP43StateAndEvents;
  const nativeTraceReconciliationExact = [
    nativeTraceAudit.armA,
    nativeTraceAudit.armB,
  ].every(
    (arm) =>
      arm.unknownMethods.length === 0 &&
      arm.historicalP43RawRecordCountsExact &&
      arm.historicalP43RawRecordHashesExact &&
      arm.reproducedP56InvocationCountsExact &&
      arm.reproducedP56InvocationHashesExact &&
      arm.transformedCountsExact &&
      arm.transformedHashesExact,
  );
  const sameReplayInputs =
    control.pinnedGame === instrumented.pinnedGame &&
    control.fixtureSha256 === instrumented.fixtureSha256 &&
    control.settingsSha256 === instrumented.settingsSha256 &&
    control.seed === instrumented.seed &&
    control.epoch === instrumented.epoch &&
    control.runtimeBundleSha256 === instrumented.runtimeBundleSha256 &&
    control.policyBundleSha256 === instrumented.policyBundleSha256 &&
    control.p38PolicyBundleSha256 === instrumented.p38PolicyBundleSha256 &&
    control.replayHarnessSha256 === instrumented.replayHarnessSha256 &&
    control.p43Evidence.replay.p43PolicySha256 ===
      instrumented.p43Evidence.replay.p43PolicySha256 &&
    control.p43Evidence.replay.p43TraceSha256 ===
      instrumented.p43Evidence.replay.p43TraceSha256;
  const instrumentationParity =
    sameReplayInputs &&
    !writerTraceOverflow &&
    writerTraceErrors === 0 &&
    exhaustionIntervalExplained &&
    parity.checkpointCount === 123 &&
    parity.checkpointExactCount === 123 &&
    controlRepeatParity.checkpointExactCount === 123 &&
    instrumentedRepeatParity.checkpointExactCount === 123 &&
    repeatedArmInstrumentationParity.checkpointExactCount === 123 &&
    controlRepeatParity.eventsEqual &&
    instrumentedRepeatParity.eventsEqual &&
    repeatedArmInstrumentationParity.eventsEqual &&
    controlRepeatParity.finalExportEqual &&
    instrumentedRepeatParity.finalExportEqual &&
    repeatedArmInstrumentationParity.finalExportEqual &&
    controlRepeatParity.finalRngEqual &&
    instrumentedRepeatParity.finalRngEqual &&
    repeatedArmInstrumentationParity.finalRngEqual &&
    controlRepeatParity.nativeActionSequenceEqual &&
    instrumentedRepeatParity.nativeActionSequenceEqual &&
    repeatedArmInstrumentationParity.nativeActionSequenceEqual &&
    parity.eventsEqual &&
    parity.finalExportEqual &&
    parity.finalRngEqual &&
    parity.nativeActionSequenceEqual &&
    parity.interventionEventsEqual;
  const decision = !instrumentationParity
    ? "D — Diagnostic parity invalid"
    : !p43HistoricalExact
      ? "C — Historical P43 samples not reproduced"
      : !nativeTraceReconciliationExact
        ? "B — P56 units corrected; historical digest reconciliation incomplete"
        : allTransitionsExplained
          ? "A — Native trace accounting and historical diagnostics reconciled"
          : "B — Partially explained";
  const evidence = {
    schema: "p56-food-stock-provenance-evidence-v1",
    decision,
    pinnedGame,
    source: {
      nativeSnapshotPath: "test-artifacts/game/evolve-deadspace.js",
      sourceSnapshotSha256,
      instrumentedSnapshotSha256: instrumentedSha256,
      instrumentedSnapshotPath:
        "test-artifacts/benchmark/tmp/p56-evolve-food-instrumented.js",
      lineCountPreserved: true,
      wrappedFunctions: transformed.wrappedFunctions,
      directWriteSites: transformed.directWriteSites,
      diagnosticsBoundedTo: windows,
      specialDiagnosticIntervals: [exhaustionStarvationWindow],
      writerTraceLimit: 10000,
      writerTraceOverflow,
      writerTraceErrors,
    },
    inputs: {
      authenticStart:
        "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
      fixtureSha256: control.fixtureSha256,
      settingsSha256: control.settingsSha256,
      seed,
      epoch,
      gatherAutomationPolicy: {
        clickLimitSetting: "buildingClickPerTick",
        buildingClickPerTick: p18Settings.buildingClickPerTick,
        autoBuild: p18Settings.autoBuild,
        autoARPA: p18Settings.autoARPA,
        buildingAlwaysClick: p18Settings.buildingAlwaysClick,
        sellFood: p18Settings.sellFood,
        buyFood: p18Settings.buyFood,
      },
      arm: "P43 B diagnostic Jobs allocation",
      authorizedHistoricalInterventions: [
        "P36 native Gather bootstrap up to p688",
        "P38 test-only bounded Construction Gather authorization",
        "P42 test-only Construction priority substitution at p720",
        "P43 test-only Jobs policy after the p719 boundary",
      ],
    },
    replay: {
      periods: control.armB.periods,
      cleanControlMatchesRetainedP43StateAndEvents: p43HistoricalExact,
      retainedNativeCallDigestsExact: parity.retainedNativeCallDigestsExact,
      retainedNativeCallDigestRepresentationsReconciled:
        nativeTraceReconciliationExact,
      sameReplayInputs,
      instrumentationParity,
      p43Events: {
        count: control.armB.p43EventCount,
        sha256: control.armB.p43EventsSha256,
        matchesInstrumented:
          control.armB.p43EventCount === instrumented.armB.p43EventCount &&
          control.armB.p43EventsSha256 === instrumented.armB.p43EventsSha256,
      },
      nativeActionSequence: {
        ...control.armB.nativeActionSequence,
        rawTraceRecords: control.armB.nativeActionSequence.count,
        countUnit: "raw Chromium bridge trace records",
        matchesInstrumented:
          canonical(control.armB.nativeActionSequence) ===
          canonical(instrumented.armB.nativeActionSequence),
      },
      nativeInvocationAccounting: {
        traceCapture: {
          arms: ["A", "B"],
          periods: 10_000,
          replayHarnessSha256: nativeTraceAuditReplayHarnessSha256,
          runtimeBundleSha256: control.runtimeBundleSha256,
          pinnedGameSha256: sourceSnapshotSha256,
          fixtureSha256: control.fixtureSha256,
          settingsSha256: control.settingsSha256,
          seed: control.seed,
          epoch: control.epoch,
          purpose:
            "Trace-only clean control replay because the retained P43/P56 evidence had hashes and counts but not the raw rows; no Food writer instrumentation was run.",
        },
        pairContract:
          "Adjacent records must have order equal to their array indices and equal period, elementId, and method; the first record represents the native API invocation.",
        bridgeRecordSemantics:
          "The captured control wrapper emits before and after callbacks; the Chromium bridge stores one raw record per callback.",
        actionMethodSemantics:
          "method === action counts mutation-capable native action calls; it does not assert that every call changed game state.",
        readOnlyNativeMethods: ["hell", "on_cap", "s_max", "vis"],
        otherNativeControlMethodSemantics:
          "Setter, assignment, navigation, and presentation calls are counted separately from action and read-only methods.",
        armA: nativeTraceAudit.armA,
        armB: nativeTraceAudit.armB,
        foodRecoveryWindows: {
          count: mutations.length,
          rawActionTraceRecords: control.armB.foodActionInvocations.length,
          foodHarvestActionInvocations: mutations.reduce(
            (sum, transition) =>
              sum + transition.foodHarvestActionInvocationCount,
            0,
          ),
          nativeFoodWriterMutations: mutations.reduce(
            (sum, transition) => sum + transition.foodActionWriterCount,
            0,
          ),
          nativeFoodWriterDelta: mutations.reduce(
            (sum, transition) => sum + transition.foodActionWriterDelta,
            0,
          ),
        },
        historicalP43Aggregation: {
          historical:
            "P43 filtered raw diagnostics.nativeInvocations rows with the retained elementId/method predicate, mapped each row to {period, elementId, method}, and hashed JSON.stringify of that ordered array.",
          current:
            "P56 validates adjacent before/after record pairs, keeps one record per pair, then applies the same predicate and projection before hashing.",
          checkpointBoundary:
            "Each digest is cumulative through the retained post-period checkpoint; the current raw trace is restricted to entry.period <= checkpoint.period.",
          exactAcrossAllRetainedCheckpoints: nativeTraceReconciliationExact,
        },
      },
      finalExportSha256: control.armB.finalExportSha256,
      finalRng: control.armB.finalRng,
      replayHarnessCurrentSourceSha256: sha256(replayHarnessSourceBytes),
      parity,
      controlRepeatParity,
      instrumentedRepeatParity,
      repeatedArmInstrumentationParity,
      control: {
        runtimeGameSha256: control.runtimeGameSha256,
        runtimeBundleSha256: control.runtimeBundleSha256,
        policyBundleSha256: control.policyBundleSha256,
        p38PolicyBundleSha256: control.p38PolicyBundleSha256,
        replayHarnessSha256: control.replayHarnessSha256,
      },
      instrumented: {
        runtimeGameSha256: instrumented.runtimeGameSha256,
        runtimeBundleSha256: instrumented.runtimeBundleSha256,
        policyBundleSha256: instrumented.policyBundleSha256,
        p38PolicyBundleSha256: instrumented.p38PolicyBundleSha256,
        replayHarnessSha256: instrumented.replayHarnessSha256,
        p43PolicySha256: control.p43Evidence.replay.p43PolicySha256,
        p43TraceSha256: control.p43Evidence.replay.p43TraceSha256,
      },
    },
    transitions: {
      count: mutations.length,
      p45ProseReportedEndpointStableCount: 28,
      unchangedStarvationAndCivilianPopulation: mutations.filter(
        (transition) => transition.starvationAndCivilianPopulationUnchanged,
      ).length,
      reproducedExactly: mutations.filter(
        (transition) => transition.writerDeltaMatchesObservedStockChange,
      ).length,
      sourceAttributed: mutations.filter(
        (transition) => transition.phaseBoundary.exactWriterSlice,
      ).length,
      fullyExplained: allTransitionsExplained,
      exhaustionStarvationSequence: {
        interval: exhaustionStarvationWindow,
        points: exhaustionPoints,
        phaseBoundary: {
          start: exhaustionStartMarker ?? null,
          end: exhaustionEndMarker ?? null,
        },
        foodWriters: exhaustionWriters,
        foodActionTraceRecordCount: exhaustionActionDiagnosticCount,
        foodHarvestActionInvocationCount:
          exhaustionFoodHarvestActionInvocationCount,
        foodActionWriterCount: exhaustionFoodWriterMutationCount,
        observedNetStockChange: exhaustionObservedDelta,
        writerDelta: exhaustionWriterDelta,
        writerDeltaMatchesObservedStockChange:
          Math.abs(exhaustionWriterDelta - exhaustionObservedDelta) < 1e-8,
      },
      selectedExamples: mutations
        .filter((transition) => [5384, 5631].includes(transition.fromPeriod))
        .map(
          ({
            id,
            fromPeriod,
            toPeriod,
            writerGroups,
            foodActionWriterCount,
            foodActionTraceRecordCount,
            foodHarvestActionInvocationCount,
          }) => ({
            id,
            fromPeriod,
            toPeriod,
            writerGroups,
            foodActionWriterCount,
            foodActionTraceRecordCount,
            foodHarvestActionInvocationCount,
          }),
        ),
    },
  };
  const mutationFile = {
    schema: "p56-food-stock-writer-mutations-v1",
    pinnedGame,
    sourceSnapshotSha256,
    instrumentedSnapshotSha256: instrumentedSha256,
    replayInputs: {
      fixtureSha256: control.fixtureSha256,
      settingsSha256: control.settingsSha256,
      seed,
      epoch,
      arm: "P43 B",
      periodWindows: diagnosticWindows,
      phaseBoundarySource:
        "P43 pre-executor marker and exact post-period checkpoint marker",
    },
    historicalTransitions: p45StockTransitions,
    transitions: mutations,
  };
  await writeFile(
    path.join(root, "experiments/p56-food-stock-provenance-evidence.json"),
    await prettier.format(JSON.stringify(evidence, null, 2), {
      parser: "json",
    }),
  );
  await writeFile(
    path.join(root, "experiments/p56-food-stock-mutations.json"),
    await prettier.format(JSON.stringify(mutationFile, null, 2), {
      parser: "json",
    }),
  );
  console.log(
    JSON.stringify({
      decision,
      transitions: mutations.length,
      exactWriterAttributions: mutations.filter(
        (transition) => transition.writerDeltaMatchesObservedStockChange,
      ).length,
      instrumentationParity,
      p43HistoricalExact,
      evidence: "experiments/p56-food-stock-provenance-evidence.json",
      mutations: "experiments/p56-food-stock-mutations.json",
    }),
  );
  if (decision.startsWith("D")) process.exitCode = 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();
