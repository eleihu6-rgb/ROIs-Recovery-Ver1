import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { AppDialog } from "@rois/ui";
import type { RefObject, WheelEvent as ReactWheelEvent } from "react";

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;
const KEYBOARD_PAN_STEP = 40;

type Point = {
  x: number;
  y: number;
};

type PointerDrag = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffset: Point;
};

type HelpImagePreviewProps = {
  alt: string;
  open: boolean;
  src: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampScale = (value: number): number =>
  clamp(Math.round(value / SCALE_STEP) * SCALE_STEP, MIN_SCALE, MAX_SCALE);

export const HelpImagePreview = ({
  alt,
  open,
  src,
  triggerRef,
  onOpenChange,
}: HelpImagePreviewProps) => {
  const viewportDescriptionId = useId();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointerDragRef = useRef<PointerDrag | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const wasOpenRef = useRef(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const getPanBounds = useCallback((nextScale: number): Point => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image || !previewLoaded) {
      return { x: 0, y: 0 };
    }

    return {
      x: Math.max(0, (image.offsetWidth * nextScale - viewport.clientWidth) / 2),
      y: Math.max(0, (image.offsetHeight * nextScale - viewport.clientHeight) / 2),
    };
  }, [previewLoaded]);

  const constrainOffset = useCallback((nextOffset: Point, nextScale: number): Point => {
    const bounds = getPanBounds(nextScale);
    return {
      x: clamp(nextOffset.x, -bounds.x, bounds.x),
      y: clamp(nextOffset.y, -bounds.y, bounds.y),
    };
  }, [getPanBounds]);

  const commitView = useCallback((nextScale: number, nextOffset: Point): void => {
    const constrainedScale = clampScale(nextScale);
    const constrainedOffset = constrainOffset(nextOffset, constrainedScale);
    scaleRef.current = constrainedScale;
    offsetRef.current = constrainedOffset;
    setScale(constrainedScale);
    setOffset(constrainedOffset);
  }, [constrainOffset]);

  const resetView = useCallback((): void => {
    commitView(1, { x: 0, y: 0 });
  }, [commitView]);

  const changeScale = useCallback((requestedScale: number, anchor: Point = { x: 0, y: 0 }): void => {
    const currentScale = scaleRef.current;
    const nextScale = clampScale(requestedScale);
    if (nextScale === currentScale) {
      return;
    }

    const ratio = nextScale / currentScale;
    const currentOffset = offsetRef.current;
    commitView(nextScale, {
      x: currentOffset.x * ratio + anchor.x * (1 - ratio),
      y: currentOffset.y * ratio + anchor.y * (1 - ratio),
    });
  }, [commitView]);

  const panBy = useCallback((delta: Point): void => {
    const currentOffset = offsetRef.current;
    commitView(scaleRef.current, {
      x: currentOffset.x + delta.x,
      y: currentOffset.y + delta.y,
    });
  }, [commitView]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      scaleRef.current = 1;
      offsetRef.current = { x: 0, y: 0 };
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setIsDragging(false);
      setPreviewLoaded(false);
      setPreviewFailed(false);
      const focusFrame = window.requestAnimationFrame(() => viewportRef.current?.focus());
      return () => window.cancelAnimationFrame(focusFrame);
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const focusFrame = window.requestAnimationFrame(() => triggerRef.current?.focus());
      return () => window.cancelAnimationFrame(focusFrame);
    }
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleResize = (): void => {
      commitView(scaleRef.current, offsetRef.current);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [commitView, open]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!previewLoaded) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const anchor = {
      x: event.clientX - (bounds.left + bounds.width / 2),
      y: event.clientY - (bounds.top + bounds.height / 2),
    };
    changeScale(scaleRef.current + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP), anchor);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!previewLoaded) {
      return;
    }

    const panBounds = getPanBounds(scaleRef.current);
    if (panBounds.x === 0 && panBounds.y === 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: offsetRef.current,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    commitView(scaleRef.current, {
      x: drag.startOffset.x + event.clientX - drag.startClientX,
      y: drag.startOffset.y + event.clientY - drag.startClientY,
    });
  };

  const finishPointerDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerDragRef.current = null;
    setIsDragging(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const handledKeys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "+",
      "=",
      "-",
      "0",
    ];
    if (!handledKeys.includes(event.key)) {
      return;
    }

    event.preventDefault();
    if (event.key === "ArrowLeft") panBy({ x: KEYBOARD_PAN_STEP, y: 0 });
    if (event.key === "ArrowRight") panBy({ x: -KEYBOARD_PAN_STEP, y: 0 });
    if (event.key === "ArrowUp") panBy({ x: 0, y: KEYBOARD_PAN_STEP });
    if (event.key === "ArrowDown") panBy({ x: 0, y: -KEYBOARD_PAN_STEP });
    if (event.key === "+" || event.key === "=") changeScale(scaleRef.current + SCALE_STEP);
    if (event.key === "-") changeScale(scaleRef.current - SCALE_STEP);
    if (event.key === "0") resetView();
  };

  const handlePreviewLoad = (): void => {
    setPreviewLoaded(true);
    setPreviewFailed(false);
    window.requestAnimationFrame(() => commitView(1, { x: 0, y: 0 }));
  };

  const handlePreviewError = (): void => {
    setPreviewLoaded(false);
    setPreviewFailed(true);
  };

  return (
    <AppDialog
      bodyClassName="relative flex min-h-0 flex-col !overflow-hidden !p-0"
      className="left-1/2 top-1/2 h-[92dvh] w-[96vw] max-w-[96vw] [&_[data-app-dialog-header]]:hidden"
      data-testid="help-image-preview-dialog"
      dismissable
      draggable={false}
      modal
      open={open}
      showClose={false}
      title={`Image preview — ${alt}`}
      onOpenChange={onOpenChange}
    >
      <p className="sr-only" id={viewportDescriptionId}>
        Use the mouse wheel or plus and minus keys to zoom. Drag the image or use the arrow keys to move. Press zero to reset.
      </p>
      <output
        aria-live="polite"
        className="sr-only"
        data-testid="help-image-preview-scale"
      >
        {Math.round(scale * 100)}%
      </output>
      <div
        ref={viewportRef}
        aria-describedby={viewportDescriptionId}
        aria-label="Image preview canvas"
        className={[
          "relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
          isDragging ? "cursor-grabbing" : (scale > 1 ? "cursor-grab" : "cursor-default"),
        ].join(" ")}
        data-testid="help-image-preview-viewport"
        role="group"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerCancel={finishPointerDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onWheel={handleWheel}
      >
        <button
          aria-label="Close image preview"
          className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur-sm transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          data-testid="help-image-preview-floating-close"
          type="button"
          onClick={() => onOpenChange(false)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
        {previewFailed ? (
          <div
            className="rounded-xl border border-destructive/40 bg-background px-5 py-4 text-sm font-semibold text-destructive shadow-sm"
            role="alert"
          >
            This image could not be loaded. Close the preview and try again.
          </div>
        ) : (
          <img
            ref={imageRef}
            alt={alt}
            className={[
              "block max-h-full max-w-full object-contain shadow-2xl",
              isDragging ? "" : "transition-transform duration-150",
              previewLoaded ? "opacity-100" : "opacity-0",
            ].join(" ")}
            data-testid="help-image-preview-image"
            draggable={false}
            src={src}
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              transformOrigin: "center",
            }}
            onError={handlePreviewError}
            onLoad={handlePreviewLoad}
          />
        )}
      </div>
    </AppDialog>
  );
};
