import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { buildSessionOwnershipWhere, mergeWhere, type AccessContext } from "../auth/access-control";
import { InterviewGateway } from "../realtime/interview.gateway";

export type ServiceStatus = "operational" | "degraded" | "unavailable";

export interface ServiceHealth {
  key: string;
  name: string;
  detail: string;
  status: ServiceStatus;
  latencyMs?: number;
  note?: string;
}

export interface SystemHealthDto {
  capturedAt: string;
  realtime: {
    connectedSockets: number;
    activeSessionRooms: number;
    connections: number;
    disconnects: number;
    joins: number;
    rejectedJoins: number;
    eventsEmitted: number;
    uptimeSeconds: number;
    /** joins that succeeded / joins attempted — the reconnect success signal. */
    joinSuccessRate: number;
  };
  workload: {
    liveSessions: number;
    sessionsToday: number;
    completedToday: number;
    codeSubmissionsToday: number;
    interviewerQuestionsToday: number;
  };
  services: ServiceHealth[];
  process: {
    uptimeSeconds: number;
    heapUsedMb: number;
    rssMb: number;
    nodeVersion: string;
  };
}

/**
 * Operational view of the platform: live transport stats, current workload, and
 * dependency health. Everything is measured on request — there is no background
 * collector to keep in sync.
 */
@Injectable()
export class SystemHealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InterviewGateway) private readonly gateway: InterviewGateway,
  ) {}

  async snapshot(access?: AccessContext): Promise<SystemHealthDto> {
    const scope = buildSessionOwnershipWhere(access);
    const since = startOfToday();

    const [dbHealth, workload] = await Promise.all([
      this.checkDatabase(),
      this.loadWorkload(scope, since),
    ]);

    const realtimeStats = this.gateway.getRealtimeStats();
    const joinAttempts = realtimeStats.joins + realtimeStats.rejectedJoins;

    const services: ServiceHealth[] = [
      {
        key: "realtime",
        name: "Live session gateway",
        detail: "WebSocket rooms, presence, and event delivery",
        // The transport is in-process: if the API answered, it is up.
        status: "operational",
        latencyMs: 0,
        note: `${realtimeStats.connectedSockets} socket(s) in ${realtimeStats.activeSessionRooms} room(s)`,
      },
      dbHealth,
      this.describeProvider({
        key: "ai",
        name: "AI interview service",
        detail: "Question generation, follow-ups, and evaluation",
        configured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
        fallbackNote: "Deterministic rubric evaluation is used when no provider is configured.",
      }),
      this.describeProvider({
        key: "sandbox",
        name: "Code execution sandbox",
        detail: "Isolated compile and test runs",
        configured: Boolean(process.env.JUDGE0_API_URL?.trim() || process.env.PISTON_URL?.trim()),
        fallbackNote: "Set JUDGE0_API_URL or PISTON_URL to enable code execution.",
      }),
      this.describeProvider({
        key: "email",
        name: "Email delivery",
        detail: "Invites, verification, and password resets",
        configured: Boolean(process.env.RESEND_API_KEY?.trim() || process.env.SMTP_USER?.trim()),
        fallbackNote: "Links are surfaced in the UI when email is not configured.",
      }),
    ];

    const memory = process.memoryUsage();
    return {
      capturedAt: new Date().toISOString(),
      realtime: {
        ...realtimeStats,
        joinSuccessRate: joinAttempts ? Math.round((realtimeStats.joins / joinAttempts) * 100) : 100,
      },
      workload,
      services,
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
        rssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
        nodeVersion: process.version,
      },
    };
  }

  /** Round-trips a trivial query so the reported latency is real, not cached. */
  private async checkDatabase(): Promise<ServiceHealth> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - startedAt;
      return {
        key: "database",
        name: "Persistence layer",
        detail: "Sessions, responses, evaluations, and transcripts",
        status: latencyMs > 1_500 ? "degraded" : "operational",
        latencyMs,
        note: latencyMs > 1_500 ? "Elevated round-trip time to the database." : undefined,
      };
    } catch {
      return {
        key: "database",
        name: "Persistence layer",
        detail: "Sessions, responses, evaluations, and transcripts",
        status: "unavailable",
        note: "The database did not answer. Reads and writes will fail until it recovers.",
      };
    }
  }

  private async loadWorkload(scope: Record<string, unknown>, since: Date) {
    const sessionWhere = (extra: Record<string, unknown>) => mergeWhere(extra, scope) ?? extra;
    const [liveSessions, sessionsToday, completedToday, codeSubmissionsToday, interviewerQuestionsToday] =
      await Promise.all([
        this.prisma.interviewSession.count({ where: sessionWhere({ status: "IN_PROGRESS" }) }),
        this.prisma.interviewSession.count({ where: sessionWhere({ createdAt: { gte: since } }) }),
        this.prisma.interviewSession.count({ where: sessionWhere({ status: "COMPLETED", completedAt: { gte: since } }) }),
        this.prisma.codeSubmission.count({ where: { createdAt: { gte: since }, session: scope } }),
        this.prisma.interviewerFollowUp.count({ where: { sentAt: { gte: since }, session: scope } }),
      ]);
    return { liveSessions, sessionsToday, completedToday, codeSubmissionsToday, interviewerQuestionsToday };
  }

  private describeProvider(input: {
    key: string;
    name: string;
    detail: string;
    configured: boolean;
    fallbackNote: string;
  }): ServiceHealth {
    return {
      key: input.key,
      name: input.name,
      detail: input.detail,
      // "degraded" rather than "unavailable": each of these has a documented
      // fallback, so the platform keeps working without them.
      status: input.configured ? "operational" : "degraded",
      note: input.configured ? undefined : input.fallbackNote,
    };
  }
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
