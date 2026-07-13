interface SortChild {
  offsetWidth: number;
  offsetHeight: number;
  style: { width?: string; height?: string };
}

interface SortNode {
  childNodes: SortChild[];
}

interface SortCollection {
  0: SortNode;
  clone(): SortCollection;
  css(property: string, value: string): void;
}

interface SortHelperDependencies {
  getJQuery: () => (value: unknown) => SortCollection;
  isHTMLElement: (value: unknown) => boolean;
}

export function createSortHelper({
  getJQuery,
  isHTMLElement,
}: SortHelperDependencies) {
  function sorterHelper(_event: unknown, input: unknown) {
    const clone = getJQuery()(input).clone();
    clone.css("position", "absolute");
    const source = (
      isHTMLElement(input) ? input : (input as SortCollection)[0]
    ) as SortNode;
    const cloneNode = clone[0];
    source.childNodes.forEach((element, index) => {
      if (element.offsetWidth && element.offsetHeight) {
        cloneNode.childNodes[index].style.width = `${element.offsetWidth}px`;
        cloneNode.childNodes[index].style.height = `${element.offsetHeight}px`;
      }
    });
    return cloneNode;
  }

  return { sorterHelper };
}
