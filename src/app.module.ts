import { Module } from "@nestjs/common";
import { AnalyticsController } from "./modules/analytics/analytics.controller";
import { AppController } from "./app.controller";
import { AiController } from "./modules/ai/ai.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { CodeController } from "./modules/code/code.controller";
import { ReportsController } from "./modules/reports/reports.controller";
import { ResponsesController } from "./modules/responses/responses.controller";
import { SessionsController } from "./modules/sessions/sessions.controller";
import { TemplatesController } from "./modules/templates/templates.controller";

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    TemplatesController,
    SessionsController,
    ResponsesController,
    AiController,
    CodeController,
    ReportsController,
    AnalyticsController,
  ],
})
export class AppModule {}
