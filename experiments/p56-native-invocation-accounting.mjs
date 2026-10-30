import { createHash } from "node:crypto";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const READ_ONLY_NATIVE_METHODS = new Set(["hell", "on_cap", "s_max", "vis"]);
const OTHER_NATIVE_CONTROL_METHODS = new Set([
  "add",
  "setData",
  "setDefault",
  "sub",
  "swapTab",
]);

export function parseNativeTraceJsonl(text) {
  if (typeof text !== "string")
    throw new TypeError("native trace JSONL must be a string");
  return text
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid native trace JSONL record ${index + 1}`, {
          cause: error,
        });
      }
    });
}

export function normalizeNativeInvocationTrace(rawTrace) {
  if (!Array.isArray(rawTrace))
    throw new TypeError("native trace must be an array");
  if (rawTrace.length % 2 !== 0)
    throw new Error("native trace must contain adjacent record pairs");

  const invocations = [];
  for (let index = 0; index < rawTrace.length; index += 2) {
    const call = rawTrace[index];
    const result = rawTrace[index + 1];
    if (
      call?.order !== index ||
      result?.order !== index + 1 ||
      call?.period !== result?.period ||
      call?.elementId !== result?.elementId ||
      call?.method !== result?.method
    )
      throw new Error(
        `native trace pair ${index / 2} must match order, period, element ID, and method`,
      );

    const { order: _order, ...invocation } = call;
    invocations.push(invocation);
  }
  return invocations;
}

export function matchesP43NativeCall(entry) {
  const elementId = entry?.elementId ?? "";
  return (
    /^civ-/.test(elementId) ||
    (entry?.method === "action" &&
      (/^(undefined-food|city-lumber|undefined-stone)$/.test(elementId) ||
        /^(tech-|city-)/.test(elementId)))
  );
}

export function p43NativeCallDigestInput(invocations) {
  return invocations
    .filter(matchesP43NativeCall)
    .map(({ period, elementId, method }) => ({
      period,
      elementId,
      method,
    }));
}

export function p43LegacyRawDigestInput(rawTrace, throughPeriod = Infinity) {
  return rawTrace
    .filter(
      (entry) => entry.period <= throughPeriod && matchesP43NativeCall(entry),
    )
    .map(({ period, elementId, method }) => ({
      period,
      elementId,
      method,
    }));
}

export function compareP43NativeCallDiagnostics(
  rawTrace,
  historicalCheckpoints,
  reproducedCheckpoints,
) {
  const invocations = normalizeNativeInvocationTrace(rawTrace);
  const reproducedByPeriod = new Map(
    reproducedCheckpoints.map((checkpoint) => [checkpoint.period, checkpoint]),
  );

  return historicalCheckpoints.map((historical) => {
    const reproduced = reproducedByPeriod.get(historical.period);
    const legacyInput = p43LegacyRawDigestInput(rawTrace, historical.period);
    const normalizedInput = p43NativeCallDigestInput(
      invocations.filter((entry) => entry.period <= historical.period),
    );
    const legacySha256 = sha256(JSON.stringify(legacyInput));
    const normalizedSha256 = sha256(JSON.stringify(normalizedInput));
    const transformedLegacySha256 = sha256(
      JSON.stringify(normalizedInput.flatMap((entry) => [entry, entry])),
    );
    return {
      period: historical.period,
      historicalCount: historical.nativeCallsCount ?? null,
      reconstructedLegacyCount: legacyInput.length,
      reproducedCount: reproduced?.nativeCallsCount ?? null,
      normalizedCount: normalizedInput.length,
      historicalSha256: historical.nativeCallsSha256 ?? null,
      reconstructedLegacySha256: legacySha256,
      reproducedSha256: reproduced?.nativeCallsSha256 ?? null,
      normalizedSha256,
      transformedLegacySha256,
      historicalCountMatches:
        historical.nativeCallsCount === legacyInput.length,
      historicalHashMatches: historical.nativeCallsSha256 === legacySha256,
      reproducedCountMatches:
        reproduced?.nativeCallsCount === normalizedInput.length,
      reproducedHashMatches: reproduced?.nativeCallsSha256 === normalizedSha256,
      transformedCountMatches:
        normalizedInput.length * 2 === legacyInput.length,
      transformedHashMatches:
        legacySha256 === transformedLegacySha256 &&
        historical.nativeCallsSha256 === transformedLegacySha256 &&
        reproduced?.nativeCallsSha256 === normalizedSha256,
    };
  });
}

export function summarizeNativeInvocationTrace(rawTrace) {
  const invocations = normalizeNativeInvocationTrace(rawTrace);
  const unknownMethods = [
    ...new Set(
      invocations
        .map((entry) => entry.method)
        .filter(
          (method) =>
            method !== "action" &&
            !READ_ONLY_NATIVE_METHODS.has(method) &&
            !OTHER_NATIVE_CONTROL_METHODS.has(method),
        ),
    ),
  ].sort();
  const methodCounts = Object.fromEntries(
    [...new Set(invocations.map((entry) => entry.method))]
      .sort()
      .map((method) => [
        method,
        invocations.filter((entry) => entry.method === method).length,
      ]),
  );
  return {
    rawTraceRecords: rawTrace.length,
    validatedNativeApiInvocations: invocations.length,
    mutatingActionMethodInvocations: invocations.filter(
      (entry) => entry.method === "action",
    ).length,
    readOnlyNativeCalls: invocations.filter((entry) =>
      READ_ONLY_NATIVE_METHODS.has(entry.method),
    ).length,
    otherNativeControlMethodInvocations: invocations.filter(
      (entry) =>
        entry.method !== "action" &&
        OTHER_NATIVE_CONTROL_METHODS.has(entry.method),
    ).length,
    unknownMethods,
    rawTraceSha256: sha256(JSON.stringify(rawTrace)),
    methodCounts,
  };
}
