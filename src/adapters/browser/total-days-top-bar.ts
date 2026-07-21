import type { TotalDaysTopBarReader } from "../../ports/total-days-top-bar.ts";

interface TotalDaysElement {
  textContent: string | number | null;
  remove(): void;
}

interface TotalDaysDocument {
  getElementById(id: string): TotalDaysElement | null;
}

interface JQueryNode {
  readonly length: number;
  find(selector: string): JQueryNode;
  after(node: JQueryNode): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;

export interface TotalDaysTopBarBrowserDependencies {
  readonly getDocument: () => TotalDaysDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: TotalDaysTopBarReader;
}

export interface TotalDaysTopBarBrowserAdapter {
  updateTotalDaysInTopBar(): void;
  addTotalDaysToTopBar(): void;
  removeTotalDaysFromTopBar(): void;
}

export function createTotalDaysTopBarBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
}: TotalDaysTopBarBrowserDependencies): TotalDaysTopBarBrowserAdapter {
  function updateTotalDaysInTopBar(): void {
    if (reader.readDisplayEnabled()) {
      addTotalDaysToTopBar();
    } else {
      removeTotalDaysFromTopBar();
    }

    const totalDaysNode = getDocument().getElementById("s-total-days-count");
    if (totalDaysNode === null) {
      return;
    }

    totalDaysNode.textContent = reader.readTotalDays();
  }

  function addTotalDaysToTopBar(): void {
    const document = getDocument();
    if (document.getElementById("s-total-days") !== null) {
      return;
    }

    const calendarNode = getJQuery()("#topBar .calendar");
    if (calendarNode.length === 0) {
      return;
    }

    calendarNode
      .find(".day")
      .after(
        getJQuery()(
          '<span id="s-total-days" class="has-text-warning" style="padding-left: 3px;">(<span id="s-total-days-count"></span>)</span>',
        ),
      );
  }

  function removeTotalDaysFromTopBar(): void {
    const totalDaysNode = getDocument().getElementById("s-total-days");
    if (totalDaysNode === null) {
      return;
    }

    totalDaysNode.remove();
  }

  return Object.freeze({
    updateTotalDaysInTopBar,
    addTotalDaysToTopBar,
    removeTotalDaysFromTopBar,
  });
}
