import { Module } from "@nestjs/common";
import { AnalyticsController } from "./modules/analytics/analytics.controller";
import { AppController } from "./app.controller";
import { AiController } from "./modules/ai/ai.controller";
import { AiService } from "./modules/ai/ai.service";
import { createDeepSeekProviderFromEnv } from "./modules/ai/deepseek.provider";
import { AuthController } from "./modules/auth/auth.controller";
import { JwtAuthGuard, RolesGuard } from "./modules/auth/auth.guard";
import { AuthService, PrismaAuthRepository } from "./modules/auth/auth.service";
import { CodeController } from "./modules/code/code.controller";
import { ReportsController } from "./modules/reports/reports.controller";
import { ReportsService } from "./modules/reports/reports.service";
import { CandidateResponsesAccessController, ResponsesController } from "./modules/responses/responses.controller";
import { ResponsesService } from "./modules/responses/responses.service";
import { CandidateSessionAccessController, SessionsController } from "./modules/sessions/sessions.controller";
import { SessionsService } from "./modules/sessions/sessions.service";
import { TemplatesController } from "./modules/templates/templates.controller";
import { TemplatesService } from "./modules/templates/templates.service";
import { PrismaService } from "./prisma/prisma.service";

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    TemplatesController,
    SessionsController,
    CandidateSessionAccessController,
    ResponsesController,
    CandidateResponsesAccessController,
    AiController,
    CodeController,
    ReportsController,
    AnalyticsController,
  ],
  providers: [
    PrismaService,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: AiService,
      useFactory: () => new AiService(createDeepSeekProviderFromEnv()),
    },
    {
      provide: AuthService,
      useFactory: (prisma: PrismaService) => new AuthService(new PrismaAuthRepository(prisma)),
      inject: [PrismaService],
    },
    {
      provide: ReportsService,
      useFactory: (prisma: PrismaService, aiService: AiService) => new ReportsService(prisma, aiService),
      inject: [PrismaService, AiService],
    },
    {
      provide: TemplatesService,
      useFactory: (prisma: PrismaService) => new TemplatesService(prisma),
      inject: [PrismaService],
    },
    {
      provide: SessionsService,
      useFactory: (prisma: PrismaService) => new SessionsService(prisma),
      inject: [PrismaService],
    },
    {
      provide: ResponsesService,
      useFactory: (prisma: PrismaService) => new ResponsesService(prisma),
      inject: [PrismaService],
    },
  ],
})
export class AppModule {}
