import * as fs from "https://deno.land/std@0.77.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.77.0/path/mod.ts";
import * as shell from "https://denopkg.com/shah/tsd-shell@v0.9.1/mod.ts";

export interface ModuleVersionSupplier<O> {
  (importMetaURL: URL | string, options?: O): Promise<string>;
}

export interface DetermineVersionFromRepoTagOptions {
  readonly repoIdentity?: string;
  readonly onInvalidLocalVersion?: (
    execResult: shell.RunShellCommandExecResult,
  ) => string;
  readonly onInvalidRemoteMatch?: (repoVersionRegExp: RegExp) => string;
}

export async function determineVersionFromRepoTag(
  importMetaURL: URL | string,
  options?: DetermineVersionFromRepoTagOptions,
): Promise<string> {
  // if we're running locally, see if Git tag can be discovered
  const url = importMetaURL instanceof URL
    ? importMetaURL
    : new URL(importMetaURL);
  if (url.protocol == "file:") {
    if (fs.existsSync(path.fromFileUrl(importMetaURL))) {
      let version = "v0.0.0";
      await shell.runShellCommand(
        "git describe --tags --abbrev=0",
        {
          onCmdComplete: (execResult) => {
            if (execResult.code == 0) {
              version = new TextDecoder().decode(execResult.stdOut).trim();
            } else {
              if (options?.onInvalidLocalVersion) {
                version = options.onInvalidLocalVersion(execResult);
              } else {
                version = `v?.?.${execResult.code}`;
              }
            }
          },
        },
      );
      return `${version}-local`;
    }
  }

  // if we're running remote, get the version from the URL in the format
  // *repoIdentity/vX.Y.Z/* or */vX.Y.Z/* if repoIdentity not supplied
  const repoVersionRegExp = options?.repoIdentity
    ? new RegExp(
      `${options.repoIdentity}/v?(?<version>\\d+\\.\\d+\\.\\d+)/`,
    )
    : /\/v?(?<version>\d+\.\d+\.\d+)\//;
  const matched = url.href.match(repoVersionRegExp);
  if (matched) {
    return `v${matched.groups!["version"]}`;
  }
  if (options?.onInvalidRemoteMatch) {
    return options.onInvalidRemoteMatch(repoVersionRegExp);
  }
  return `v0.0.0-remote(no match for ${repoVersionRegExp} in '${url}')`;
}
