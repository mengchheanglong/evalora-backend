import { Module } from "@nestjs/common";
import { InterviewGateway } from "./interview.gateway";

@Module({
  providers: [InterviewGateway],
  exports: [InterviewGateway],
})
export class RealtimeModule {}
