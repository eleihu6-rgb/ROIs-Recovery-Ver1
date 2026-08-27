export type TopNavItem = {
  key: string;
  label: string;
  path: string;
};

export const TOP_NAV_ITEMS: TopNavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "bid", label: "Bid", path: "/bid" },
  { key: "award", label: "Award", path: "/award" },
  { key: "standing-bid", label: "Standing Bid", path: "/standing-bid" },
  { key: "help", label: "Help", path: "/help" },
];
