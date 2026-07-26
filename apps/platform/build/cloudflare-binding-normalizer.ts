type Binding = {
  binding: string;
};

type D1Binding = Binding & {
  database_id?: string;
  database_name?: string;
  migrations_dir?: string;
};

type R2Binding = Binding & {
  bucket_name?: string;
};

export type CloudflareBindingConfig = {
  d1_databases?: D1Binding[];
  r2_buckets?: R2Binding[];
  vars?: Record<string, unknown>;
};

export type SitesPrimaryBindings = {
  d1Binding?: string;
  r2Binding?: string;
  databaseId: string;
  databaseName: string;
  bucketName: string;
};

function replaceByBinding<T extends Binding>(
  bindings: readonly T[] | undefined,
  replacement: T | undefined,
): T[] {
  const seen = new Set<string>();
  for (const candidate of bindings ?? []) {
    if (seen.has(candidate.binding)) {
      throw new Error(
        `Duplicate Cloudflare binding "${candidate.binding}" in resolved configuration.`,
      );
    }
    seen.add(candidate.binding);
  }

  if (!replacement) {
    return [...(bindings ?? [])];
  }

  return [
    replacement,
    ...(bindings ?? []).filter(
      (candidate) => candidate.binding !== replacement.binding,
    ),
  ];
}

/**
 * The Cloudflare Vite plugin concatenates arrays supplied through its `config`
 * option. Mutating the already-resolved config lets Sites replace only its
 * primary DB/R2 bindings while retaining environment-specific resources.
 */
export function normalizeSitesPrimaryBindings(
  config: CloudflareBindingConfig,
  sites: SitesPrimaryBindings,
  localVars: Record<string, string>,
): void {
  config.d1_databases = replaceByBinding(
    config.d1_databases,
    sites.d1Binding
      ? {
          binding: sites.d1Binding,
          database_name: sites.databaseName,
          database_id: sites.databaseId,
          migrations_dir: "./drizzle",
        }
      : undefined,
  );
  config.r2_buckets = replaceByBinding(
    config.r2_buckets,
    sites.r2Binding
      ? {
          binding: sites.r2Binding,
          bucket_name: sites.bucketName,
        }
      : undefined,
  );
  config.vars = {
    ...(config.vars ?? {}),
    ...localVars,
  };
}
