import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getAiProviderConfig, getDatabaseConfig, getSafeRuntimeConfig } from "../src/config/runtime.config";

test("getAiProviderConfig defaults Evalora to DeepSeek V4 Flash", () => {
  const config = getAiProviderConfig({});

  assert.equal(config.provider, "deepseek");
  assert.equal(config.model, "deepseek-v4-flash");
  assert.equal(config.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(config.hasApiKey, false);
});

test("getDatabaseConfig recognizes Neon Postgres URLs and redacts secrets", () => {
  const config = getDatabaseConfig({
    DATABASE_URL: "postgresql://evalora_owner:secret-password@ep-demo.neon.tech/evalora?sslmode=require",
  });

  assert.equal(config.provider, "neon-postgres");
  assert.equal(config.host, "ep-demo.neon.tech");
  assert.equal(config.sslRequired, true);
  assert.equal(config.redactedUrl, "postgresql://evalora_owner:***@ep-demo.neon.tech/evalora?sslmode=require");
});

test("getSafeRuntimeConfig exposes no API keys or database passwords", () => {
  const config = getSafeRuntimeConfig({
    DEEPSEEK_API_KEY: "sk-real-secret",
    DATABASE_URL: "postgresql://evalora_owner:secret-password@ep-demo.neon.tech/evalora?sslmode=require",
  });

  assert.equal(config.ai.hasApiKey, true);
  assert.equal(JSON.stringify(config).includes("sk-real-secret"), false);
  assert.equal(JSON.stringify(config).includes("secret-password"), false);
  assert.equal(config.database.redactedUrl.includes("***"), true);
});
