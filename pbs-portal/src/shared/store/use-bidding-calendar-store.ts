import { create } from "zustand";

type BiddingCalendarState = {
  activeTierLabel: string;
  setActiveTierLabel: (label: string) => void;
  resetActiveTierLabel: () => void;
};

export const useBiddingCalendarStore = create<BiddingCalendarState>((set) => ({
  activeTierLabel: "",
  setActiveTierLabel: (label) => {
    set({ activeTierLabel: label });
  },
  resetActiveTierLabel: () => {
    set({ activeTierLabel: "" });
  },
}));
