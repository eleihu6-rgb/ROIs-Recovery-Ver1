export interface HelpTopic {
  slug: string;
  title: string;
  categorySlug: string;
  stepCount?: number;
  overview: string;
}

export interface HelpCategory {
  slug: string;
  title: string;
  heroIcon: string;
  defaultExpanded: boolean;
  topics: HelpTopic[];
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "quick-start",
    title: "Quick Start",
    heroIcon: "RocketLaunchIcon",
    defaultExpanded: true,
    topics: [
      {
        slug: "portal-overview",
        title: "PBS Portal overview",
        categorySlug: "quick-start",
        overview: "Learn what each Portal page is for and where to complete each bidding task.",
      },
      {
        slug: "before-you-begin",
        title: "Before you begin",
        categorySlug: "quick-start",
        stepCount: 4,
        overview: "Check the bid period, your profile, and the difference between Current Bid and Standing Bid before adding a condition.",
      },
      {
        slug: "complete-a-bid",
        title: "Complete a Bid",
        categorySlug: "quick-start",
        stepCount: 6,
        overview: "Follow the basic path from checking the bid period to confirming a saved condition and viewing a published Award.",
      },
    ],
  },
  {
    slug: "dashboard",
    title: "Dashboard",
    heroIcon: "ChartBarSquareIcon",
    defaultExpanded: true,
    topics: [
      {
        slug: "dashboard-overview",
        title: "Overview",
        categorySlug: "dashboard",
        overview: "Use Dashboard to confirm your bid period, profile information, bidding-calendar activity, and pre-assigned duties.",
      },
      {
        slug: "dashboard-profile",
        title: "User and bid information",
        categorySlug: "dashboard",
        stepCount: 4,
        overview: "Read the left profile panel, bid-window labels, remaining-time status, and user profile fields.",
      },
      {
        slug: "dashboard-calendar",
        title: "Read the bidding calendar",
        categorySlug: "dashboard",
        stepCount: 4,
        overview: "Read the month, T1-T7 rows, dates, color-coded entries, and saved activity shown in BIDDING CALENDAR.",
      },
      {
        slug: "dashboard-entries",
        title: "Pre-assigned duties",
        categorySlug: "dashboard",
        stepCount: 4,
        overview: "Understand the MESSAGE CENTER duty counts, covered days, category tags, and scrollable duty detail list.",
      },
    ],
  },
  {
    slug: "bid",
    title: "Bid",
    heroIcon: "QueueListIcon",
    defaultExpanded: true,
    topics: [
      {
        slug: "bid-overview",
        title: "Overview",
        categorySlug: "bid",
        overview: "Bid is the current-period workspace for Days Off, Pairing, and Roster conditions.",
      },
      {
        slug: "bid-calendar",
        title: "Use the bidding calendar",
        categorySlug: "bid",
        stepCount: 5,
        overview: "Use the shared BIDDING CALENDAR to select a Tier, review saved activity, read DO / RES planning badges, and start supported date actions.",
      },
      {
        slug: "bid-add-properties",
        title: "Add Bid properties",
        categorySlug: "bid",
        stepCount: 6,
        overview: "Choose a property, configure its condition, select T1-T7, and add it to the Current Bid.",
      },
      {
        slug: "pairing-configure",
        title: "Configure Pairing Preference",
        categorySlug: "bid",
        stepCount: 8,
        overview: "Configure a Pairing property, filter the selectable pairing list, and save the selected bid.",
      },
      {
        slug: "bid-manage-properties",
        title: "Review, edit, and delete",
        categorySlug: "bid",
        stepCount: 5,
        overview: "Use EXISTING BID PROPERTIES to confirm, edit, preview, or remove saved conditions.",
      },
      {
        slug: "bid-favorites-search",
        title: "Favorites and Search Pairings",
        categorySlug: "bid",
        stepCount: 5,
        overview: "Reuse saved condition templates and check which pairings match your current Pairing rules.",
      },
    ],
  },
  {
    slug: "bid-conditions",
    title: "Bid Conditions",
    heroIcon: "Squares2X2Icon",
    defaultExpanded: false,
    topics: [
      {
        slug: "bid-conditions-days-off",
        title: "Days Off Conditions",
        categorySlug: "bid-conditions",
        overview: "Reference for visible Days Off conditions: Prefer Off and Long Stretch Off / Compressed Flying.",
      },
      {
        slug: "bid-conditions-pairing",
        title: "Pairing Conditions",
        categorySlug: "bid-conditions",
        overview: "Reference for visible Pairing conditions including Pairing Preference, Check-In / Check-Out Time, Flight Legs per Duty, Work Day Preference, Pairing Length, Flight Number Preference, Redeye Preference, Deadhead Flying, Time Between Flights, Month-End Carryover, Airport Preference, and Efficient Flying First.",
      },
      {
        slug: "bid-conditions-roster-line",
        title: "Roster / Line Conditions",
        categorySlug: "bid-conditions",
        overview: "Reference for visible Roster / Line conditions: Minimum Base Layover, Commuter Pattern, Mixed Line Bid, Credit Window Preference, and Reserve Preference.",
      },
      {
        slug: "bid-conditions-standing-bid",
        title: "Standing Bid Conditions",
        categorySlug: "bid-conditions",
        overview: "Reference for reusable Standing Bid conditions and the Current-only Pairing Preference exception.",
      },
    ],
  },
  {
    slug: "standing-bid",
    title: "Standing Bid",
    heroIcon: "ArrowPathRoundedSquareIcon",
    defaultExpanded: false,
    topics: [
      {
        slug: "standing-bid-overview",
        title: "Overview",
        categorySlug: "standing-bid",
        overview: "Standing Bid stores reusable long-term conditions separately from the Current Bid.",
      },
      {
        slug: "standing-bid-manage",
        title: "Add and manage Standing Bid",
        categorySlug: "standing-bid",
        stepCount: 6,
        overview: "Add a visible Standing property, assign T1-T7, and review, filter, edit, or delete saved conditions.",
      },
    ],
  },
  {
    slug: "award",
    title: "Award",
    heroIcon: "TrophyIcon",
    defaultExpanded: false,
    topics: [
      {
        slug: "award-overview",
        title: "View a published Award",
        categorySlug: "award",
        stepCount: 5,
        overview: "Use Award after results are published to review the awarded roster, duty details, and available explanation information.",
      },
    ],
  },
  {
    slug: "common-questions",
    title: "Common Questions",
    heroIcon: "QuestionMarkCircleIcon",
    defaultExpanded: false,
    topics: [
      {
        slug: "common-questions",
        title: "Common questions and recovery steps",
        categorySlug: "common-questions",
        overview: "Find the next step when a button is unavailable, a condition is missing, or a page does not update as expected.",
      },
    ],
  },
];

export const ALL_TOPICS: HelpTopic[] = HELP_CATEGORIES.flatMap((category) => category.topics);

export const findTopic = (slug: string): HelpTopic | undefined =>
  ALL_TOPICS.find((topic) => topic.slug === slug);

export const findCategory = (slug: string): HelpCategory | undefined =>
  HELP_CATEGORIES.find((category) => category.slug === slug);
