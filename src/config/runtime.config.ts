export interface RuntimeEnv {
  AI_PROVIDER?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
  DATABASE_URL?: string;
}

export interface AiProviderConfig {
  provider: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
}

export interface DatabaseConfig {
  provider: "neon-postgres" | "postgresql";
  host: string;
  sslRequired: boolean;
  redactedUrl: string;
}

export interface SafeRuntimeConfig {
  ai: AiProviderConfig;
  database: DatabaseConfig;
}

const DEFAULT_AI_PROVIDER = "deepseek";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const NOT_CONFIGURED = "not_configured";

export function getAiProviderConfig(env: RuntimeEnv = process.env): AiProviderConfig {
  return {
    provider: valueOrDefault(env.AI_PROVIDER, DEFAULT_AI_PROVIDER),
    model: valueOrDefault(env.DEEPSEEK_MODEL, DEFAULT_DEEPSEEK_MODEL),
    baseUrl: trimTrailingSlash(valueOrDefault(env.DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_BASE_URL)),
    hasApiKey: Boolean(env.DEEPSEEK_API_KEY?.trim()),
  };
}

export function getDatabaseConfig(env: RuntimeEnv = process.env): DatabaseConfig {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return {
      provider: "neon-postgres",
      host: NOT_CONFIGURED,
      sslRequired: true,
      redactedUrl: NOT_CONFIGURED,
    };
  }

  const parsed = parseDatabaseUrl(databaseUrl);
  const isNeon = parsed.host.endsWith(".neon.tech") || parsed.host.includes(".neon.tech:");

  return {
    provider: isNeon ? "neon-postgres" : "postgresql",
    host: parsed.host,
    sslRequired: isNeon || parsed.sslMode === "require",
    redactedUrl: parsed.redactedUrl,
  };
}

export function getSafeRuntimeConfig(env: RuntimeEnv = process.env): SafeRuntimeConfig {
  return {
    ai: getAiProviderConfig(env),
    database: getDatabaseConfig(env),
  };
}

function parseDatabaseUrl(databaseUrl: string): { host: string; sslMode?: string; redactedUrl: string } {
  try {
    const parsed = new URL(databaseUrl);
    const redacted = new URL(databaseUrl);

    if (redacted.password) redacted.password = "***";

    return {
      host: parsed.host,
      sslMode: parsed.searchParams.get("sslmode") ?? undefined,
      redactedUrl: redacted.toString(),
    };
  } catch {
    return {
      host: "invalid",
      redactedUrl: "invalid_database_url",
    };
  }
}

function valueOrDefault(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
