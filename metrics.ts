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
  readonly stringify: () => string;
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
        if (
          typeof entry[1] === "undefined" && options.skipUndefinedLabels
        ) {
          continue;
        }
        kvPairs.push(`${entry[0]}=${JSON.stringify(entry[1])}`);
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
    values: T | MetricLabels<T>,
  ) => LabeledMetricInstance<Metric, T>;
}

export function infoMetric<T extends TypedObject>(
  name: MetricName,
  help: string,
): InfoMetric<T> {
  const metric: InfoMetric<T> = {
    name: `${name}_info`,
    help,
    instance: (values) => {
      const instanceLabels = isMetricLabels<T>(values)
        ? values
        : openMetricsLabels(values);
      const instance: LabeledMetricInstance<Metric, T> = {
        metric,
        labels: instanceLabels,
        stringify: (options: MetricsDialect): string => {
          return `${instance.metric.name}{${instanceLabels.stringify()}} 1`;
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
  readonly infoMetric: <T extends TypedObject>(
    name: MetricName,
    help: string,
  ) => InfoMetric<T>;
}

export interface MetricsDialect {
  readonly dialect: "open-metrics" | "prometheus";
}

export function prometheusDialect(): MetricsDialect {
  return {
    dialect: "prometheus",
  };
}

export class TypicalMetrics implements Metrics {
  readonly instances: MetricInstance<Metric>[] = [];

  constructor(readonly namePrefix?: string) {
  }

  export(dialect: MetricsDialect): string[] {
    const encounteredMetrics = new Map<MetricLabelName, boolean>();
    const result: string[] = [];
    for (const instance of this.instances) {
      const encountered = encounteredMetrics.get(instance.metric.name);
      if (!encountered) {
        instance.metric.declare(result, dialect);
        encounteredMetrics.set(instance.metric.name, true);
      }
      result.push(instance.stringify(dialect));
    }
    return result;
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

  record(instance: MetricInstance<Metric>): void {
    this.instances.push(instance);
  }

  async persist(
    fileName: string,
    dialect: MetricsDialect & { readonly append: boolean },
  ): Promise<void> {
    await Deno.writeTextFile(fileName, this.export(dialect).join("\n"), {
      append: dialect.append,
    });
  }

  persistSync(
    fileName: string,
    dialect: MetricsDialect & { readonly append: boolean },
  ): void {
    Deno.writeTextFileSync(fileName, this.export(dialect).join("\n"), {
      append: dialect.append,
    });
  }
}
