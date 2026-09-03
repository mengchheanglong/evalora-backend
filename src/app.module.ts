import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RequestValidationMiddleware } from "./common/middleware/request-validation.middleware";
import { GlobalRateLimitMiddleware } from "./common/rate-limiting";
import { AnalyticsController } from "./modules/analytics/analytics.controller";
import { AnalyticsService } from "./modules/analytics/analytics.service";
import { SystemHealthService } from "./modules/analytics/system-health.service";
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
import {
  CandidateInterviewerFollowUpsController,
  InterviewerFollowUpsController,
} from "./modules/interviewer-follow-ups/interviewer-follow-ups.controller";
import { InterviewerFollowUpsService } from "./modules/interviewer-follow-ups/interviewer-follow-ups.service";
import { InterviewGateway } from "./modules/realtime/interview.gateway";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { ReportsController } from "./modules/reports/reports.controller";
import { ReportsService } from "./modules/reports/reports.service";
import { CandidateResponsesAccessController, ResponsesController } from "./modules/responses/responses.controller";
import { ResponsesService } from "./modules/responses/responses.service";
import { CandidateSessionAccessController, SessionsController } from "./modules/sessions/sessions.controller";
import { SessionsService } from "./modules/sessions/sessions.service";
import { CandidateAccessRateLimitGuard } from "./modules/sessions/access-rate-limit.guard";
import { TemplatesController } from "./modules/templates/templates.controller";
import { TemplatesService } from "./modules/templates/templates.service";
import { DocumentExtractionService } from "./modules/templates/drafts/document-extraction.service";
import { DraftChatRateLimitGuard, DraftRateLimitGuard } from "./modules/templates/drafts/draft-rate-limit.guard";
import { TemplateDraftsController } from "./modules/templates/drafts/template-drafts.controller";
import { TemplateDraftsService } from "./modules/templates/drafts/template-drafts.service";
import { TranscriptController } from "./modules/transcript/transcript.controller";
import { TranscriptService } from "./modules/transcript/transcript.service";
import { OrganizationController } from "./modules/organization/organization.controller";
import { OrganizationService } from "./modules/organization/organization.service";
import { createEmailServiceFromEnv, EmailService } from "./modules/email/email.service";
import { PrismaService } from "./prisma/prisma.service";
import { PrismaModule } from "./prisma/prisma.module";
import { LiveKitService } from "./modules/livekit/livekit.service";


@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, RealtimeModule, CodeModule],
  controllers: [
    AppController,
    AuthController,
    OrganizationController,
    // Registered ahead of TemplatesController: its @Get(":id") route would
    // otherwise match /templates/drafts before this controller ever sees it.
    TemplateDraftsController,
    TemplatesController,
    SessionsController,
    CandidateSessionAccessController,
    ResponsesController,
    CandidateResponsesAccessController,
    AiController,
    CandidateAiController,
    InterviewerFollowUpsController,
    CandidateInterviewerFollowUpsController,
    ReportsController,
    TranscriptController,
    AnalyticsController,
  ],
  providers: [
    AnalyticsService,
    SystemHealthService,
    AuthRateLimitGuard,
    CandidateAccessRateLimitGuard,
    CandidateAiService,
    DocumentExtractionService,
    DraftChatRateLimitGuard,
    DraftRateLimitGuard,
    JwtAuthGuard,
    RolesGuard,
    LiveKitService,
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
      provide: TemplateDraftsService,
      useFactory: (prisma: PrismaService, aiService: AiService, templatesService: TemplatesService) =>
        new TemplateDraftsService(prisma, aiService, templatesService),
      inject: [PrismaService, AiService, TemplatesService],
    },
    {
      provide: SessionsService,
      useFactory: (prisma: PrismaService, email: EmailService, gateway: InterviewGateway) =>
        new SessionsService(prisma, { emailService: email, events: gateway }),
      inject: [PrismaService, EmailService, InterviewGateway],
    },
    {
      provide: ResponsesService,
      useFactory: (prisma: PrismaService, gateway: InterviewGateway) => new ResponsesService(prisma, gateway),
      inject: [PrismaService, InterviewGateway],
    },
    {
      provide: TranscriptService,
      useFactory: (prisma: PrismaService) => new TranscriptService(prisma),
      inject: [PrismaService],
    },
    {
      provide: InterviewerFollowUpsService,
      useFactory: (prisma: PrismaService, gateway: InterviewGateway) => new InterviewerFollowUpsService(prisma, gateway),
      inject: [PrismaService, InterviewGateway],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(GlobalRateLimitMiddleware, RequestValidationMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
