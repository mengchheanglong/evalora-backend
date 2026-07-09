import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Owns the Prisma connection lifecycle. Extending PrismaClient lets services
 * inject this class directly while guaranteeing the pool is drained on shutdown
 * instead of leaking connections.
 *
 * Startup eagerly warms the pool, but a connection failure is logged rather than
 * fatal: most routes (health, coding questions, code execution) do not touch the
 * database, so a transient DB outage or a DB that comes up slightly after the API
 * should not take the whole service down. Prisma reconnects lazily on first query.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.error(
        `Failed to connect to the database on startup; will retry on first query. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
