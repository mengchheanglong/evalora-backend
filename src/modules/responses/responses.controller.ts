import { Body, Controller, Get, Param, Post } from "@nestjs/common";

@Controller("responses")
export class ResponsesController {
  @Post()
  submit(@Body() body: { sessionId?: string; questionId?: string; responseText?: string }) {
    return {
      id: "response-demo",
      sessionId: body.sessionId ?? "demo-session",
      questionId: body.questionId ?? "question-demo",
      responseText: body.responseText ?? "",
      savedAt: new Date().toISOString(),
      message: "Response save scaffold. Add autosave/upsert behavior with Prisma.",
    };
  }

  @Get("session/:sessionId")
  findBySession(@Param("sessionId") sessionId: string) {
    return [
      {
        id: "response-demo",
        sessionId,
        questionId: "question-demo",
        responseText: "Demo response text",
        createdAt: new Date().toISOString(),
      },
    ];
  }
}
