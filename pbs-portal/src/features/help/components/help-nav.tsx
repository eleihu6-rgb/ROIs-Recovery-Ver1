import { useState } from "react";
import {
  ArrowPathRoundedSquareIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  QuestionMarkCircleIcon,
  QueueListIcon,
  RocketLaunchIcon,
  Squares2X2Icon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { HELP_CATEGORIES } from "@/features/help/help-data";
import type { HelpCategory } from "@/features/help/help-data";
import {
  getBidConditionEntriesByGroup,
  getStandingBidConditionEntries,
  type BidConditionHelpEntry,
} from "@/features/help/topics/bid-conditions/condition-help-data";
import type { ElementType } from "react";

const CATEGORY_ICONS: Record<string, ElementType> = {
  ArrowPathRoundedSquareIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  PaperAirplaneIcon,
  QuestionMarkCircleIcon,
  QueueListIcon,
  RocketLaunchIcon,
  Squares2X2Icon,
  TrophyIcon,
};

type HelpNavProps = {
  activeTopic: string | null;
  activeConditionId: string | null;
  onTopicSelect: (slug: string, conditionId?: string) => void;
};

type HelpNavTopic = HelpCategory["topics"][number];

type MatchingTopic = {
  topic: HelpNavTopic;
  children: BidConditionHelpEntry[];
};

const BID_CONDITION_TOPIC_CHILDREN: Record<string, BidConditionHelpEntry[]> = {
  "bid-conditions-days-off": getBidConditionEntriesByGroup("days-off"),
  "bid-conditions-pairing": getBidConditionEntriesByGroup("pairing"),
  "bid-conditions-roster-line": getBidConditionEntriesByGroup("roster-line"),
  "bid-conditions-standing-bid": getStandingBidConditionEntries(),
};

const topicConditionChildren = (topicSlug: string): BidConditionHelpEntry[] =>
  BID_CONDITION_TOPIC_CHILDREN[topicSlug] ?? [];

export const HelpNav = ({ activeTopic, activeConditionId, onTopicSelect }: HelpNavProps) => {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(HELP_CATEGORIES.map((category) => [category.slug, category.defaultExpanded])),
  );
  const normalizedQuery = query.trim().toLowerCase();

  const topicMatchesQuery = (topic: HelpNavTopic) =>
    `${topic.title} ${topic.overview}`.toLowerCase().includes(normalizedQuery);

  const conditionMatchesQuery = (condition: BidConditionHelpEntry) =>
    `${condition.name} ${condition.purpose} ${condition.example}`.toLowerCase().includes(normalizedQuery);

  const matchingTopics = (category: HelpCategory): MatchingTopic[] => {
    if (!normalizedQuery || category.title.toLowerCase().includes(normalizedQuery)) {
      return category.topics.map((topic) => ({
        topic,
        children: topicConditionChildren(topic.slug),
      }));
    }

    return category.topics.flatMap((topic) => {
      const children = topicConditionChildren(topic.slug);
      if (topicMatchesQuery(topic)) {
        return [{ topic, children }];
      }

      const matchingChildren = children.filter(conditionMatchesQuery);
      return matchingChildren.length > 0 ? [{ topic, children: matchingChildren }] : [];
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#dfe3eb] px-4 py-4">
        <p className="mb-3 text-sm font-bold leading-5 text-[#282c3b]">Help Center</p>
        <div className="flex h-9 items-center gap-2 rounded-xl border border-[#cfd6e4] bg-white px-3">
          <MagnifyingGlassIcon className="h-4 w-4 text-[#7f8392]" />
          <input
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[#40424f] outline-none placeholder:text-[#a8afbf]"
            placeholder="Search topics..."
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="Help topics">
        {HELP_CATEGORIES.map((category) => {
          const topics = matchingTopics(category);
          if (normalizedQuery && topics.length === 0) {
            return null;
          }

          const isOpen = normalizedQuery ? true : (expanded[category.slug] ?? category.defaultExpanded);
          const Icon = CATEGORY_ICONS[category.heroIcon] ?? ChartBarSquareIcon;

          return (
            <div key={category.slug}>
              <button
                className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm font-bold text-[#40424f] transition hover:bg-[#f4f6fb]"
                data-testid={`help-cat-${category.slug}`}
                type="button"
                onClick={() => setExpanded((current) => ({ ...current, [category.slug]: !isOpen }))}
              >
                <Icon className="h-4 w-4 shrink-0 text-[#7f8392]" />
                <span className="min-w-0 flex-1 truncate">{category.title}</span>
                {isOpen ? (
                  <ChevronDownIcon className="h-3.5 w-3.5 text-[#8a90a1]" />
                ) : (
                  <ChevronRightIcon className="h-3.5 w-3.5 text-[#8a90a1]" />
                )}
              </button>

              {isOpen ? (
                <div className="pb-1">
                  {topics.map(({ topic, children }) => {
                    const isActiveTopic = topic.slug === activeTopic && !activeConditionId;
                    const isWithinActiveTopic = topic.slug === activeTopic;

                    return (
                      <div key={topic.slug}>
                        <button
                          className={[
                            "flex w-full cursor-pointer items-center border-r-2 px-4 py-1.5 pl-10 text-left text-sm font-semibold transition",
                            isActiveTopic
                              ? "border-[#706cd5] bg-[#f0f1ff] text-[#6467d1]"
                              : isWithinActiveTopic
                                ? "border-transparent text-[#6467d1] hover:bg-[#f8f9fb]"
                                : "border-transparent text-[#6f7485] hover:bg-[#f8f9fb] hover:text-[#40424f]",
                          ].join(" ")}
                          data-testid={`help-topic-${topic.slug}`}
                          type="button"
                          onClick={() => onTopicSelect(topic.slug)}
                        >
                          {topic.title}
                        </button>

                        {children.length > 0 ? (
                          <div className="pb-1">
                            {children.map((condition) => {
                              const isActiveCondition = topic.slug === activeTopic && condition.id === activeConditionId;

                              return (
                                <button
                                  key={`${topic.slug}-${condition.id}`}
                                  className={[
                                    "flex w-full cursor-pointer items-center border-r-2 py-1 pl-14 pr-4 text-left text-xs font-semibold leading-4 transition",
                                    isActiveCondition
                                      ? "border-[#706cd5] bg-[#f4f5ff] text-[#6467d1]"
                                      : "border-transparent text-[#7f8392] hover:bg-[#f8f9fb] hover:text-[#40424f]",
                                  ].join(" ")}
                                  data-testid={`help-condition-topic-${topic.slug}-${condition.id}`}
                                  type="button"
                                  onClick={() => onTopicSelect(topic.slug, condition.id)}
                                >
                                  {condition.name}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
};
