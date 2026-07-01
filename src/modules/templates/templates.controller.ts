import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import type { AssessmentTemplateDto } from "../../domain/evalora.types";
import { templates } from "../mock-data";

@Controller("templates")
export class TemplatesController {
  @Get()
  findAll() {
    return templates;
  }

  @Post()
  create(@Body() body: Partial<AssessmentTemplateDto>) {
    return {
      id: body.id ?? "template-new",
      title: body.title ?? "Untitled Assessment",
      description: body.description ?? "New assessment template",
      roleType: body.roleType ?? "General Candidate",
      modules: body.modules ?? [],
      message: "Template creation scaffold. Persist with Prisma in implementation.",
    };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return templates.find((template) => template.id === id) ?? { message: "Template not found", id };
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() body: Partial<AssessmentTemplateDto>) {
    return {
      id,
      ...body,
      message: "Template update scaffold. Add authorization and Prisma update.",
    };
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return { id, message: "Template delete scaffold. Add authorization and Prisma delete." };
  }
}
