/** Column configuration for customizable left-side panels */
export interface ColumnConfig {
  key: string
  label: string
  width: number
  visible: boolean
  order: number
  row: 1 | 2            // row 1 = top line, row 2 = bottom line (dual-row layout)
}
