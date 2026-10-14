export interface PieChartDatum {
  name: string
  value: number
}

export interface ChartYAxis {
  name: string
  unit?: string
  position?: 'left' | 'right'
}

export interface BarLineChartSeries {
  name: string
  type: 'bar' | 'line'
  data: number[]
  yAxisIndex?: 0 | 1
  color?: string
  smooth?: boolean
  stack?: string
}
