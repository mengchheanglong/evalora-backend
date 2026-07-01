import { Body, Controller, Get, Param, Post } from "@nestjs/common";

@Controller("code")
export class CodeController {
  @Post("run")
  run(@Body() body: { language?: string; sourceCode?: string }) {
    return {
      language: body.language ?? "javascript",
      status: "sandbox_not_configured",
      stdout: "Code execution sandbox is not connected yet.",
      stderr: "",
      timeoutMs: 5000,
      safetyNotice: "Do not execute untrusted candidate code directly in the API process.",
    };
  }

  @Post("submit")
  submit(@Body() body: { sessionId?: string; language?: string; sourceCode?: string }) {
    return {
      id: "code-submission-demo",
      sessionId: body.sessionId ?? "demo-session",
      language: body.language ?? "javascript",
      saved: true,
      submittedAt: new Date().toISOString(),
    };
  }

  @Get("submissions/:sessionId")
  submissions(@Param("sessionId") sessionId: string) {
    return [
      {
        id: "code-submission-demo",
        sessionId,
        language: "javascript",
        executionStatus: "not_run",
        createdAt: new Date().toISOString(),
      },
    ];
  }
}
