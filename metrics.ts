import * as safety from "https://denopkg.com/shah/ts-safety@v0.3.1/mod.ts";

export type MetricName = string;
export type MetricDescription = string;
export type MetricNamePrefix = MetricName;
export type MetricLabelName = string;

export interface Metric {
  readonly name: MetricName;
  readonly help: MetricDescription;
  readonly declare: (dest: string[], options: MetricsDialect) => void;
}

export interface MetricInstance<M extends Metric> {
  readonly metric: M;
  readonly stringify: (options: MetricsDialect) => string;
}

// deno-lint-ignore ban-types
export type TypedObject = object;

export interface MetricLabels<T extends TypedObject> {
  readonly object: T;
  readonly stringify: (options: MetricsDialect) => string;
}

export function isMetricLabels<T extends TypedObject>(
  o: unknown,
): o is MetricLabels<T> {
  const isType = safety.typeGuard<MetricLabels<T>>("object", "stringify");
  return isType(o);
}

export function openMetricsLabels<T extends TypedObject>(
  values: T,
  options: {
    readonly skipUndefinedLabels: boolean;
  } = { skipUndefinedLabels: true },
): MetricLabels<T> {
  return {
    object: values,
    stringify: () => {
      const kvPairs: string[] = [];
      for (const entry of Object.entries(values)) {
        const [name, value] = entry;
        switch (typeof value) {
          case "number":
            kvPairs.push(`${name}="${value}"`);
            break;

          case "function":
            // utility functions should be skipped
            continue;

          case "undefined":
            if (!options.skipUndefinedLabels) {
              kvPairs.push(`${name}=""`);
            }
            break;

          default:
            // strings, dates, etc.
            kvPairs.push(`${name}=${JSON.stringify(value)}`);
        }
      }
      return kvPairs.join(", ");
    },
  };
}

export interface LabeledMetricInstance<M extends Metric, T extends TypedObject>
  extends MetricInstance<M> {
  readonly labels: MetricLabels<T>;
}

export interface InfoMetric<T extends TypedObject> extends Metric {
  readonly instance: (
    labelValues: T | MetricLabels<T>,
  ) => LabeledMetricInstance<InfoMetric<T>, T>;
}

export function infoMetric<T extends TypedObject>(
  name: MetricName,
  help: string,
): InfoMetric<T> {
  const metric: InfoMetric<T> = {
    name: `${name}_info`,
    help,
    instance: (labelValues) => {
      const instanceLabels = isMetricLabels<T>(labelValues)
        ? labelValues
        : openMetricsLabels(labelValues);
      const instance: LabeledMetricInstance<InfoMetric<T>, T> = {
        metric,
        labels: instanceLabels,
        stringify: (options: MetricsDialect): string => {
          return `${instance.metric.name}{${
            instanceLabels.stringify(options)
          }} 1`;
        },
      };
      return instance;
    },
    declare: (dest: string[], options: MetricsDialect): void => {
      dest.push(`# HELP ${metric.name} ${metric.help}`);
      dest.push(`# TYPE ${metric.name} gauge`);
    },
  };
  return metric;
}

export interface GaugeMetricInstance<T extends TypedObject>
  extends LabeledMetricInstance<GaugeMetric<T>, T> {
  readonly value: (set?: number) => number;
}

export interface GaugeMetric<T extends TypedObject> extends Metric {
  readonly instance: (
    metricValue: number,
    labelValues: T | MetricLabels<T>,
  ) => GaugeMetricInstance<T>;
}

export function gaugeMetric<T extends TypedObject>(
  name: MetricName,
  help: string,
): GaugeMetric<T> {
  const metric: GaugeMetric<T> = {
    name,
    help,
    instance: (metricValue, labelValues) => {
      let value = metricValue;
      const instanceLabels = isMetricLabels<T>(labelValues)
        ? labelValues
        : openMetricsLabels(labelValues);
      const instance: GaugeMetricInstance<T> = {
        metric,
        labels: instanceLabels,
        value: (set?: number): number => {
          if (set) value = set;
          return value;
        },
        stringify: (options: MetricsDialect): string => {
          return `${instance.metric.name}{${
            instanceLabels.stringify(options)
          }} ${value}`;
        },
      };
      return instance;
    },
    declare: (dest: string[], options: MetricsDialect): void => {
      dest.push(`# HELP ${metric.name} ${metric.help}`);
      dest.push(`# TYPE ${metric.name} gauge`);
    },
  };
  return metric;
}

export interface Metrics {
  readonly instances: MetricInstance<Metric>[];
  readonly infoMetric: <T extends TypedObject>(
    name: MetricName,
    help: string,
  ) => InfoMetric<T>;
  readonly gaugeMetric: <T extends TypedObject>(
    name: MetricName,
    help: string,
  ) => GaugeMetric<T>;
}

export interface MetricsDialect {
  export(instances: MetricInstance<Metric>[]): string[];
}

export function prometheusDialect(): MetricsDialect {
  const dialect: MetricsDialect = {
    export: (instances: MetricInstance<Metric>[]) => {
      const encounteredMetrics = new Map<MetricLabelName, boolean>();
      const result: string[] = [];
      for (const instance of instances) {
        const encountered = encounteredMetrics.get(instance.metric.name);
        if (!encountered) {
          instance.metric.declare(result, dialect);
          encounteredMetrics.set(instance.metric.name, true);
        }
        result.push(instance.stringify(dialect));
      }
      return result;
    },
  };
  return dialect;
}

export class TypicalMetrics implements Metrics {
  readonly instances: MetricInstance<Metric>[] = [];

  constructor(readonly namePrefix?: string) {
  }

  infoMetric<T extends TypedObject>(
    name: MetricName,
    help: string,
  ): InfoMetric<T> {
    return infoMetric(
      this.namePrefix ? `${this.namePrefix}${name}` : name,
      help,
    );
  }

  gaugeMetric<T extends TypedObject>(
    name: MetricName,
    help: string,
  ): GaugeMetric<T> {
    return gaugeMetric(
      this.namePrefix ? `${this.namePrefix}${name}` : name,
      help,
    );
  }

  record(instance: MetricInstance<Metric>): MetricInstance<Metric> {
    this.instances.push(instance);
    return instance;
  }

  merge(metrics: Metrics): Metrics {
    this.instances.push(...metrics.instances);
    return this;
  }
}
