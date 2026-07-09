import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { CodeService } from "./code.service";
import { GradeCodeDto } from "./dto/grade-code.dto";
import { RunCodeDto } from "./dto/run-code.dto";
import { SubmitCodeDto } from "./dto/submit-code.dto";

@Controller("code")
export class CodeController {
  constructor(@Inject(CodeService) private readonly codeService: CodeService) {}

  @Post("run")
  run(@Body() body: RunCodeDto) {
    return this.codeService.runCode(body);
  }

  @Post("grade")
  grade(@Body() body: GradeCodeDto) {
    return this.codeService.gradeCode(body);
  }

  @Post("submit")
  submit(@Body() body: SubmitCodeDto) {
    return this.codeService.submitCode(body);
  }

  @Get("questions")
  questions() {
    return this.codeService.getQuestions();
  }

  @Get("submissions/:sessionId")
  submissions(@Param("sessionId") sessionId: string) {
    return this.codeService.listSubmissions(sessionId);
  }
}