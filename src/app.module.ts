import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AnalyticsController } from "./modules/analytics/analytics.controller";
import { AppController } from "./app.controller";
import { AiController } from "./modules/ai/ai.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { CodeModule } from "./modules/code/code.module";
import { ReportsController } from "./modules/reports/reports.controller";
import { ResponsesController } from "./modules/responses/responses.controller";
import { SessionsController } from "./modules/sessions/sessions.controller";
import { TemplatesController } from "./modules/templates/templates.controller";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CodeModule],
  controllers: [
    AppController,
    AuthController,
    TemplatesController,
    SessionsController,
    ResponsesController,
    AiController,
    ReportsController,
    AnalyticsController,
  ],
})
export class AppModule {}
