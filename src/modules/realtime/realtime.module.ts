import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { InterviewGateway } from "./interview.gateway";

@Module({
  imports: [PrismaModule],
  providers: [InterviewGateway],
  exports: [InterviewGateway],
})
export class RealtimeModule {}
