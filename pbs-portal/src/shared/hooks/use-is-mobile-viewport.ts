import { useEffect, useState } from "react";

export const MOBILE_VIEWPORT_MAX_WIDTH = 767;

const resolveIsMobileViewport = () =>
  window.innerWidth <= MOBILE_VIEWPORT_MAX_WIDTH;

export const useIsMobileViewport = (): boolean => {
  const [isMobileViewport, setIsMobileViewport] = useState(resolveIsMobileViewport);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(resolveIsMobileViewport());
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return isMobileViewport;
};
