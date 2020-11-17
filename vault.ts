import * as c from "https://deno.land/std@0.77.0/fmt/colors.ts";
import * as v from "https://denopkg.com/shah/ts-safety@v0.3.0/mod.ts";

export type VaultAttrName = string;
export type VaultAttrQualifiedName = string;

export interface VaultAttrOptions {
  readonly defaultValue?: unknown | VaultAttr;
  readonly isOptional?: boolean;
  readonly isSecret?: boolean;
}

export interface VaultNamespace {
  readonly commonNamespace: string;
  readonly secretsNamespace: string;
}

export const isVaultNamespace = v.typeGuard<VaultNamespace>(
  "commonNamespace",
  "secretsNamespace",
);

export interface VaultAttr extends VaultAttrOptions {
  readonly namespace?: VaultNamespace;
  readonly baseName: VaultAttrName;
  readonly qualifiedName: VaultAttrQualifiedName;
  readonly value: () => unknown;
  readonly valueFrom: (src: unknown | VaultAttr) => unknown;
}

export const isVaultAttr = v.typeGuard<VaultAttr>(
  "baseName",
  "qualifiedName",
  "value",
  "valueFrom",
);

export interface VaultTextAttr extends VaultAttr {
  readonly value: () => string | undefined;
  readonly valueFrom: (src: unknown | VaultAttr) => string | undefined;
  readonly textValue: () => string | undefined;
}

export const isVaultTextAttr = v.typeGuard<VaultTextAttr>(
  "baseName",
  "qualifiedName",
  "value",
  "valueFrom",
  "textValue",
);

export interface Vault {
  readonly namespace: VaultNamespace;
  readonly definedAttrs: () => Record<
    VaultAttrQualifiedName,
    VaultAttr
  >;
  readonly defineAttr: (attr: VaultAttr) => VaultAttr;
  readonly qualifiedName: (
    baseName: VaultAttrName,
    options?: VaultAttrOptions,
  ) => VaultAttrQualifiedName;
}

export class EnvironmentVariable implements VaultTextAttr {
  readonly namespace?: VaultNamespace;
  readonly qualifiedName: VaultAttrQualifiedName;

  constructor(
    vault: Vault,
    readonly baseName: VaultAttrName,
    readonly options?: VaultAttrOptions,
  ) {
    this.namespace = vault.namespace;
    this.qualifiedName = vault.qualifiedName(baseName, options);
  }

  value(): string | undefined {
    const value = Deno.env.get(this.qualifiedName);
    if (value) return value;
    return this.valueFrom(this.options?.defaultValue);
  }

  valueFrom(src: unknown | VaultAttr): string | undefined {
    if (isVaultTextAttr(src)) {
      return src.value();
    }
    if (isVaultAttr(src)) {
      return this.valueFrom(src.value());
    }
    if (typeof src === "string") return src;
    return JSON.stringify(src);
  }

  textValue() {
    return this.value() as string;
  }

  get defaulValue() {
    return this.options?.defaultValue;
  }

  get isOptional() {
    return this.options?.isOptional;
  }

  get isSecret() {
    return this.options?.isSecret;
  }
}

export class EnvironmentVault implements Vault {
  readonly #definedAttrs: Record<VaultAttrQualifiedName, VaultAttr> = {};

  constructor(
    readonly namespace: VaultNamespace,
    readonly options?: {
      onDuplicateDefn?: (
        newAttr: VaultAttr,
        existingAttr: VaultAttr,
      ) => VaultAttr;
    },
  ) {
  }

  prepareEnvVar(
    baseName: VaultAttrName,
    options?: VaultAttrOptions,
  ): VaultAttr {
    return new EnvironmentVariable(this, baseName, options);
  }

  defineEnvVar(
    baseName: VaultAttrName,
    options?: VaultAttrOptions,
  ): VaultAttr {
    return this.defineAttr(this.prepareEnvVar(baseName, options));
  }

  definedAttrs() {
    return this.#definedAttrs;
  }

  defineAttr(attr: VaultAttr) {
    const existing = this.#definedAttrs[attr.qualifiedName];
    if (existing) {
      if (this.options?.onDuplicateDefn) {
        return this.options.onDuplicateDefn(attr, existing);
      }
      return existing;
    }
    this.#definedAttrs[attr.qualifiedName] = attr;
    return attr;
  }

  qualifiedName(
    baseName: VaultAttrName,
    options?: VaultAttrOptions,
  ) {
    const qName = options?.isSecret
      ? `${this.namespace.secretsNamespace}${baseName}`
      : `${this.namespace.commonNamespace}${baseName}`;
    return qName;
  }

  reportDefinedAttrs(): void {
    console.error(
      "Unable to proceed without valid authentication. Please be sure the following environment variables are set:",
    );
    const envVars = this.definedAttrs();
    for (const envVar of Object.values(envVars)) {
      const evValue = envVar.value();
      console.log(
        `${
          evValue
            ? (envVar.isSecret
              ? c.brightGreen(envVar.qualifiedName)
              : c.green(envVar.qualifiedName))
            : (envVar.isSecret
              ? c.brightRed(envVar.qualifiedName)
              : c.red(envVar.qualifiedName))
        }${evValue ? "=" + c.yellow(evValue as string) : ""}`,
      );
    }
  }
}
