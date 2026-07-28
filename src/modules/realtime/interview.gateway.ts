import { Inject, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { PrismaService } from "../../prisma/prisma.service";
import { tryExtractAuthUserFromHeader } from "../auth/auth.guard";
import {
  INTERVIEW_EVENTS,
  type InterviewParticipant,
  type ParticipantRole,
  type SessionSnapshot,
} from "./realtime.types";

/** Identity attached to each connected socket after a successful handshake. */
interface SocketIdentity {
  role: ParticipantRole;
  userId: string;
  name: string;
  /** Sessions this socket is currently joined to. */
  rooms: Set<string>;
}

const sockets = new WeakMap<Socket, SocketIdentity>();
/**
 * Authentication does async work (DB lookup for candidates), but socket.io
 * delivers `connect` to the client immediately — so a client can emit `join`
 * before the handshake finished. Handlers await this to close that race.
 */
const authInFlight = new WeakMap<Socket, Promise<void>>();

function roomName(sessionId: string) {
  return `session:${sessionId}`;
}

/**
 * Real-time interview transport.
 *
 * Design rules:
 *  - REST stays authoritative. Every event carries enough data for an immediate
 *    UI update, but a client that missed events recovers by re-joining (which
 *    returns a full snapshot) or by re-reading the REST endpoints.
 *  - Authorization is enforced on join, not just on connect: a socket may only
 *    enter a session room it can actually access (org ownership for staff, the
 *    private access code for candidates).
 */
@WebSocketGateway({
  namespace: "/interview",
  cors: {
    origin: (process.env.FRONTEND_URL ?? "").split(",").map((value) => value.trim()).filter(Boolean).length
      ? (process.env.FRONTEND_URL ?? "").split(",").map((value) => value.trim()).filter(Boolean)
      : true,
    credentials: false,
  },
})
export class InterviewGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(InterviewGateway.name);

  @WebSocketServer()
  server!: Server;

  // Explicit @Inject: the tsx/esbuild dev runtime does not emit
  // `design:paramtypes`, so type-only constructor injection resolves to
  // undefined there. The token keeps DI identical in dev and in the build.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- lifecycle

  handleConnection(client: Socket) {
    // Registered synchronously so a `join` that arrives before authentication
    // finishes can await it instead of being rejected as unauthenticated.
    authInFlight.set(client, this.authenticate(client));
  }

  private async authenticate(client: Socket) {
    // Any throw in a gateway lifecycle hook is unhandled and takes the whole
    // process down, so every failure here is converted into a clean disconnect.
    try {
      const auth = (client.handshake.auth ?? {}) as {
        token?: string;
        ticket?: string;
        accessCode?: string;
        name?: string;
      };

      // Workspace user (interviewer/owner/admin). Browsers keep the session JWT
      // in an httpOnly cookie, so they present a short-lived `ticket` from
      // POST /auth/realtime-ticket instead; `token` supports non-browser clients.
      const credential = auth.ticket ?? auth.token;
      if (credential) {
        const user = tryExtractAuthUserFromHeader(`Bearer ${credential}`);
        if (!user) return this.reject(client, "Your session expired. Sign in again.");
        sockets.set(client, { role: "interviewer", userId: user.id, name: auth.name?.slice(0, 80) || user.email, rooms: new Set() });
        return;
      }

      // Candidate — the private access code is the credential. Never logged.
      if (auth.accessCode) {
        const session = await this.findSessionByAccessCode(auth.accessCode);
        if (!session) return this.reject(client, "This assessment link is not valid.");
        sockets.set(client, {
          role: "candidate",
          userId: session.candidateId,
          name: session.candidate?.name ?? "Candidate",
          rooms: new Set(),
        });
        return;
      }

      this.reject(client, "Authentication is required.");
    } catch (error) {
      this.logger.error(`Handshake failed: ${error instanceof Error ? error.message : "unknown error"}`);
      this.reject(client, "Could not establish the live connection. Retrying is safe.");
    }
  }

  private reject(client: Socket, message: string) {
    client.emit(INTERVIEW_EVENTS.error, { message });
    client.disconnect(true);
  }

  handleDisconnect(client: Socket) {
    const identity = sockets.get(client);
    if (!identity) return;
    // Announce departure so the other side sees presence drop immediately.
    for (const sessionId of identity.rooms) {
      void this.broadcastPresence(sessionId);
    }
    sockets.delete(client);
  }

  // ---------------------------------------------------------------- rooms

  @SubscribeMessage(INTERVIEW_EVENTS.joinSession)
  async joinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string; accessCode?: string },
  ): Promise<{ ok: boolean; snapshot?: SessionSnapshot; message?: string }> {
    try {
      await authInFlight.get(client);
      const identity = sockets.get(client);
      if (!identity) return { ok: false, message: "Not authenticated." };

      const session = await this.resolveAuthorizedSession(identity, body);
      if (!session) return { ok: false, message: "Session not found or access denied." };

      await client.join(roomName(session.id));
      identity.rooms.add(session.id);
      await this.broadcastPresence(session.id);

      // A reconnecting client resumes from this snapshot — nothing is lost even
      // if it missed every event while offline.
      return { ok: true, snapshot: await this.buildSnapshot(session.id) };
    } catch (error) {
      this.logger.error(`Join failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false, message: "Could not join the live session." };
    }
  }

  @SubscribeMessage(INTERVIEW_EVENTS.leaveSession)
  async leaveSession(@ConnectedSocket() client: Socket, @MessageBody() body: { sessionId?: string }) {
    await authInFlight.get(client);
    const identity = sockets.get(client);
    const sessionId = body?.sessionId;
    if (!identity || !sessionId || !identity.rooms.has(sessionId)) return { ok: false };
    await client.leave(roomName(sessionId));
    identity.rooms.delete(sessionId);
    await this.broadcastPresence(sessionId);
    return { ok: true };
  }

  /** Lightweight liveness probe so clients can measure round-trip latency. */
  @SubscribeMessage(INTERVIEW_EVENTS.ping)
  ping(@MessageBody() body: { sentAt?: number }) {
    return { sentAt: body?.sentAt ?? null, serverTime: Date.now() };
  }

  // ------------------------------------------------------- server-side API

  /** Called by services after a successful DB write. */
  emitToSession(sessionId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(roomName(sessionId)).emit(event, payload);
  }

  async broadcastPresence(sessionId: string) {
    if (!this.server) return;
    const participants = await this.participantsIn(sessionId);
    this.server.to(roomName(sessionId)).emit(INTERVIEW_EVENTS.presenceUpdated, { sessionId, participants });
  }

  private async participantsIn(sessionId: string): Promise<InterviewParticipant[]> {
    // `@WebSocketServer()` on a namespaced gateway yields the Namespace, whose
    // `.sockets` is a Map<id, Socket> and whose rooms live on `.adapter`.
    // Resolve both shapes so this works for a Namespace or a root Server.
    const container = this.server as unknown as Record<string, unknown>;
    const nested = container.sockets as Record<string, unknown> | undefined;
    const rooms =
      ((container.adapter as { rooms?: Map<string, Set<string>> } | undefined)?.rooms ??
        (nested?.adapter as { rooms?: Map<string, Set<string>> } | undefined)?.rooms) ?? undefined;
    const socketsById = (nested instanceof Map ? nested : (nested?.sockets as Map<string, Socket> | undefined)) as
      | Map<string, Socket>
      | undefined;

    const room = rooms?.get(roomName(sessionId));
    if (!room || !socketsById) return [];

    const participants: InterviewParticipant[] = [];
    for (const socketId of room) {
      const socket = socketsById.get(socketId);
      const identity = socket && sockets.get(socket);
      if (!identity) continue;
      // One entry per person, not per tab.
      if (participants.some((item) => item.userId === identity.userId)) continue;
      participants.push({ userId: identity.userId, name: identity.name, role: identity.role });
    }
    return participants;
  }

  // ------------------------------------------------------------- internals

  private async resolveAuthorizedSession(identity: SocketIdentity, body: { sessionId?: string; accessCode?: string }) {
    if (identity.role === "candidate") {
      // Candidates may only ever enter their own session.
      const session = body.accessCode ? await this.findSessionByAccessCode(body.accessCode) : null;
      if (!session || session.candidateId !== identity.userId) return null;
      return session;
    }

    const sessionId = body.sessionId;
    if (!sessionId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: identity.userId },
      select: { role: true, organizationId: true },
    });
    if (!user) return null;
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { id: true, organizationId: true, candidateId: true, candidate: { select: { name: true } } },
    });
    if (!session) return null;
    // Admins are platform operators; everyone else is scoped to their workspace.
    if (user.role !== "ADMIN" && session.organizationId !== user.organizationId) return null;
    return session;
  }

  private async findSessionByAccessCode(accessCode: string) {
    const normalized = String(accessCode).trim().toUpperCase();
    if (!normalized) return null;
    return this.prisma.interviewSession.findFirst({
      where: { accessCode: normalized },
      select: { id: true, organizationId: true, candidateId: true, candidate: { select: { name: true } } },
    });
  }

  private async buildSnapshot(sessionId: string): Promise<SessionSnapshot> {
    const [session, followUps, participants] = await Promise.all([
      this.prisma.interviewSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, startedAt: true, completedAt: true, expiresAt: true },
      }),
      this.prisma.interviewerFollowUp.findMany({
        where: { sessionId },
        orderBy: { sequence: "asc" },
        take: 200,
        select: {
          id: true,
          questionText: true,
          answerText: true,
          required: true,
          sequence: true,
          status: true,
          askedBy: { select: { name: true } },
        },
      }),
      this.participantsIn(sessionId),
    ]);

    return {
      sessionId,
      status: session?.status ?? "NOT_STARTED",
      startedAt: session?.startedAt?.toISOString(),
      completedAt: session?.completedAt?.toISOString(),
      participants,
      followUps: followUps.map((followUp) => ({
        id: followUp.id,
        questionText: followUp.questionText,
        answerText: followUp.answerText ?? undefined,
        required: followUp.required,
        sequence: followUp.sequence,
        status: followUp.status.toLowerCase() as "sent" | "answered" | "cancelled",
        askedBy: { name: followUp.askedBy?.name ?? "Interviewer" },
      })),
      serverTime: Date.now(),
    };
  }
}
