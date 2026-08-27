import type { ReactNode } from "react";

type PanelStripHeaderProps = {
  title: string;
  collapsible?: boolean;
  children?: ReactNode;
  onToggle?: () => void;
};

export const PanelStripHeader = ({
  title,
  collapsible = false,
  children,
  onToggle,
}: PanelStripHeaderProps) => {
  const Comp = collapsible ? "button" : "div";

  return (
    <Comp
      className={collapsible
        ? "flex h-8 w-full cursor-pointer items-center rounded-sm bg-[rgba(104,102,204,0.08)] text-left"
        : "flex h-8 w-full items-center rounded-sm bg-[rgba(104,102,204,0.08)] text-left"}
      type={collapsible ? "button" : undefined}
      onClick={collapsible ? onToggle : undefined}
    >
      <span className="h-8 w-1 rounded-l-sm bg-[#706cd5]" />
      <span className="ml-3 flex-1 text-sm font-medium leading-[18px] text-[#4d4f5c]">
        {title}
      </span>
      {children}
    </Comp>
  );
};
