import type { ComponentProps } from "react";
import { PreferOffCalendarPicker } from "@/features/days-off/components/prefer-off-calendar-picker";

/**
 * Shared Preference date picker contract.
 *
 * The underlying calendar remains the established picker while its public API
 * is narrowed to overlay-only behavior. Preference callers must not reserve
 * layout space for a portaled popover.
 */
export type PbsDatePickerProps = Omit<
  ComponentProps<typeof PreferOffCalendarPicker>,
  "reservePopoverSpace"
>;

export const PbsDatePicker = (props: PbsDatePickerProps) => (
  <PreferOffCalendarPicker {...props} />
);
