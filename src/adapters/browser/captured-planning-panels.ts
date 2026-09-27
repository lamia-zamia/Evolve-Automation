import type { PlannerStats } from "../../domain/planner-analysis.ts";
import type { ConstructionReadoutSnapshot } from "../../ports/game-construction-observations.ts";
import type { GameQueueReadoutSample } from "../../ports/game-queue-readout.ts";
import { formatGameDuration } from "../../formatting/game-duration.ts";

export interface CapturedTriggerReadout {
  readonly id: string;
  readonly kind: "build" | "research" | "arpa";
  readonly projectId?: string;
}

export interface CapturedPlanningPanelsModel {
  readonly construction: Readonly<ConstructionReadoutSnapshot> | null;
  readonly freshness: "fresh" | "stale" | "none";
  readonly queues: Readonly<GameQueueReadoutSample> | undefined;
  readonly triggers: readonly Readonly<CapturedTriggerReadout>[] | undefined;
  readonly stats: Readonly<PlannerStats> | undefined;
  readonly collapsed: boolean;
}

export interface CapturedPlanningPanelsDependencies {
  readonly getDocument: () => Document;
  readonly readSettings: () => Readonly<Record<string, unknown>>;
  readonly onResetPlannerStats: () => void;
  readonly onCollapsedChange: (collapsed: boolean) => void;
  readonly onError?: (message: string) => void;
}

export interface CapturedPlanningPanels {
  syncActiveTargetsUI(enabled: boolean): void;
  syncBuildPlannerUI(enabled: boolean): void;
  update(model: Readonly<CapturedPlanningPanelsModel>): void;
}

const BUILD_QUEUE_ANCHOR_ID = "buildQueue";
const ACTIVE_TARGETS_PANEL_ID = "ea-active-targets";
const SCRIPT_PLANNER_PANEL_ID = "ea-script-planner";
const PLANNER_TARGET_LIMIT = 5;
const PLANNER_BUCKETS = Object.freeze([
  "ready",
  "income",
  "storage",
  "stalled",
  "locked",
  "unavailable",
] as const);

function createText(
  document: Document,
  tag: string,
  value: string,
): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function appendCategory(
  document: Document,
  root: HTMLElement,
  title: string,
  rows: readonly string[],
): void {
  if (rows.length === 0) return;
  const section = document.createElement("section");
  section.appendChild(createText(document, "h4", title));
  const list = document.createElement("ul");
  for (const row of rows) list.appendChild(createText(document, "li", row));
  section.appendChild(list);
  root.appendChild(section);
}

function triggerMatchesTarget(
  target: Readonly<ConstructionReadoutSnapshot["targets"][number]>,
  triggers: readonly Readonly<CapturedTriggerReadout>[],
): boolean {
  return triggers.some((trigger) =>
    trigger.kind === "arpa"
      ? target.projectId !== undefined && target.projectId === trigger.projectId
      : trigger.kind === "build" &&
        target.actionId !== undefined &&
        target.actionId === trigger.id,
  );
}

function blockerLabel(
  target: Readonly<ConstructionReadoutSnapshot["targets"][number]>,
): string {
  const resource =
    target.resourceId === undefined ? "" : ` (${target.resourceId})`;
  switch (target.blocker) {
    case "ready":
      return "Ready";
    case "income":
      return `Income · ETA ${formatGameDuration(target.timeSeconds ?? Number.NaN)}${resource}`;
    case "storage":
      return `Storage${resource}`;
    case "stalled":
      return `Stalled${resource}`;
    case "locked":
      return `Locked${resource}`;
    case "unavailable":
      return "Unavailable";
  }
}

export function createCapturedPlanningPanels({
  getDocument,
  readSettings,
  onResetPlannerStats,
  onCollapsedChange,
  onError = () => {},
}: CapturedPlanningPanelsDependencies): CapturedPlanningPanels {
  let activeEnabled = false;
  let plannerEnabled = false;
  let model: Readonly<CapturedPlanningPanelsModel> = Object.freeze({
    construction: null,
    freshness: "none",
    queues: undefined,
    triggers: undefined,
    stats: undefined,
    collapsed: false,
  });
  let activeSignature: string | undefined;
  let plannerSignature: string | undefined;
  let pendingReconcile = false;
  const reportedErrors = new Set<string>();

  function report(error: unknown): void {
    const message = String(error);
    if (reportedErrors.has(message)) return;
    reportedErrors.add(message);
    try {
      onError(`captured planning UI: ${message}`);
    } catch {
      // A diagnostic sink is optional and cannot be allowed to stop game automation.
    }
  }

  function documentIsVisible(document: Document): boolean {
    return document.hidden !== true && document.visibilityState !== "hidden";
  }

  function placePanel(
    document: Document,
    id: string,
    before: Element,
  ): HTMLElement {
    const existing = document.getElementById(id) as HTMLElement | null;
    const panel = existing ?? document.createElement("section");
    if (existing === null) panel.id = id;
    panel.className = "ea-captured-planning-panel";
    if (
      panel.parentNode !== before.parentNode ||
      panel.nextSibling !== before
    ) {
      before.parentNode?.insertBefore(panel, before);
    }
    return panel;
  }

  function removePanel(document: Document, id: string): void {
    const panel = document.getElementById(id);
    panel?.parentNode?.removeChild(panel);
  }

  function reconcilePanels(): void {
    try {
      const document = getDocument();
      if (!documentIsVisible(document)) return;
      const anchor = document.getElementById(BUILD_QUEUE_ANCHOR_ID);
      if (!activeEnabled) removePanel(document, ACTIVE_TARGETS_PANEL_ID);
      if (!plannerEnabled) removePanel(document, SCRIPT_PLANNER_PANEL_ID);
      if (anchor === null) return;

      if (plannerEnabled) {
        placePanel(document, SCRIPT_PLANNER_PANEL_ID, anchor);
      }
      if (activeEnabled) {
        const planner = document.getElementById(SCRIPT_PLANNER_PANEL_ID);
        placePanel(document, ACTIVE_TARGETS_PANEL_ID, planner ?? anchor);
      }
    } catch (error) {
      report(error);
    }
  }

  function renderActiveTargets(document: Document): void {
    const panel = document.getElementById(
      ACTIVE_TARGETS_PANEL_ID,
    ) as HTMLElement | null;
    if (!activeEnabled || panel === null) return;
    const queues = model.queues;
    const triggers = model.triggers ?? [];
    const projects =
      model.construction?.targets.filter(
        (target) => target.family === "arpa",
      ) ?? [];
    const signature = JSON.stringify({ queues, triggers, projects });
    if (signature === activeSignature) return;
    activeSignature = signature;

    panel.replaceChildren(createText(document, "h3", "Detailed Queue"));
    appendCategory(
      document,
      panel,
      "Triggers",
      triggers.map((trigger) =>
        trigger.projectId === undefined
          ? `${trigger.id} · ${trigger.kind}`
          : `${trigger.id} · ${trigger.projectId}`,
      ),
    );
    appendCategory(
      document,
      panel,
      "Build queue",
      (queues?.build ?? []).map((entry) => entry.label),
    );
    appendCategory(
      document,
      panel,
      "Research queue",
      (queues?.research ?? []).map((entry) => entry.label),
    );
    appendCategory(
      document,
      panel,
      "A.R.P.A. project targets",
      projects.map((project) => project.key),
    );
  }

  function renderPlanner(document: Document): void {
    const panel = document.getElementById(
      SCRIPT_PLANNER_PANEL_ID,
    ) as HTMLElement | null;
    if (!plannerEnabled || panel === null) return;
    const signature = JSON.stringify({
      construction: model.construction,
      freshness: model.freshness,
      stats: model.stats,
      collapsed: model.collapsed,
      triggers: model.triggers,
    });
    if (signature === plannerSignature) return;
    plannerSignature = signature;

    const title = document.createElement("button");
    title.type = "button";
    title.textContent = model.collapsed
      ? "Script Planner ▸"
      : "Script Planner ▾";
    title.setAttribute("aria-expanded", String(!model.collapsed));
    title.addEventListener("click", () => {
      const collapsed = readSettings()["buildPlannerCollapsed"] === true;
      onCollapsedChange(!collapsed);
      model = Object.freeze({ ...model, collapsed: !collapsed });
      plannerSignature = undefined;
      renderPlanner(document);
    });

    panel.replaceChildren(title);
    if (model.collapsed) return;

    const freshness =
      model.construction === null
        ? "Waiting for a captured construction cycle"
        : model.construction.detailLevel !== "planner"
          ? "Awaiting a planner-enabled construction cycle"
          : model.freshness === "fresh"
            ? `Fresh construction cycle ${model.construction.cycleId}`
            : `Previous construction cycle ${model.construction.cycleId} · idle`;
    panel.appendChild(createText(document, "p", freshness));
    const list = document.createElement("ol");
    for (const target of model.construction?.targets.slice(
      0,
      PLANNER_TARGET_LIMIT,
    ) ?? []) {
      const category = target.family === "arpa" ? "A.R.P.A." : target.family;
      const annotations = [
        blockerLabel(target),
        ...(target.queued ? ["queued"] : []),
        ...(model.triggers !== undefined &&
        triggerMatchesTarget(target, model.triggers)
          ? ["trigger target"]
          : []),
      ];
      list.appendChild(
        createText(
          document,
          "li",
          `${category} · ${target.key} · weight ${target.weighting} · ${annotations.join(" · ")}`,
        ),
      );
    }
    panel.appendChild(list);

    const stats = model.stats;
    panel.appendChild(
      createText(
        document,
        "p",
        stats === undefined
          ? "Bottleneck statistics unavailable"
          : `Bottleneck samples: ${stats.total}`,
      ),
    );
    if (stats !== undefined) {
      const buckets = document.createElement("ul");
      for (const bucket of PLANNER_BUCKETS) {
        buckets.appendChild(
          createText(
            document,
            "li",
            `${bucket}: ${stats.samples[bucket] ?? 0}`,
          ),
        );
      }
      panel.appendChild(buckets);
    }

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset planner statistics";
    reset.disabled = stats === undefined;
    reset.addEventListener("click", onResetPlannerStats);
    panel.appendChild(reset);
  }

  function render(): void {
    try {
      const document = getDocument();
      if (
        typeof document.getElementById !== "function" ||
        typeof document.createElement !== "function"
      ) {
        pendingReconcile = true;
        return;
      }
      if (!documentIsVisible(document)) {
        pendingReconcile = true;
        return;
      }
      reconcilePanels();
      pendingReconcile = false;
      renderActiveTargets(document);
      renderPlanner(document);
    } catch (error) {
      report(error);
    }
  }

  return Object.freeze({
    syncActiveTargetsUI(enabled: boolean) {
      if (activeEnabled === enabled && !enabled && !pendingReconcile) return;
      if (activeEnabled === enabled) {
        render();
        return;
      }
      activeEnabled = enabled;
      activeSignature = undefined;
      render();
    },
    syncBuildPlannerUI(enabled: boolean) {
      if (plannerEnabled === enabled && !enabled && !pendingReconcile) return;
      if (plannerEnabled === enabled) {
        render();
        return;
      }
      plannerEnabled = enabled;
      plannerSignature = undefined;
      render();
    },
    update(nextModel: Readonly<CapturedPlanningPanelsModel>) {
      model = nextModel;
      if (!activeEnabled && !plannerEnabled && !pendingReconcile) return;
      render();
    },
  });
}
