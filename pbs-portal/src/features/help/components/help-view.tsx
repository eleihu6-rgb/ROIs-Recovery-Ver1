import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { HelpArticle } from "@/features/help/components/help-article";
import { HelpHome } from "@/features/help/components/help-home";
import { HelpNav } from "@/features/help/components/help-nav";

const TOPIC_MAP: Record<string, ComponentType> = {
  "portal-overview": lazy(() => import("@/features/help/topics/quick-start/portal-overview")),
  "before-you-begin": lazy(() => import("@/features/help/topics/quick-start/before-you-begin")),
  "complete-a-bid": lazy(() => import("@/features/help/topics/quick-start/complete-a-bid")),
  "dashboard-overview": lazy(() => import("@/features/help/topics/dashboard/dashboard-overview")),
  "dashboard-profile": lazy(() => import("@/features/help/topics/dashboard/dashboard-profile")),
  "dashboard-calendar": lazy(() => import("@/features/help/topics/dashboard/dashboard-calendar")),
  "dashboard-entries": lazy(() => import("@/features/help/topics/dashboard/dashboard-entries")),
  "bid-overview": lazy(() => import("@/features/help/topics/bid/bid-overview")),
  "bid-calendar": lazy(() => import("@/features/help/topics/bid/bid-calendar")),
  "bid-add-properties": lazy(() => import("@/features/help/topics/bid/bid-add-properties")),
  "pairing-configure": lazy(() => import("@/features/help/topics/pairing/pairing-configure")),
  "bid-manage-properties": lazy(() => import("@/features/help/topics/bid/bid-manage-properties")),
  "bid-favorites-search": lazy(() => import("@/features/help/topics/bid/bid-favorites-search")),
  "bid-conditions-days-off": lazy(() => import("@/features/help/topics/bid-conditions/days-off-conditions")),
  "bid-conditions-pairing": lazy(() => import("@/features/help/topics/bid-conditions/pairing-conditions")),
  "bid-conditions-roster-line": lazy(() => import("@/features/help/topics/bid-conditions/roster-line-conditions")),
  "bid-conditions-standing-bid": lazy(() => import("@/features/help/topics/bid-conditions/standing-bid-conditions")),
  "standing-bid-overview": lazy(() => import("@/features/help/topics/standing-bid/standing-bid-overview")),
  "standing-bid-manage": lazy(() => import("@/features/help/topics/standing-bid/standing-bid-manage")),
  "award-overview": lazy(() => import("@/features/help/topics/award/award-overview")),
  "common-questions": lazy(() => import("@/features/help/topics/common/common-questions")),
};

class HelpTopicErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-32 items-center justify-center text-sm font-semibold text-[#7f8392]">
          This article could not be loaded. Try another topic.
        </div>
      );
    }

    return this.props.children;
  }
}

export const HelpView = () => {
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeConditionId, setActiveConditionId] = useState<string | null>(null);
  const [pendingConditionId, setPendingConditionId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const TopicBody = activeTopic ? TOPIC_MAP[activeTopic] : null;

  const handleTopicSelect = (slug: string, conditionId?: string) => {
    setActiveTopic(slug);
    setActiveConditionId(conditionId ?? null);
    setPendingConditionId(conditionId ?? null);
  };

  useEffect(() => {
    if (activeConditionId) {
      return;
    }

    if (typeof contentRef.current?.scrollTo === "function") {
      contentRef.current.scrollTo({ top: 0 });
    }
  }, [activeConditionId, activeTopic]);

  useEffect(() => {
    if (!pendingConditionId) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const scrollToCondition = () => {
      if (cancelled || !contentRef.current) {
        return;
      }

      const target = contentRef.current.querySelector<HTMLElement>(
        `[data-help-condition-id="${pendingConditionId}"]`,
      );
      if (target) {
        target.scrollIntoView({ block: "start" });
        contentRef.current.scrollBy({ top: -16 });
        setPendingConditionId(null);
        return;
      }

      attempts += 1;
      if (attempts <= 20) {
        window.setTimeout(scrollToCondition, 50);
      }
    };

    scrollToCondition();

    return () => {
      cancelled = true;
    };
  }, [activeTopic, pendingConditionId]);

  return (
    <div className="flex h-full overflow-hidden" data-testid="help-view">
      <aside className="w-[300px] shrink-0 border-r border-[#dfe3eb] bg-[#fbfcff]">
        <HelpNav
          activeConditionId={activeConditionId}
          activeTopic={activeTopic}
          onTopicSelect={handleTopicSelect}
        />
      </aside>
      <div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto bg-white">
        {!activeTopic ? <HelpHome onTopicSelect={handleTopicSelect} /> : null}
        {activeTopic && TopicBody ? (
          <HelpTopicErrorBoundary>
            <Suspense
              fallback={(
                <div className="flex h-32 items-center justify-center text-sm font-semibold text-[#7f8392]">
                  Loading...
                </div>
              )}
            >
              <HelpArticle slug={activeTopic}>
                <TopicBody />
              </HelpArticle>
            </Suspense>
          </HelpTopicErrorBoundary>
        ) : null}
      </div>
    </div>
  );
};
