import {
  ArrowPathRoundedSquareIcon,
  ChartBarSquareIcon,
  QuestionMarkCircleIcon,
  QueueListIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { HELP_CATEGORIES } from "@/features/help/help-data";
import type { HelpCategory } from "@/features/help/help-data";
import type { ElementType } from "react";

const CATEGORY_ICONS: Record<string, ElementType> = {
  ArrowPathRoundedSquareIcon,
  ChartBarSquareIcon,
  QuestionMarkCircleIcon,
  QueueListIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TrophyIcon,
};

type HelpHomeProps = {
  onTopicSelect: (slug: string) => void;
};

export const HelpHome = ({ onTopicSelect }: HelpHomeProps) => (
  <div className="mx-auto w-full max-w-[1280px] px-8 py-7 xl:px-10">
    <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#706cd5]">
      PBS Portal manual
    </p>
    <h1 className="m-0 text-2xl font-bold leading-9 text-[#282c3b]">Help Center</h1>
    <p className="mt-2 max-w-[720px] text-sm font-medium leading-6 text-[#6f7485]">
      Follow Quick Start for the complete bidding flow, or choose a Portal page for detailed instructions.
    </p>

    <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {HELP_CATEGORIES.map((category) => (
        <CategoryTile key={category.slug} category={category} onTopicSelect={onTopicSelect} />
      ))}
    </div>
  </div>
);

const CategoryTile = ({
  category,
  onTopicSelect,
}: {
  category: HelpCategory;
  onTopicSelect: (slug: string) => void;
}) => {
  const Icon = CATEGORY_ICONS[category.heroIcon] ?? ChartBarSquareIcon;
  const firstTopic = category.topics[0];

  return (
    <button
      className="group min-h-[132px] cursor-pointer rounded-3xl border border-[#dfe3eb] bg-white p-5 text-left shadow-[0_10px_26px_rgba(36,39,45,0.06)] transition hover:border-[#b9bdf0] hover:bg-[#fbfbff]"
      type="button"
      onClick={() => firstTopic && onTopicSelect(firstTopic.slug)}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef0ff] text-[#6467d1] transition group-hover:bg-[#706cd5] group-hover:text-white">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-bold leading-5 text-[#282c3b]">{category.title}</span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-[#7f8392]">
            {category.topics.length} {category.topics.length === 1 ? "topic" : "topics"}
          </span>
        </span>
      </div>
      <span className="mt-4 block text-sm font-medium leading-6 text-[#6f7485]">
        Open {firstTopic?.title ?? "Overview"}.
      </span>
    </button>
  );
};
