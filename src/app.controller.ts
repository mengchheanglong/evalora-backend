import { Controller, Get } from "@nestjs/common";
import { getSafeRuntimeConfig } from "./config/runtime.config";

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: "Evalora API",
      status: "ok",
      version: "0.1.0",
      runtime: this.getRuntimeSummary(),
      docs: "See docs/API-CONTRACT.md",
    };
  }

  @Get("health")
  getHealth() {
    return {
      status: "ok",
      runtime: this.getRuntimeSummary(),
      timestamp: new Date().toISOString(),
    };
  }

  private getRuntimeSummary() {
    const config = getSafeRuntimeConfig();

    return {
      aiProvider: config.ai.provider,
      aiModel: config.ai.model,
      aiApiKeyConfigured: config.ai.hasApiKey,
      databaseProvider: config.database.provider,
      databaseConfigured: !["not_configured", "invalid"].includes(config.database.host),
      databaseSslRequired: config.database.sslRequired,
    };
  }
}
