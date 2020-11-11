import { testingAsserts as ta } from "./deps-test.ts";
import * as mod from "./mod.ts";

Deno.test("remote version without repoIdentity detector", async () => {
  const version = await mod.determineVersionFromRepoTag(
    "https://raw.githubusercontent.com/gov-suite/governed-text-template/v0.4.1/toctl.ts",
  );
  ta.assertEquals(version, "v0.4.1");
});

Deno.test("remote version with repoIdentity detector", async () => {
  const version = await mod.determineVersionFromRepoTag(
    "https://raw.githubusercontent.com/gov-suite/governed-text-template/v0.4.1/toctl.ts",
    { repoIdentity: "gov-suite/governed-text-template" },
  );
  ta.assertEquals(version, "v0.4.1");
});

Deno.test("local version detector", async () => {
  const version = await mod.determineVersionFromRepoTag(
    "file:///home/snshah/workspaces/github.com/gov-suite/governed-text-template/toctl.ts",
  );
  ta.assertStringIncludes(version, "-local");
});
