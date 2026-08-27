import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  HEADER_DESIGN_HEIGHT,
  resolveHeaderScale,
} from "@/app/layout/use-dashboard-header-layout";

type ScaledPageCanvasProps = {
  children: ReactNode;
  designWidth: number;
  designHeight: number;
  horizontalPadding?: number;
  bottomPadding?: number;
  topPadding?: number;
  fullFitBelowWidth?: number;
  viewportTestId?: string;
  canvasTestId?: string;
  allowVerticalOverflow?: boolean;
};

const MIN_VIEWPORT_SIZE = 320;

const ScaledPageCanvasPortalTargetContext = createContext<HTMLElement | null>(null);

export const useScaledPageCanvasPortalTarget = () => useContext(ScaledPageCanvasPortalTargetContext);

const getViewportSize = () => ({
  height: window.innerHeight,
  width: window.innerWidth,
});

export const ScaledPageCanvas = ({
  children,
  designWidth,
  designHeight,
  horizontalPadding = 32,
  bottomPadding = 16,
  topPadding = 16,
  fullFitBelowWidth = 1080,
  viewportTestId,
  canvasTestId,
  allowVerticalOverflow = false,
}: ScaledPageCanvasProps) => {
  const [viewport, setViewport] = useState(() => getViewportSize());
  const [canvasContentHeight, setCanvasContentHeight] = useState(designHeight);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const handlePortalTargetRef = useCallback((element: HTMLDivElement | null) => {
    setPortalTarget(element);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewport(getViewportSize());
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!allowVerticalOverflow) {
      setCanvasContentHeight(designHeight);
      return undefined;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const updateCanvasContentHeight = () => {
      const nextHeight = Math.max(designHeight, canvas.scrollHeight, canvas.offsetHeight);

      setCanvasContentHeight((currentHeight) =>
        Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight);
    };
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateCanvasContentHeight);

    updateCanvasContentHeight();
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", updateCanvasContentHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateCanvasContentHeight);
    };
  }, [allowVerticalOverflow, designHeight]);

  const metrics = useMemo(() => {
    const headerHeight = Math.round(HEADER_DESIGN_HEIGHT * resolveHeaderScale(viewport.width));
    const availableWidth = Math.max(viewport.width - horizontalPadding, MIN_VIEWPORT_SIZE);
    const availableHeight = Math.max(
      viewport.height - headerHeight - topPadding - bottomPadding,
      MIN_VIEWPORT_SIZE,
    );
    const widthScale = availableWidth / designWidth;
    const heightScale = availableHeight / designHeight;
    const pageScale = Math.max(Math.min(widthScale, heightScale), 0.0001);
    const useFullFitLayout = viewport.width < fullFitBelowWidth;
    const canvasWidth = useFullFitLayout ? designWidth : Math.max(designWidth, availableWidth / pageScale);
    const canvasHeight = useFullFitLayout
      ? designHeight
      : Math.max(designHeight, availableHeight / pageScale);
    const canvasViewportWidth = useFullFitLayout
      ? `${Math.ceil(canvasWidth * pageScale)}px`
      : `${Math.ceil(availableWidth)}px`;
    const baseViewportHeight = useFullFitLayout
      ? Math.ceil(canvasHeight * pageScale)
      : Math.ceil(availableHeight);
    const overflowViewportHeight = allowVerticalOverflow
      ? Math.ceil(Math.max(canvasHeight, canvasContentHeight) * pageScale)
      : baseViewportHeight;
    const canvasViewportHeight = `${Math.max(baseViewportHeight, overflowViewportHeight)}px`;

    return {
      canvasHeight,
      canvasViewportHeight,
      canvasViewportWidth,
      canvasWidth,
      pageScale,
      useFullFitLayout,
    };
  }, [
    allowVerticalOverflow,
    bottomPadding,
    canvasContentHeight,
    designHeight,
    designWidth,
    fullFitBelowWidth,
    horizontalPadding,
    topPadding,
    viewport.height,
    viewport.width,
  ]);

  const canvasStyle: CSSProperties = {
    minHeight: `${metrics.canvasHeight}px`,
    transform: `scale(${metrics.pageScale})`,
    width: `${metrics.canvasWidth}px`,
    "--portal-page-shell-height": `${metrics.canvasHeight}px`,
  } as CSSProperties;

  return (
    <div className="w-full">
      <div
        className="mx-auto"
        data-layout-mode={metrics.useFullFitLayout ? "fit" : "adaptive"}
        data-testid={viewportTestId}
        style={{ height: metrics.canvasViewportHeight, width: metrics.canvasViewportWidth }}
      >
        <div
          className="relative origin-top-left"
          data-testid={canvasTestId}
          ref={canvasRef}
          style={canvasStyle}
        >
          <ScaledPageCanvasPortalTargetContext.Provider value={portalTarget}>
            {children}
            <div
              className="pointer-events-none absolute inset-0 z-[80]"
              data-testid="scaled-page-dialog-portal-root"
              ref={handlePortalTargetRef}
            />
          </ScaledPageCanvasPortalTargetContext.Provider>
        </div>
      </div>
    </div>
  );
};
