import * as path from "https://deno.land/std@0.108.0/path/mod.ts";
import * as fst from "./fs-tree.ts";
import * as gsm from "./metrics.ts";

export interface TransactionIdSupplier {
  readonly txID: string;
  readonly txHost: string;
}

export interface AssetsObservabilityArguments
  extends Partial<TransactionIdSupplier> {
  readonly assetsTree: fst.FileSysAssetsTree;
  readonly metrics: gsm.TypicalMetrics;
}

export interface AssetsMetricsResult {
  readonly assetsTree: fst.FileSysAssetsTree;
  readonly metrics: gsm.Metrics;
  readonly pathExtnsColumnHeaders: [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  readonly pathExtnsColumns: [
    scopeID: string,
    date: string,
    time: string,
    path: string,
    extn: string,
    count: number,
    totalBytes: number,
    txID?: string,
    host?: string,
  ][];
}

export interface AssetExtensionSupplier {
  readonly extension: string;
}

export interface AssetPathSupplier {
  readonly path: string;
}

export interface DateSupplier {
  readonly date: Date;
}

export async function fileSysAnalytics(
  aapo: AssetsObservabilityArguments,
): Promise<AssetsMetricsResult> {
  const countByPathGauge = aapo.metrics.gaugeMetric<
    & AssetExtensionSupplier
    & AssetPathSupplier
    & Partial<TransactionIdSupplier>
    & DateSupplier
  >(
    "asset_name_extension_in_path",
    "Count of asset name extensions encountered in path",
  );
  const totalBytesByPathGauge = aapo.metrics.gaugeMetric<
    & AssetExtensionSupplier
    & AssetPathSupplier
    & Partial<TransactionIdSupplier>
    & DateSupplier
  >(
    "asset_name_extension_bytes_in_path",
    "Total bytes of asset name extensions encountered in path",
  );

  const result: AssetsMetricsResult = {
    assetsTree: aapo.assetsTree,
    metrics: aapo.metrics,
    pathExtnsColumnHeaders: [
      "Scope",
      "Date",
      "Time",
      "Files Path",
      "File Extension in Path",
      "Count of Files with Extension in Path",
      "Total Bytes in all Files with Extension in Path",
      "Build ID",
      "Host",
    ],
    pathExtnsColumns: [],
  };

  const now = new Date();
  for (const walkerNode of aapo.assetsTree.assets) {
    for (const subdir of walkerNode.subdirectories()) {
      const extnAnalytics = new Map<
        string,
        { extension: string; count: number; totalBytes: number }
      >();

      for (const file of subdir.files()) {
        const extension = path.extname(file.terminal.name);
        let analytics = extnAnalytics.get(extension);
        if (!analytics) {
          analytics = { count: 0, totalBytes: 0, extension };
          extnAnalytics.set(extension, analytics);
        }

        const fileInfo = await file.fileInfo();
        analytics.count++;
        analytics.totalBytes += fileInfo.size;
      }

      for (const analytics of extnAnalytics.values()) {
        const labels = {
          txHost: aapo.txHost,
          txID: aapo.txID,
          date: now,
          extension: analytics.extension,
          path: subdir.qualifiedPath,
        };
        aapo.metrics.record(
          countByPathGauge.instance(analytics.count, labels),
        );
        aapo.metrics.record(
          totalBytesByPathGauge.instance(analytics.totalBytes, labels),
        );
        result.pathExtnsColumns.push([
          walkerNode.walker.identity,
          labels.date.toLocaleDateString("en-US"),
          labels.date.toLocaleTimeString("en-US"),
          labels.path,
          labels.extension,
          analytics.count,
          analytics.totalBytes,
          labels.txID,
          labels.txHost,
        ]);
      }
    }
  }
  return result;
}

/**
 * jsonMetricsReplacer is used for text transformation using something like:
 *
 *     JSON.stringify(metrics, jsonMetricsReplacer, "  ")
 *
 * Without jsonMetricsReplacer each metric looks like this:
 * {
 *    "metric": {
 *      "name": "asset_name_extension",
 *      "help": "Count of asset name extension encountered"
 *    },
 *    "labels": {
 *      "object": { // we do not want "object", just the labels
 *        "assetExtn": ".txt"
 *      }
 *    },
 *    // value will be missing because it's a function and JSON won't emit
 * }
 *
 * With jsonMetricsReplacer it will look much nicer, like this:
 * {
 *    "metric": "asset_name_extension",
 *    "labels": {
 *      "assetExtn": ".txt"
 *    },
 *    "value": 6
 * }
 */
export const jsonMetricsReplacer = (key: string, value: unknown) => {
  if (key == "value" && typeof value === "function") return value();
  if (key == "metric") {
    return (value as gsm.Metric).name;
  }
  if (value && typeof value === "object") {
    if ("object" in value) {
      // deno-lint-ignore no-explicit-any
      return (value as any).object;
    }
    if ("instances" in value) {
      const metricsDefnMap = new Map<string, gsm.Metric>();
      // deno-lint-ignore no-explicit-any
      const instances = ((value as any).instances) as gsm.MetricInstance<
        gsm.Metric
      >[];
      for (const instance of instances) {
        const found = metricsDefnMap.get(instance.metric.name);
        if (!found) {
          metricsDefnMap.set(instance.metric.name, instance.metric);
        }
      }
      return {
        instances,
        metrics: Array.from(metricsDefnMap.values()),
      };
    }
  }
  return value;
};
