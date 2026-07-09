import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { CodeController } from "./code.controller";
import { CodeService } from "./code.service";
import { Judge0Service } from "./judge0.service";
import { PistonService } from "./piston.service";

@Module({
  controllers: [CodeController],
  providers: [
    Judge0Service,
    PistonService,
    CodeService,
    {
      provide: PrismaClient,
      useFactory: () => new PrismaClient(),
    },
  ],
  exports: [CodeService, Judge0Service],
})
export class CodeModule {}