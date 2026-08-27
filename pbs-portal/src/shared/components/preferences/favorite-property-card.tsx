import type { ReactNode } from "react";

type FavoritePropertyCardProps = {
  actions: ReactNode;
  addAction: ReactNode;
  expandedContent?: ReactNode;
  modifiers?: ReactNode;
  name: string;
  summary: ReactNode;
  summaryAriaLabel: string;
  testId: string;
  tierControl: ReactNode;
};

export const FavoritePropertyCard = ({
  actions,
  addAction,
  expandedContent,
  modifiers,
  name,
  summary,
  summaryAriaLabel,
  testId,
  tierControl,
}: FavoritePropertyCardProps) => (
  <div
    className="rounded-xl border border-border bg-card px-4 py-2 transition hover:bg-muted/40 hover:shadow-sm"
    data-compact-favorite-card="true"
    data-testid={testId}
  >
    <div className="flex min-w-0 items-center gap-4">
      <div className="min-w-0 flex-1" data-favorite-card-content="true">
        <p className="m-0 min-w-0 whitespace-normal break-words text-sm font-bold leading-5 text-foreground">
          {name}
        </p>

        <div className="mt-1 flex min-w-0 items-center gap-2">
          <div
            aria-label={summaryAriaLabel}
            className="min-w-0 whitespace-normal break-words text-sm font-semibold leading-5 text-muted-foreground"
          >
            {summary}
          </div>
          {modifiers ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {modifiers}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center" data-favorite-card-tiers="true">
        {tierControl}
      </div>

      <div className="flex shrink-0 items-center gap-1" data-favorite-card-actions="true">
        {actions}
        {addAction}
      </div>
    </div>

    {expandedContent}
  </div>
);
