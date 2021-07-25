import * as safety from "https://denopkg.com/shah/ts-safety@v1.0.0/mod.ts";

export interface ImportModuleOptions<T> {
  onSuccessfulImport?: (
    instance: T,
    guarded: boolean,
    module: unknown,
    moduleUrl: string,
  ) => T;
  typeGuard?: safety.TypeGuard<T>;
  onImportError?: (err: Error, moduleUrl: string) => string | undefined;
  onGuardFailure?: (moduleUrl: string) => string | undefined;
  onNoModuleDefault?: (moduleUrl: string) => string | undefined;
  reportDiagnostic?: (diagnostic: string) => void;
}

/**
 * Use Deno import(moduleUrl) to load a module and return the "default"
 * instance (module.default). The "default instance" can be any type of
 * variable and may be optionally type-guarded to ensure type safety.
 * @param moduleUrl is the TypeScript module to import
 * @param options Provides some useful event handlers for type checking
 */

export async function importModuleDefault<T>(
  moduleUrl: string,
  options?: ImportModuleOptions<T>,
): Promise<T | undefined> {
  const reportDiag = options?.reportDiagnostic
    ? options?.reportDiagnostic
    : ((diag: string): void => {
      console.error(diag);
    });
  try {
    const module = await import(moduleUrl);
    if (module.default) {
      const instance = module.default;
      if (options?.typeGuard) {
        if (options.typeGuard(instance)) {
          if (options.onSuccessfulImport) {
            return options.onSuccessfulImport(
              instance,
              true,
              module,
              moduleUrl,
            );
          } else {
            return instance;
          }
        } else {
          if (options?.onGuardFailure) {
            const diagnostic = options.onGuardFailure(moduleUrl);
            if (diagnostic) {
              reportDiag(diagnostic);
              return undefined;
            }
          }
          reportDiag(
            `module.default did not pass type guard: ${moduleUrl}`,
          );
          return undefined;
        }
      } else {
        if (options?.onSuccessfulImport) {
          return options.onSuccessfulImport(instance, false, module, moduleUrl);
        } else {
          return instance;
        }
      }
    } else {
      if (options?.onNoModuleDefault) {
        const diagnostic = options.onNoModuleDefault(moduleUrl);
        if (diagnostic) {
          reportDiag(diagnostic);
          return undefined;
        }
      }
      reportDiag(`No module.default found in ${moduleUrl}`);
      return undefined;
    }
  } catch (err) {
    if (options?.onImportError) {
      const diagnostic = options.onImportError(err, moduleUrl);
      if (diagnostic) {
        reportDiag(diagnostic);
        return undefined;
      }
    }
    reportDiag(
      `Unable to import module ${moduleUrl}: ${err}`,
    );
  }
}
