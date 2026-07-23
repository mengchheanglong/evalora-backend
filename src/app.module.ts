import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AnalyticsController } from "./modules/analytics/analytics.controller";
import { AnalyticsService } from "./modules/analytics/analytics.service";
import { AppController } from "./app.controller";
import { AiController, CandidateAiController } from "./modules/ai/ai.controller";
import { AiService } from "./modules/ai/ai.service";
import { CandidateAiService } from "./modules/ai/candidate-ai.service";
import { createDeepSeekProviderFromEnv } from "./modules/ai/deepseek.provider";
import { AuthController } from "./modules/auth/auth.controller";
import { JwtAuthGuard, RolesGuard } from "./modules/auth/auth.guard";
import { AuthRateLimitGuard } from "./modules/auth/auth-rate-limit.guard";
import { AuthService, PrismaAuthRepository } from "./modules/auth/auth.service";
import { CodeModule } from "./modules/code/code.module";
import { ReportsController } from "./modules/reports/reports.controller";
import { ReportsService } from "./modules/reports/reports.service";
import { CandidateResponsesAccessController, ResponsesController } from "./modules/responses/responses.controller";
import { ResponsesService } from "./modules/responses/responses.service";
import { CandidateSessionAccessController, SessionsController } from "./modules/sessions/sessions.controller";
import { SessionsService } from "./modules/sessions/sessions.service";
import { CandidateAccessRateLimitGuard } from "./modules/sessions/access-rate-limit.guard";
import { TemplatesController } from "./modules/templates/templates.controller";
import { TemplatesService } from "./modules/templates/templates.service";
import { OrganizationController } from "./modules/organization/organization.controller";
import { OrganizationService } from "./modules/organization/organization.service";
import { createEmailServiceFromEnv, EmailService } from "./modules/email/email.service";
import { PrismaService } from "./prisma/prisma.service";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CodeModule],
  controllers: [
    AppController,
    AuthController,
    OrganizationController,
    TemplatesController,
    SessionsController,
    CandidateSessionAccessController,
    ResponsesController,
    CandidateResponsesAccessController,
    AiController,
    CandidateAiController,
    ReportsController,
    AnalyticsController,
  ],
  providers: [
    AnalyticsService,
    AuthRateLimitGuard,
    CandidateAccessRateLimitGuard,
    CandidateAiService,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: AiService,
      useFactory: () => new AiService(createDeepSeekProviderFromEnv()),
    },
    {
      provide: EmailService,
      useFactory: () => createEmailServiceFromEnv(),
    },
    {
      provide: AuthService,
      useFactory: (prisma: PrismaService, email: EmailService) =>
        new AuthService(new PrismaAuthRepository(prisma), undefined, undefined, email),
      inject: [PrismaService, EmailService],
    },
    {
      provide: OrganizationService,
      useFactory: (prisma: PrismaService, email: EmailService) => new OrganizationService(prisma, email),
      inject: [PrismaService, EmailService],
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
      useFactory: (prisma: PrismaService, email: EmailService) => new SessionsService(prisma, { emailService: email }),
      inject: [PrismaService, EmailService],
    },
    {
      provide: ResponsesService,
      useFactory: (prisma: PrismaService) => new ResponsesService(prisma),
      inject: [PrismaService],
    },
  ],
})
export class AppModule {}
