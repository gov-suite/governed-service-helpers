import * as ta from "https://deno.land/std@0.102.0/testing/asserts.ts";
import * as expected from "./import_test-module-valid.ts";
import * as mod from "./import.ts";

Deno.test("erroneous import of unchecked import_test-module-valid.ts", async () => {
  let reportedDiag: string | undefined;
  let importErrorEncountered: Error | undefined;
  let moduleUrlEncountered: string | undefined;
  const e = await mod.importModuleDefault<expected.Expected>(
    "import_test-module-valid.ts",
    {
      onImportError: (err: Error, moduleUrl: string): string | undefined => {
        importErrorEncountered = err;
        moduleUrlEncountered = moduleUrl;
        return undefined;
      },
      reportDiagnostic: (diagnostic: string): void => {
        reportedDiag = diagnostic;
      },
    },
  );
  ta.assert(e === undefined);
  ta.assert(importErrorEncountered);
  ta.assert(moduleUrlEncountered);
  ta.assert(reportedDiag);
  ta.assertStringIncludes(
    reportedDiag,
    `Unable to import module import_test-module-valid.ts: TypeError: Relative import path "import_test-module-valid.ts" not prefixed with / or ./ or ../`,
  );
});

Deno.test("valid import of unchecked import_test-module-valid.ts", async () => {
  const e = await mod.importModuleDefault<expected.Expected>(
    "./import_test-module-valid.ts",
  );
  ta.assert(e);
});

Deno.test("valid import of guarded import_test-module-valid.ts", async () => {
  let isGuarded = false;
  const e = await mod.importModuleDefault<expected.Expected>(
    "./import_test-module-valid.ts",
    {
      typeGuard: expected.isExpected,
      onSuccessfulImport: (
        instance: expected.Expected,
        guarded: boolean,
      ): expected.Expected => {
        isGuarded = guarded;
        return instance;
      },
    },
  );
  ta.assert(e);
  ta.assert(isGuarded);
});

Deno.test("invalid import of missing default: import_test-module-no-default.ts", async () => {
  let reportedDiag: string | undefined;
  let noModuleDefaultEncountered = false;
  const e = await mod.importModuleDefault<expected.Expected>(
    "./import_test-module-no-default.ts",
    {
      typeGuard: expected.isExpected,
      onNoModuleDefault: (): string | undefined => {
        noModuleDefaultEncountered = true;
        return undefined;
      },
      reportDiagnostic: (diagnostic: string): void => {
        reportedDiag = diagnostic;
      },
    },
  );
  ta.assert(typeof e === "undefined");
  ta.assert(noModuleDefaultEncountered);
  ta.assertEquals(
    reportedDiag,
    `No module.default found in ./import_test-module-no-default.ts`,
  );
});

Deno.test("invalid import of guard failure: import_test-module-invalid-type.ts", async () => {
  let reportedDiag: string | undefined;
  let guardFailureEncountered = false;
  const e = await mod.importModuleDefault<expected.Expected>(
    "./import_test-module-invalid-type.ts",
    {
      typeGuard: expected.isExpected,
      onGuardFailure: (): string | undefined => {
        guardFailureEncountered = true;
        return undefined;
      },
      reportDiagnostic: (diagnostic: string): void => {
        reportedDiag = diagnostic;
      },
    },
  );
  ta.assert(typeof e === "undefined");
  ta.assert(guardFailureEncountered);
  ta.assertEquals(
    reportedDiag,
    `module.default did not pass type guard: ./import_test-module-invalid-type.ts`,
  );
});
