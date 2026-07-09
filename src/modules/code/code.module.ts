import { Module } from "@nestjs/common";
import { CodeController } from "./code.controller";
import { CodeService } from "./code.service";
import { CodeRateLimitGuard } from "./guards/rate-limit.guard";
import { PistonService } from "./piston.service";
import { PrismaService } from "./prisma.service";

@Module({
  controllers: [CodeController],
  providers: [PistonService, CodeService, PrismaService, CodeRateLimitGuard],
  exports: [CodeService, PrismaService],
})
export class CodeModule {}
