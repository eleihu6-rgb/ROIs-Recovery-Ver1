// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
export {
  themes,
  defaultTheme,
  type Theme,
  type ThemeColors,
  ThemeProvider,
  useTheme,
  type ThemeProviderProps,
  type ColorMode,
  type ThemeContextValue,
} from "./theme";

// ---------------------------------------------------------------------------
// I18n
// ---------------------------------------------------------------------------
export {
  I18nProvider,
  useI18n,
  locales,
  type I18nProviderProps,
  type LocaleKey,
  type Locale,
} from "./i18n";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export { cn } from "./lib/utils";
export {
  formatUiDate,
  formatUiDateTime,
  formatUiDateRange,
  type UiDateOptions,
} from "./lib/format-date";
export {
  ENGLISH_MONTH_LONG,
  ENGLISH_MONTH_SHORT,
  ENGLISH_WEEKDAY_SHORT,
  buildCalendarCells,
  compareIsoDates,
  daysInMonth,
  formatEnglishDate,
  formatEnglishMonth,
  formatIsoDate,
  getInitialCalendarMonth,
  isIsoDateWithinBounds,
  parseCalendarMonth,
  parseIsoDate,
  shiftCalendarMonth,
  type CalendarCell,
  type CalendarDateParts,
  type CalendarMonth,
} from "./lib/calendar-date";
export {
  useCredentialAutofillSync,
  type CredentialAutofillSyncField,
  type UseCredentialAutofillSyncOptions,
} from "./hooks/use-credential-autofill-sync";

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

// Button
export { Button, buttonVariants, type ButtonProps } from "./components/button";

// Input
export { Input, type InputProps } from "./components/input";

// English Date Picker
export {
  EnglishDatePicker,
  type EnglishDatePickerProps,
} from "./components/english-date-picker";
export {
  EnglishDateRangePicker,
  type EnglishDateRangePickerProps,
} from "./components/english-date-range-picker";

// Select
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "./components/select";

// Dialog
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/dialog";

// Dropdown Menu
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./components/dropdown-menu";

// Table
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/table";

// Badge
export { Badge, badgeVariants, type BadgeProps } from "./components/badge";

// Toast (sonner)
export { Toaster, toast } from "./components/toast";

// Message (sonner)
export {
  Message,
  message,
  type MessageOptions,
  type MessageProps,
} from "./components/message";

// Tooltip
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/tooltip";

// Popover
export {
  Popover,
  PopoverTrigger,
  PopoverClose,
  PopoverContent,
} from "./components/popover";

// Card
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/card";

// ---------------------------------------------------------------------------
// Composites
// ---------------------------------------------------------------------------

// AppDialog — project-wide standard pop-up window (blue title bar, top-left
// icon, top-right close, bottom-right footer, draggable). See root CLAUDE.md.
export { AppDialog, type AppDialogProps } from "./composites/app-dialog";
