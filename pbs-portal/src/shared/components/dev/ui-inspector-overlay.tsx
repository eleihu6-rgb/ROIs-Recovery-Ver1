import { UI_INSPECTOR_HOVER_CLASS, useUiInspector } from "@/shared/hooks/use-ui-inspector";

type UiInspectorOverlayProps = {
  enabled: boolean;
};

const tooltipWidth = 240;
const tooltipOffset = 16;

export const UIInspectorOverlay = ({ enabled }: UiInspectorOverlayProps) => {
  const { activeId, isVisible, x, y } = useUiInspector(enabled);

  if (!enabled && !isVisible) {
    return null;
  }

  const maxLeft = Math.max(window.innerWidth - tooltipWidth - 12, 12);
  const tooltipLeft = Math.min(x + tooltipOffset, maxLeft);
  const tooltipTop = Math.max(y + tooltipOffset, 12);

  return (
    <>
      <style>
        {`
          .${UI_INSPECTOR_HOVER_CLASS} {
            outline: 2px solid #706cd5 !important;
            outline-offset: 2px !important;
            box-shadow: 0 0 0 4px rgba(112, 108, 213, 0.18) !important;
          }
        `}
      </style>
      {isVisible && activeId ? (
        <div
          aria-live="polite"
          data-testid="ui-inspector-tooltip"
          style={{
            position: "fixed",
            top: `${tooltipTop}px`,
            left: `${tooltipLeft}px`,
            zIndex: 90,
            maxWidth: `${tooltipWidth}px`,
            pointerEvents: "none",
            borderRadius: "10px",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            background: "rgba(36, 39, 45, 0.92)",
            color: "#ffffff",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.28)",
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              lineHeight: "14px",
              opacity: 0.72,
              textTransform: "uppercase",
            }}
          >
            UIID
          </div>
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
              fontSize: "12px",
              fontWeight: 600,
              lineHeight: "18px",
              marginTop: "4px",
              overflowWrap: "anywhere",
            }}
          >
            {activeId}
          </div>
        </div>
      ) : null}
    </>
  );
};
