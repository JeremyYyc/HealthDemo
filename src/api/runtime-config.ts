type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

function vercelOrigin(hostname: string | undefined): string | undefined {
  return hostname ? `https://${hostname}` : undefined;
}

export function resolveAppBaseUrl(environment: RuntimeEnvironment = process.env): string {
  if (environment.APP_BASE_URL) return environment.APP_BASE_URL;

  if (environment.VERCEL_ENV === "production") {
    const productionOrigin = vercelOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL);
    if (productionOrigin) return productionOrigin;
  }

  return (
    vercelOrigin(environment.VERCEL_BRANCH_URL) ??
    vercelOrigin(environment.VERCEL_URL) ??
    "http://localhost:3000"
  );
}

export function resolveAppVersion(environment: RuntimeEnvironment = process.env): string {
  return (
    environment.APP_VERSION ??
    environment.VERCEL_GIT_COMMIT_SHA ??
    environment.npm_package_version ??
    "unknown"
  );
}
