import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { sessions } from "../mock-data";

@Controller("sessions")
export class SessionsController {
  @Post()
  create(@Body() body: { candidateName?: string; templateId?: string }) {
    return {
      id: "session-new",
      candidateName: body.candidateName ?? "New Candidate",
      templateId: body.templateId ?? "software-engineer",
      status: "not_started",
      accessCode: "NEW-DEMO",
      message: "Session creation scaffold. Generate secure access code in implementation.",
    };
  }

  @Get()
  findAll() {
    return sessions;
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return sessions.find((session) => session.id === id) ?? { message: "Session not found", id };
  }

  @Put(":id/start")
  start(@Param("id") id: string) {
    return { id, status: "in_progress", startedAt: new Date().toISOString() };
  }

  @Put(":id/complete")
  complete(@Param("id") id: string) {
    return {
      id,
      status: "completed",
      completedAt: new Date().toISOString(),
      next: `/api/reports/${id}`,
    };
  }
}
