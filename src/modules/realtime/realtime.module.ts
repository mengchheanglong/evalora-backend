import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { InterviewGateway } from "./interview.gateway";
import { LiveKitController } from "./livekit.controller";
import { LiveKitService } from "./livekit.service";

@Module({
  imports: [
    PrismaModule,
  ],

  controllers: [
    LiveKitController,
  ],

  providers: [
    InterviewGateway,
    LiveKitService,
  ],

  exports: [
    InterviewGateway,
    LiveKitService,
  ],
})
export class RealtimeModule {}