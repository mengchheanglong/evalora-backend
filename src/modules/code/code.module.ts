import { Module } from "@nestjs/common";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guard";
import { CandidateCodeAccessController, CodeController } from "./code.controller";
import { CodeExecutionService } from "./code-execution.service";
import { CodeService } from "./code.service";
import { CodeRateLimitGuard } from "./guards/rate-limit.guard";
import { Judge0Service } from "./judge0.service";
import { PistonService } from "./piston.service";
import { PrismaService } from "./prisma.service";

@Module({
  controllers: [CodeController, CandidateCodeAccessController],
  providers: [
    Judge0Service,
    PistonService,
    CodeExecutionService,
    CodeService,
    PrismaService,
    CodeRateLimitGuard,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [CodeService, PrismaService],
})
export class CodeModule {}
