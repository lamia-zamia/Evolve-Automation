// Summarizes a Chrome trace from full-runtime-profile.mjs `trace` mode: busy time per renderer
// thread (top-level complete events only, so nesting is not double counted) and, on the main
// thread, the time inside each event name wherever it nests (an event inside FunctionCall is
// reported under both names; the per-name rows are therefore not additive).
//   node experiments/full-runtime-profile-trace.mjs <trace.json> [...]
import { readFile } from "node:fs/promises";

for (const path of process.argv.slice(2)) {
  const data = JSON.parse(await readFile(path, "utf8"));
  const events = Array.isArray(data) ? data : data.traceEvents;
  const threadNames = new Map();
  const processNames = new Map();
  for (const e of events) {
    if (e.ph === "M" && e.name === "thread_name")
      threadNames.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.ph === "M" && e.name === "process_name")
      processNames.set(e.pid, e.args.name);
  }
  // Complete events, plus B/E pairs folded into durations.
  const spans = [];
  const open = new Map();
  for (const e of events) {
    if (e.ph === "X" && typeof e.dur === "number")
      spans.push({
        key: `${e.pid}:${e.tid}`,
        name: e.name,
        ts: e.ts,
        dur: e.dur,
      });
    else if (e.ph === "B") open.set(`${e.pid}:${e.tid}:${e.name}`, e);
    else if (e.ph === "E") {
      const start = open.get(`${e.pid}:${e.tid}:${e.name}`);
      if (start)
        spans.push({
          key: `${e.pid}:${e.tid}`,
          name: e.name,
          ts: start.ts,
          dur: e.ts - start.ts,
        });
    }
  }
  const byThread = new Map();
  for (const span of spans) {
    if (!byThread.has(span.key)) byThread.set(span.key, []);
    byThread.get(span.key).push(span);
  }
  // Several renderer processes exist (the idle about:blank page among them): use the one whose
  // main thread has the most complete-event time.
  const mainTime = new Map();
  for (const span of spans)
    if (threadNames.get(span.key) === "CrRendererMain")
      mainTime.set(span.key, (mainTime.get(span.key) ?? 0) + span.dur);
  const busiestMain = [...mainTime].sort((a, b) => b[1] - a[1])[0]?.[0];
  const rendererPid =
    busiestMain === undefined ? undefined : Number(busiestMain.split(":")[0]);
  const threadBusy = [];
  let mainKey;
  for (const [key, list] of byThread) {
    const pid = Number(key.split(":")[0]);
    if (rendererPid !== undefined && pid !== rendererPid) continue;
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    let busy = 0;
    let end = -Infinity;
    for (const span of list) {
      if (span.ts >= end) {
        busy += span.dur;
        end = span.ts + span.dur;
      } else if (span.ts + span.dur > end) {
        busy += span.ts + span.dur - end;
        end = span.ts + span.dur;
      }
    }
    const name = threadNames.get(key) ?? key;
    if (key === busiestMain) mainKey = key;
    threadBusy.push([name, Number((busy / 1000).toFixed(1))]);
  }
  threadBusy.sort((a, b) => b[1] - a[1]);
  const names = new Map();
  for (const span of byThread.get(mainKey) ?? []) {
    const entry = names.get(span.name) ?? { ms: 0, count: 0 };
    entry.ms += span.dur / 1000;
    entry.count++;
    names.set(span.name, entry);
  }
  const top = [...names]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 25)
    .map(([name, v]) => [name, Number(v.ms.toFixed(1)), v.count]);
  console.log(
    JSON.stringify(
      {
        trace: path.split(/[\\/]/).pop(),
        rendererThreadsBusyMs: threadBusy.slice(0, 12),
        mainThreadByEventMs: top,
      },
      null,
      1,
    ),
  );
}
