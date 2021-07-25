import * as ta from "https://deno.land/std@0.102.0/testing/asserts.ts";
import * as mod from "./vault.ts";

Deno.test("env var with default", () => {
  const envVars = new mod.EnvironmentVault(
    { commonNamespace: "PREFIX_", secretsNamespace: "PREFIX_SECRET_" },
  );
  const serverHost = envVars.defineEnvVar(
    "SERVER_HOST",
    { defaultValue: "test.domain.com" },
  );
  ta.assert(serverHost.baseName, "SERVER_HOST");
  ta.assert(serverHost.qualifiedName, "PREFIX_SERVER_HOST");
  ta.assertStrictEquals(serverHost.value(), "test.domain.com");

  Deno.env.set("PREFIX_SERVER_HOST", "updated.domain.com");
  ta.assert(serverHost.value(), "updated.domain.com");
});

Deno.test("env var undefined without default", () => {
  let encounteredUndefinedAttr: mod.VaultAttr | undefined;
  const envVars = new mod.EnvironmentVault(
    { commonNamespace: "PREFIX_", secretsNamespace: "PREFIX_SECRET_" },
    {
      onUndefined: (attr: mod.VaultAttr) => {
        encounteredUndefinedAttr = attr;
      },
    },
  );
  const serverUser = envVars.defineEnvVar("SERVER_USER");
  ta.assert(serverUser.baseName, "SERVER_USER");
  ta.assert(serverUser.qualifiedName, "PREFIX_SERVER_USER");
  ta.assertStrictEquals(serverUser.value(), undefined);
  ta.assertStrictEquals(serverUser, encounteredUndefinedAttr);

  Deno.env.set("PREFIX_SERVER_USER", "shah");
  ta.assert(serverUser.value(), "shah");
});

Deno.test("env var undefined secret without default", () => {
  let encounteredDuplicateAttr: mod.VaultAttr | undefined;
  const envVars = new mod.EnvironmentVault(
    { commonNamespace: "PREFIX_", secretsNamespace: "PREFIX_SECRET_" },
    {
      onDuplicateDefn: (
        newAttr: mod.VaultAttr,
        existingAttr: mod.VaultAttr,
      ): mod.VaultAttr => {
        encounteredDuplicateAttr = existingAttr;
        return existingAttr;
      },
    },
  );
  const serverPassword = envVars.defineEnvVar(
    "SERVER_PASSWD",
    { isSecret: true },
  );
  ta.assert(serverPassword.baseName, "SERVER_PASSWD");
  ta.assert(serverPassword.qualifiedName, "PREFIX_SECRET_SERVER_PASSWD");
  ta.assertStrictEquals(serverPassword.value(), undefined);

  Deno.env.set("PREFIX_SECRET_SERVER_PASSWD", "*****");
  ta.assert(serverPassword.value(), "*****");

  // try to define it twice to see if we catch it
  envVars.defineEnvVar("SERVER_PASSWD", { isSecret: true });
  ta.assertStrictEquals(serverPassword, encounteredDuplicateAttr);
});
