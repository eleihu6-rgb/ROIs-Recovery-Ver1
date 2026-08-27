import {
  EnglishDatePicker,
  EnglishDateRangePicker,
  cn,
  type EnglishDatePickerProps,
  type EnglishDateRangePickerProps,
} from '@rois/ui'

const ganttDateButtonClass = [
  'h-7 min-w-[7.5rem] rounded-md border-border/50 bg-muted/40 px-2',
  'text-xs font-normal tabular-nums text-foreground',
  'hover:border-border hover:bg-muted/60',
].join(' ')

export type GanttEnglishDatePickerProps = EnglishDatePickerProps

export const GanttEnglishDatePicker = ({ buttonClassName, ...props }: GanttEnglishDatePickerProps) => (
  <EnglishDatePicker
    {...props}
    buttonClassName={cn(ganttDateButtonClass, buttonClassName)}
  />
)

export type GanttEnglishDateRangePickerProps = EnglishDateRangePickerProps

export const GanttEnglishDateRangePicker = ({
  pickerButtonClassName,
  ...props
}: GanttEnglishDateRangePickerProps) => (
  <EnglishDateRangePicker
    {...props}
    pickerButtonClassName={cn(ganttDateButtonClass, pickerButtonClassName)}
  />
)
