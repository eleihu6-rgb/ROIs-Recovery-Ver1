import { useEffect, useState } from "react";

type UseViewportScaleOptions = {
  canvasWidth: number;
  minViewportWidth: number;
};

type ViewportScaleState = {
  scale: number;
  canvasWidth: number;
  viewportWidth: number;
};

const getViewportWidth = () => window.innerWidth;

const resolveViewportScale = ({
  canvasWidth,
  minViewportWidth,
}: UseViewportScaleOptions): ViewportScaleState => {
  const viewportWidth = getViewportWidth();
  const scale = viewportWidth < minViewportWidth ? viewportWidth / canvasWidth : 1;

  return {
    scale,
    canvasWidth: canvasWidth * scale,
    viewportWidth,
  };
};

export const useViewportScale = (options: UseViewportScaleOptions): ViewportScaleState => {
  const { canvasWidth, minViewportWidth } = options;
  const [state, setState] = useState(() =>
    resolveViewportScale({ canvasWidth, minViewportWidth }),
  );

  useEffect(() => {
    const handleResize = () => {
      setState(resolveViewportScale({ canvasWidth, minViewportWidth }));
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [canvasWidth, minViewportWidth]);

  return state;
};
