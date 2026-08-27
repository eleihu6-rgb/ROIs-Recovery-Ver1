interface PlaceholderViewProps {
  module: string
}

/** 未开发模块的占位页 */
export const PlaceholderView = ({ module }: PlaceholderViewProps) => (
  <div className="flex h-full items-center justify-center">
    <div className="text-center">
      <div className="mb-2 text-base font-bold text-foreground">{module}</div>
      <div className="text-xs text-muted-foreground">This module is under development</div>
    </div>
  </div>
)
