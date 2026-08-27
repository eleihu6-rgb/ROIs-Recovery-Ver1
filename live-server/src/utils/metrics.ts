import { register, Counter, Gauge, Histogram } from 'prom-client'
import type { CounterConfiguration, GaugeConfiguration, HistogramConfiguration } from 'prom-client'

/**
 * Idempotent metric factories. prom-client's default `register` is a process-wide
 * singleton; defining the same metric name twice throws. Tests re-import modules
 * (vi.resetModules) and modules may be imported from several entry points, so we
 * reuse an already-registered metric instead of constructing a duplicate.
 */
export const getOrCreateCounter = (cfg: CounterConfiguration<string>): Counter<string> =>
  (register.getSingleMetric(cfg.name) as Counter<string> | undefined) ?? new Counter(cfg)

export const getOrCreateGauge = (cfg: GaugeConfiguration<string>): Gauge<string> =>
  (register.getSingleMetric(cfg.name) as Gauge<string> | undefined) ?? new Gauge(cfg)

export const getOrCreateHistogram = (cfg: HistogramConfiguration<string>): Histogram<string> =>
  (register.getSingleMetric(cfg.name) as Histogram<string> | undefined) ?? new Histogram(cfg)
