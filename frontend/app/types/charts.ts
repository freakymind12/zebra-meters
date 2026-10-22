export interface PieChartDatum {
  name: string
  value: number
  /** Hostname collector yang pernah melihat entitas ini (opsional). */
  hostnames?: string[]
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

/**
 * Anotasi yang digambar vertikal di dalam batang: model printer (label)
 * dan printhead ID (sublabel). Menggantikan label nilai & label sumbu X.
 */
export interface BarAnnotation {
  label: string
  sublabel?: string
  /** Hostname collector yang terkait dengan bar ini (opsional, tampil di tooltip). */
  hostnames?: string[]
}
