import { Module } from "@nestjs/common";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guard";
import { CandidateAccessRateLimitGuard } from "../sessions/access-rate-limit.guard";
import { CandidateCodeAccessController, CodeController } from "./code.controller";
import { CodeExecutionService } from "./code-execution.service";
import { CodeService } from "./code.service";
import { CodeRateLimitGuard } from "./guards/rate-limit.guard";
import { Judge0Service } from "./judge0.service";
import { PistonService } from "./piston.service";

@Module({
  controllers: [CodeController, CandidateCodeAccessController],
  providers: [
    Judge0Service,
    PistonService,
    CodeExecutionService,
    CodeService,
    CodeRateLimitGuard,
    CandidateAccessRateLimitGuard,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [CodeService],
})
export class CodeModule {}
