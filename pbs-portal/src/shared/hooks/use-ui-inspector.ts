import { type MutableRefObject, useEffect, useRef, useState } from "react";

export const UI_INSPECTOR_HOVER_CLASS = "ui-inspector-hover";
const AUTO_UI_ID_ATTRIBUTE = "data-uid";
const AUTO_UI_ID_PREFIX = "ui-";

type UiInspectorState = {
  activeId: string | null;
  isVisible: boolean;
  x: number;
  y: number;
};

type UiInspectorMatch = {
  highlightedElement: HTMLElement;
  id: string;
};

const defaultState: UiInspectorState = {
  activeId: null,
  isVisible: false,
  x: 0,
  y: 0,
};

const parseAutoUiIdCounter = (value: string | undefined) => {
  if (!value?.startsWith(AUTO_UI_ID_PREFIX)) {
    return 0;
  }

  const parsedValue = Number.parseInt(value.slice(AUTO_UI_ID_PREFIX.length), 10);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
};

const syncAutoUiIdCounter = (counterRef: MutableRefObject<number>) => {
  const stampedElements = document.querySelectorAll<HTMLElement>(`[${AUTO_UI_ID_ATTRIBUTE}]`);
  let maxCounter = 0;

  stampedElements.forEach((element) => {
    maxCounter = Math.max(maxCounter, parseAutoUiIdCounter(element.dataset.uid));
  });

  counterRef.current = Math.max(counterRef.current, maxCounter + 1);
};

const stampAutoUiIds = (counterRef: MutableRefObject<number>) => {
  syncAutoUiIdCounter(counterRef);

  document.querySelectorAll<HTMLElement>("[class]").forEach((element) => {
    if (element === document.body || element === document.documentElement) {
      return;
    }

    if (element.dataset.uid) {
      return;
    }

    element.dataset.uid = `${AUTO_UI_ID_PREFIX}${counterRef.current}`;
    counterRef.current += 1;
  });
};

const findNearestUiId = (target: HTMLElement | null): string | null => {
  let currentElement = target;

  while (currentElement) {
    const explicitUiId = currentElement.dataset.uiid?.trim();

    if (explicitUiId) {
      return explicitUiId;
    }

    const generatedUiId = currentElement.dataset.uid?.trim();

    if (generatedUiId) {
      return generatedUiId;
    }

    currentElement = currentElement.parentElement;
  }

  return null;
};

const resolveHoveredElement = (event: MouseEvent): HTMLElement | null => {
  const pointTarget =
    typeof document.elementFromPoint === "function"
      ? document.elementFromPoint(event.clientX, event.clientY)
      : null;

  if (pointTarget instanceof HTMLElement) {
    return pointTarget;
  }

  if (event.target instanceof HTMLElement) {
    return event.target;
  }

  return null;
};

const findUiInspectorMatch = (event: MouseEvent): UiInspectorMatch | null => {
  const hoveredElement = resolveHoveredElement(event);

  if (!hoveredElement) {
    return null;
  }

  const uiId = findNearestUiId(hoveredElement);

  if (!uiId) {
    return {
      highlightedElement: hoveredElement,
      id: "",
    };
  }

  return {
    highlightedElement: hoveredElement,
    id: uiId,
  };
};

export const useUiInspector = (enabled: boolean): UiInspectorState => {
  const [state, setState] = useState<UiInspectorState>(defaultState);
  const highlightedElementRef = useRef<HTMLElement | null>(null);
  const autoUiIdCounterRef = useRef(1);

  useEffect(() => {
    const clearHighlight = () => {
      highlightedElementRef.current?.classList.remove(UI_INSPECTOR_HOVER_CLASS);
      highlightedElementRef.current = null;
    };

    if (!enabled) {
      clearHighlight();
      setState(defaultState);
      return;
    }

    stampAutoUiIds(autoUiIdCounterRef);

    const mutationObserver = new MutationObserver(() => {
      stampAutoUiIds(autoUiIdCounterRef);
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const handleMouseMove = (event: MouseEvent) => {
      const match = findUiInspectorMatch(event);

      if (!match) {
        clearHighlight();
        setState((currentState) =>
          currentState.isVisible
            ? {
                activeId: null,
                isVisible: false,
                x: event.clientX,
                y: event.clientY,
              }
            : currentState,
        );
        return;
      }

      if (highlightedElementRef.current !== match.highlightedElement) {
        clearHighlight();
        match.highlightedElement.classList.add(UI_INSPECTOR_HOVER_CLASS);
        highlightedElementRef.current = match.highlightedElement;
      }

      setState({
        activeId: match.id || null,
        isVisible: Boolean(match.id),
        x: event.clientX,
        y: event.clientY,
      });
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      mutationObserver.disconnect();
      document.removeEventListener("mousemove", handleMouseMove);
      clearHighlight();
      setState(defaultState);
    };
  }, [enabled]);

  return state;
};
