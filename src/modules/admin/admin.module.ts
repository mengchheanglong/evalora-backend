import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SystemHealthService } from "../analytics/system-health.service";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guard";
import { RealtimeModule } from "../realtime/realtime.module";
import { AdminController } from "./admin.controller";
import { AdminService, readAiCostPerTurnFromEnv } from "./admin.service";

@Module({
  // SystemHealthService measures on request and holds no state, so this module
  // owning its own instance (with the gateway it needs) keeps admin wiring
  // self-contained instead of reaching into AppModule's provider list.
  imports: [RealtimeModule],
  controllers: [AdminController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    SystemHealthService,
    {
      provide: AdminService,
      useFactory: (prisma: PrismaService, systemHealth: SystemHealthService) =>
        new AdminService(prisma, systemHealth, { costPerTurnUsd: readAiCostPerTurnFromEnv() }),
      inject: [PrismaService, SystemHealthService],
    },
  ],
})
export class AdminModule {}
