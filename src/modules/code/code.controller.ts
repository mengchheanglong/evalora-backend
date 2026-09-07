import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ValidateDto } from "../../common/pipes/validate-dto.pipe";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { CandidateAccessRateLimitGuard } from "../sessions/access-rate-limit.guard";
import { CodeService } from "./code.service";
import { GradeCodeDto } from "./dto/grade-code.dto";
import { RunCodeDto } from "./dto/run-code.dto";
import { CandidateSubmitCodeDto, SubmitCodeDto } from "./dto/submit-code.dto";
import { CodeRateLimitGuard } from "./guards/rate-limit.guard";

@Controller("code")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "organization", "interviewer")
export class CodeController {
  constructor(@Inject(CodeService) private readonly codeService: CodeService) {}

  @Post("run")
  @UseGuards(CodeRateLimitGuard)
  run(@Body(new ValidateDto(RunCodeDto)) body: RunCodeDto) {
    return this.codeService.runCode(body);
  }

  @Post("grade")
  @UseGuards(CodeRateLimitGuard)
  grade(@Body(new ValidateDto(GradeCodeDto)) body: GradeCodeDto) {
    return this.codeService.gradeCode(body);
  }

  @Post("submit")
  @UseGuards(CodeRateLimitGuard)
  submit(@Body(new ValidateDto(SubmitCodeDto)) body: SubmitCodeDto, @Req() request: AuthenticatedRequest) {
    return this.codeService.submitCode(body, toAccessContext(request.user));
  }

  @Get("questions")
  @Roles("admin", "organization", "interviewer")
  questions() {
    return this.codeService.getQuestions();
  }

  @Get("submissions/:sessionId")
  @Roles("admin", "organization", "interviewer")
  submissions(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.codeService.listSubmissions(sessionId, toAccessContext(request.user));
  }
}

@Controller("code/access")
@UseGuards(CandidateAccessRateLimitGuard)
export class CandidateCodeAccessController {
  constructor(@Inject(CodeService) private readonly codeService: CodeService) {}

  @Get(":accessCode/questions")
  questions(@Param("accessCode") accessCode: string) {
    return this.codeService.getQuestionsByAccessCode(accessCode);
  }

  @Post(":accessCode/run")
  @UseGuards(CodeRateLimitGuard)
  run(
    @Param("accessCode") accessCode: string,
    @Body(new ValidateDto(RunCodeDto)) body: RunCodeDto,
  ) {
    return this.codeService.runCodeByAccessCode(accessCode, body);
  }

  @Post(":accessCode/grade")
  @UseGuards(CodeRateLimitGuard)
  grade(
    @Param("accessCode") accessCode: string,
    @Body(new ValidateDto(GradeCodeDto)) body: GradeCodeDto,
  ) {
    return this.codeService.gradeCodeByAccessCode(accessCode, body);
  }

  @Post(":accessCode/submit")
  @UseGuards(CodeRateLimitGuard)
  submit(
    @Param("accessCode") accessCode: string,
    @Body(new ValidateDto(CandidateSubmitCodeDto)) body: CandidateSubmitCodeDto,
  ) {
    return this.codeService.submitCodeByAccessCode(accessCode, body);
  }

  @Get(":accessCode/submissions")
  submissions(@Param("accessCode") accessCode: string) {
    return this.codeService.listSubmissionsByAccessCode(accessCode);
  }
}
