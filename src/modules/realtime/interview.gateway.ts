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
import type { SessionStatus } from "../../domain/evalora.types";
import { PrismaService } from "../../prisma/prisma.service";
import { TOKEN_PURPOSES, tryExtractAuthUserFromToken } from "../auth/auth.guard";
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
 * Authentication does async work (DB lookup for candidates), but Socket.IO
 * delivers `connect` to the client immediately.
 *
 * A client can therefore emit `join` before the handshake finishes.
 * Handlers await this promise to close that race.
 */
const authInFlight = new WeakMap<Socket, Promise<void>>();

function roomName(sessionId: string) {
  return `session:${sessionId}`;
}

/**
 * Loopback and RFC1918 ranges — the addresses a LAN demo is served from.
 */
const PRIVATE_HOSTNAME_PATTERN =
  /^(?:localhost|\[?::1\]?|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/i;

function configuredOrigins(): string[] {
  return (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, "").toLowerCase())
    .filter(Boolean);
}

function isPrivateNetworkOrigin(origin: string): boolean {
  try {
    return PRIVATE_HOSTNAME_PATTERN.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Decides per handshake which browser origins may open a socket.
 */
export function isAllowedRealtimeOrigin(
  requestOrigin: string | undefined,
  allowList = configuredOrigins(),
): boolean {
  // Non-browser clients do not send Origin.
  if (!requestOrigin) return true;

  // Nothing configured: preserve the existing fallback behavior.
  if (!allowList.length) return true;

  const normalized = requestOrigin.trim().replace(/\/$/, "").toLowerCase();

  if (allowList.includes(normalized)) return true;

  // Allow private LAN origins for local/demo use.
  return isPrivateNetworkOrigin(normalized);
}

/**
 * Real-time interview transport.
 *
 * Design rules:
 *
 * - REST remains authoritative.
 * - Socket events provide live UI updates.
 * - Reconnecting clients rebuild state from a session snapshot.
 * - Authorization is enforced before entering a session room.
 * - WebRTC media does NOT pass through this server.
 * - This gateway only exchanges WebRTC signaling messages:
 *      offer
 *      answer
 *      ICE candidates
 *      camera state
 */
@WebSocketGateway({
  namespace: "/interview",

  cors: {
    origin: (
      requestOrigin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => callback(null, isAllowedRealtimeOrigin(requestOrigin)),

    credentials: false,
  },

  /**
   * CORS only controls HTTP/polling response headers.
   *
   * allowRequest additionally protects the actual Socket.IO handshake.
   */
  allowRequest: (
    request: {
      headers?: Record<string, string | string[] | undefined>;
    },
    callback: (message: string | null, allowed: boolean) => void,
  ) => {
    const header = request.headers?.origin;

    const requestOrigin = Array.isArray(header)
      ? header[0]
      : header;

    // Same-origin and non-browser clients may have no Origin.
    if (!requestOrigin) {
      return callback(null, true);
    }

    return isAllowedRealtimeOrigin(requestOrigin)
      ? callback(null, true)
      : callback("origin_not_allowed", false);
  },
})
export class InterviewGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(InterviewGateway.name);

  /**
   * Cheap in-process counters powering the System Activity view.
   */
  private readonly counters = {
    connections: 0,
    disconnects: 0,
    joins: 0,
    rejectedJoins: 0,
    eventsEmitted: 0,
  };

  private readonly startedAt = Date.now();

  @WebSocketServer()
  server!: Server;

  /**
   * Explicit @Inject:
   *
   * The tsx/esbuild dev runtime does not emit design:paramtypes, so
   * type-only constructor injection can resolve to undefined.
   */
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  // ==============================================================
  // lifecycle
  // ==============================================================

  handleConnection(client: Socket) {
    this.counters.connections += 1;

    /**
     * Register authentication immediately.
     *
     * A join can arrive before authentication finishes.
     */
    authInFlight.set(client, this.authenticate(client));
  }

  private async authenticate(client: Socket) {
    try {
      const auth = (client.handshake.auth ?? {}) as {
        token?: string;
        ticket?: string;
        accessCode?: string;
        name?: string;
      };

      /**
       * Workspace user:
       *
       * Interviewer / owner / admin.
       *
       * Browser:
       * httpOnly session cookie -> realtime ticket -> Socket.IO
       *
       * Non-browser:
       * session JWT may be passed directly.
       */
      const credential = auth.ticket
        ? {
            value: auth.ticket,
            purpose: TOKEN_PURPOSES.realtimeTicket,
          }
        : auth.token
          ? {
              value: auth.token,
              purpose: TOKEN_PURPOSES.session,
            }
          : null;

      if (credential) {
        const user = tryExtractAuthUserFromToken(
          credential.value,
          credential.purpose,
        );

        if (!user) {
          return this.reject(
            client,
            "Your session expired. Sign in again.",
          );
        }

        sockets.set(client, {
          role: "interviewer",
          userId: user.id,
          name: auth.name?.slice(0, 80) || user.email,
          rooms: new Set(),
        });

        return;
      }

      // ------------------------------------------------------------
      // Candidate authentication
      // ------------------------------------------------------------

      /**
       * Candidate uses the private assessment access code.
       *
       * Never log the access code.
       */
      if (auth.accessCode) {
        const session = await this.findSessionByAccessCode(
          auth.accessCode,
        );

        if (!session) {
          return this.reject(
            client,
            "This assessment link is not valid.",
          );
        }

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
      this.logger.error(
        `Handshake failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      this.reject(
        client,
        "Could not establish the live connection. Retrying is safe.",
      );
    }
  }

  private reject(client: Socket, message: string) {
    client.emit(INTERVIEW_EVENTS.error, {
      message,
    });

    client.disconnect(true);
  }

  handleDisconnect(client: Socket) {
    this.counters.disconnects += 1;

    const identity = sockets.get(client);

    if (!identity) return;

    /**
     * Tell the remaining participant that this user left.
     */
    for (const sessionId of identity.rooms) {
      void this.broadcastPresence(sessionId);
    }

    sockets.delete(client);
  }

  // ==============================================================
  // rooms
  // ==============================================================

  @SubscribeMessage(INTERVIEW_EVENTS.joinSession)
  async joinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      sessionId?: string;
      accessCode?: string;
    },
  ): Promise<{
    ok: boolean;
    snapshot?: SessionSnapshot;
    message?: string;
  }> {
    try {
      await authInFlight.get(client);

      const identity = sockets.get(client);

      if (!identity) {
        return {
          ok: false,
          message: "Not authenticated.",
        };
      }

      const session = await this.resolveAuthorizedSession(
        identity,
        body,
      );

      if (!session) {
        this.counters.rejectedJoins += 1;

        return {
          ok: false,
          message: "Session not found or access denied.",
        };
      }

      this.counters.joins += 1;

      await client.join(roomName(session.id));

      identity.rooms.add(session.id);

      await this.broadcastPresence(session.id);

      /**
       * Reconnecting client gets the full current state.
       */
      return {
        ok: true,
        snapshot: await this.buildSnapshot(session.id),
      };
    } catch (error) {
      this.logger.error(
        `Join failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      return {
        ok: false,
        message: "Could not join the live session.",
      };
    }
  }

  @SubscribeMessage(INTERVIEW_EVENTS.leaveSession)
  async leaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      sessionId?: string;
    },
  ) {
    await authInFlight.get(client);

    const identity = sockets.get(client);

    const sessionId = body?.sessionId;

    if (
      !identity ||
      !sessionId ||
      !identity.rooms.has(sessionId)
    ) {
      return {
        ok: false,
      };
    }

    await client.leave(roomName(sessionId));

    identity.rooms.delete(sessionId);

    await this.broadcastPresence(sessionId);

    return {
      ok: true,
    };
  }

  // ==============================================================
  // camera / WebRTC signaling
  // ==============================================================

  /**
   * WebRTC OFFER
   *
   * Candidate:
   *
   *   createOffer()
   *        ↓
   *   Socket.IO
   *        ↓
   *   interviewer
   */
  @SubscribeMessage(INTERVIEW_EVENTS.cameraOffer)
  async cameraOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      sessionId?: string;
      targetUserId?: string;
      offer?: unknown;
    },
  ) {
    return this.forwardCameraSignal(
      client,
      INTERVIEW_EVENTS.cameraOffer,
      body,
    );
  }

  /**
   * WebRTC ANSWER
   *
   * Interviewer:
   *
   *   createAnswer()
   *        ↓
   *   Socket.IO
   *        ↓
   *   candidate
   */
  @SubscribeMessage(INTERVIEW_EVENTS.cameraAnswer)
  async cameraAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      sessionId?: string;
      targetUserId?: string;
      answer?: unknown;
    },
  ) {
    return this.forwardCameraSignal(
      client,
      INTERVIEW_EVENTS.cameraAnswer,
      body,
    );
  }

  /**
   * ICE candidate exchange.
   *
   * ICE candidates are exchanged in both directions.
   */
  @SubscribeMessage(INTERVIEW_EVENTS.cameraIceCandidate)
  async cameraIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      sessionId?: string;
      targetUserId?: string;
      candidate?: unknown;
    },
  ) {
    return this.forwardCameraSignal(
      client,
      INTERVIEW_EVENTS.cameraIceCandidate,
      body,
    );
  }

  /**
   * Camera enabled / disabled state.
   *
   * This is NOT the video stream.
   *
   * It only tells the other participant whether the camera is currently
   * enabled.
   */
  @SubscribeMessage(INTERVIEW_EVENTS.cameraState)
  async cameraState(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      sessionId?: string;
      state?: "enabled" | "disabled";
    },
  ) {
    await authInFlight.get(client);

    const identity = sockets.get(client);

    const sessionId = body?.sessionId;

    if (
      !identity ||
      !sessionId ||
      !identity.rooms.has(sessionId)
    ) {
      return {
        ok: false,
        message: "Not connected to this interview session.",
      };
    }

    /**
     * Broadcast camera state to everyone in the session.
     */
    this.server
      .to(roomName(sessionId))
      .emit(INTERVIEW_EVENTS.cameraState, {
        sessionId,
        userId: identity.userId,
        state:
          body.state === "enabled"
            ? "enabled"
            : "disabled",
      });

    return {
      ok: true,
    };
  }

  /**
   * Forward WebRTC signaling data to one specific participant.
   *
   * IMPORTANT:
   *
   * The backend never receives or stores the actual camera stream.
   *
   * It only forwards:
   *
   *   offer
   *   answer
   *   ICE candidate
   */
  private async forwardCameraSignal(
    client: Socket,
    event: string,
    body: {
      sessionId?: string;
      targetUserId?: string;
      [key: string]: unknown;
    },
  ) {
    await authInFlight.get(client);

    const identity = sockets.get(client);

    const sessionId = body?.sessionId;

    const targetUserId = body?.targetUserId;

    // ------------------------------------------------------------
    // Validate sender
    // ------------------------------------------------------------

    if (
      !identity ||
      !sessionId ||
      !identity.rooms.has(sessionId)
    ) {
      return {
        ok: false,
        message:
          "Not connected to this interview session.",
      };
    }

    // ------------------------------------------------------------
    // Validate target
    // ------------------------------------------------------------

    if (
      !targetUserId ||
      targetUserId === identity.userId
    ) {
      return {
        ok: false,
        message:
          "A valid target participant is required.",
      };
    }

    // ------------------------------------------------------------
    // Find session room
    // ------------------------------------------------------------

    const room =
      this.server.sockets.adapter.rooms.get(
        roomName(sessionId),
      );

    if (!room) {
      return {
        ok: false,
        message:
          "Interview session is not active.",
      };
    }

    // ------------------------------------------------------------
    // Find target socket
    // ------------------------------------------------------------

    for (const socketId of room) {
      const targetSocket =
        this.server.sockets.sockets.get(socketId);

      if (!targetSocket) continue;

      const targetIdentity =
        sockets.get(targetSocket);

      if (
        !targetIdentity ||
        targetIdentity.userId !== targetUserId
      ) {
        continue;
      }

      // ----------------------------------------------------------
      // Forward signaling message
      // ----------------------------------------------------------

      targetSocket.emit(event, {
        ...body,

        sessionId,

        /**
         * Receiver can identify who sent the message.
         */
        fromUserId: identity.userId,
      });

      return {
        ok: true,
      };
    }

    return {
      ok: false,
      message:
        "Target participant is not connected.",
    };
  }

  // ==============================================================
  // ping
  // ==============================================================

  /**
   * Lightweight liveness probe so clients can measure round-trip latency.
   */
  @SubscribeMessage(INTERVIEW_EVENTS.ping)
  ping(
    @MessageBody()
    body: {
      sentAt?: number;
    },
  ) {
    return {
      sentAt: body?.sentAt ?? null,
      serverTime: Date.now(),
    };
  }

  // ==============================================================
  // server-side API
  // ==============================================================

  /**
   * Called by services after a successful DB write.
   */
  emitToSession(
    sessionId: string,
    event: string,
    payload: unknown,
  ) {
    if (!this.server) return;

    this.counters.eventsEmitted += 1;

    this.server
      .to(roomName(sessionId))
      .emit(event, payload);
  }

  // ==============================================================
  // realtime stats
  // ==============================================================

  /**
   * Live transport stats for the System Activity dashboard.
   */
  getRealtimeStats() {
    const container =
      this.server as unknown as Record<
        string,
        unknown
      >;

    const nested =
      container.sockets as
        | Record<string, unknown>
        | undefined;

    const rooms =
      (
        container.adapter as
          | {
              rooms?: Map<string, Set<string>>;
            }
          | undefined
      )?.rooms ??
      (
        nested?.adapter as
          | {
              rooms?: Map<string, Set<string>>;
            }
          | undefined
      )?.rooms;

    const socketsById = (
      nested instanceof Map
        ? nested
        : (nested?.sockets as
            | Map<string, unknown>
            | undefined)
    ) as Map<string, unknown> | undefined;

    /**
     * Socket.IO also creates a room per socket ID.
     *
     * Only session:* rooms count as interview rooms.
     */
    const sessionRooms = rooms
      ? [...rooms.keys()].filter((key) =>
          key.startsWith("session:"),
        )
      : [];

    return {
      connectedSockets:
        socketsById?.size ?? 0,

      activeSessionRooms:
        sessionRooms.length,

      ...this.counters,

      uptimeSeconds: Math.round(
        (Date.now() - this.startedAt) /
          1000,
      ),
    };
  }

  // ==============================================================
  // presence
  // ==============================================================

  async broadcastPresence(sessionId: string) {
    if (!this.server) return;

    const participants =
      await this.participantsIn(sessionId);

    this.server
      .to(roomName(sessionId))
      .emit(
        INTERVIEW_EVENTS.presenceUpdated,
        {
          sessionId,
          participants,
        },
      );
  }

  private async participantsIn(
    sessionId: string,
  ): Promise<InterviewParticipant[]> {
    /**
     * @WebSocketServer() on a namespaced gateway yields the Namespace,
     * whose `.sockets` is a Map<id, Socket> and whose rooms live on
     * `.adapter`.
     *
     * Resolve both shapes so this works for a Namespace or root Server.
     */
    const container =
      this.server as unknown as Record<
        string,
        unknown
      >;

    const nested =
      container.sockets as
        | Record<string, unknown>
        | undefined;

    const rooms =
      (
        container.adapter as
          | {
              rooms?: Map<string, Set<string>>;
            }
          | undefined
      )?.rooms ??
      (
        nested?.adapter as
          | {
              rooms?: Map<string, Set<string>>;
            }
          | undefined
      )?.rooms;

    const socketsById = (
      nested instanceof Map
        ? nested
        : (nested?.sockets as
            | Map<string, Socket>
            | undefined)
    ) as Map<string, Socket> | undefined;

    const room = rooms?.get(
      roomName(sessionId),
    );

    if (!room || !socketsById) {
      return [];
    }

    const participants: InterviewParticipant[] =
      [];

    for (const socketId of room) {
      const socket =
        socketsById.get(socketId);

      const identity =
        socket && sockets.get(socket);

      if (!identity) continue;

      /**
       * One participant per person, not per browser tab.
       */
      if (
        participants.some(
          (item) =>
            item.userId === identity.userId,
        )
      ) {
        continue;
      }

      participants.push({
        userId: identity.userId,
        name: identity.name,
        role: identity.role,
      });
    }

    return participants;
  }

  // ==============================================================
  // authorization
  // ==============================================================

  private async resolveAuthorizedSession(
    identity: SocketIdentity,
    body: {
      sessionId?: string;
      accessCode?: string;
    },
  ) {
    // ------------------------------------------------------------
    // Candidate
    // ------------------------------------------------------------

    if (identity.role === "candidate") {
      /**
       * Candidate may only ever enter their own session.
       */
      const session = body.accessCode
        ? await this.findSessionByAccessCode(
            body.accessCode,
          )
        : null;

      if (
        !session ||
        session.candidateId !==
          identity.userId
      ) {
        return null;
      }

      return session;
    }

    // ------------------------------------------------------------
    // Interviewer / staff
    // ------------------------------------------------------------

    const sessionId = body.sessionId;

    if (!sessionId) return null;

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: identity.userId,
        },

        select: {
          role: true,
          organizationId: true,
        },
      });

    if (!user) return null;

    const session =
      await this.prisma.interviewSession.findUnique(
        {
          where: {
            id: sessionId,
          },

          select: {
            id: true,
            organizationId: true,
            candidateId: true,

            candidate: {
              select: {
                name: true,
              },
            },
          },
        },
      );

    if (!session) return null;

    /**
     * Admins are platform operators.
     *
     * Everyone else is scoped to their organization.
     */
    if (
      user.role !== "ADMIN" &&
      session.organizationId !==
        user.organizationId
    ) {
      return null;
    }

    return session;
  }

  // ==============================================================
  // candidate session lookup
  // ==============================================================

  private async findSessionByAccessCode(
    accessCode: string,
  ) {
    const normalized = String(
      accessCode,
    )
      .trim()
      .toUpperCase();

    if (!normalized) return null;

    return this.prisma.interviewSession.findFirst(
      {
        where: {
          accessCode: normalized,
        },

        select: {
          id: true,
          organizationId: true,
          candidateId: true,

          candidate: {
            select: {
              name: true,
            },
          },
        },
      },
    );
  }

  // ==============================================================
  // session snapshot
  // ==============================================================

  private async buildSnapshot(
    sessionId: string,
  ): Promise<SessionSnapshot> {
    const [
      session,
      followUps,
      participants,
    ] = await Promise.all([
      this.prisma.interviewSession.findUnique(
        {
          where: {
            id: sessionId,
          },

          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            expiresAt: true,
          },
        },
      ),

      this.prisma.interviewerFollowUp.findMany(
        {
          where: {
            sessionId,
          },

          orderBy: {
            sequence: "asc",
          },

          take: 200,

          select: {
            id: true,
            questionText: true,
            answerText: true,
            required: true,
            sequence: true,
            status: true,

            askedBy: {
              select: {
                name: true,
              },
            },
          },
        },
      ),

      this.participantsIn(sessionId),
    ]);

    return {
      sessionId,

      /**
       * Lowercase status so REST and WebSocket clients use the same format.
       */
      status: session
        ? (session.status.toLowerCase() as SessionStatus)
        : "not_started",

      startedAt:
        session?.startedAt?.toISOString(),

      completedAt:
        session?.completedAt?.toISOString(),

      participants,

      followUps: followUps.map(
        (followUp) => ({
          id: followUp.id,

          questionText:
            followUp.questionText,

          answerText:
            followUp.answerText ??
            undefined,

          required:
            followUp.required,

          sequence:
            followUp.sequence,

          status:
            followUp.status.toLowerCase() as
              | "sent"
              | "answered"
              | "cancelled",

          askedBy: {
            name:
              followUp.askedBy?.name ??
              "Interviewer",
          },
        }),
      ),

      serverTime: Date.now(),
    };
  }
}