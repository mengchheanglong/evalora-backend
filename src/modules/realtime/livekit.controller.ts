import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { PrismaService } from "../../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";

import {
  TOKEN_PURPOSES,
  tryExtractAuthUserFromToken,
} from "../auth/auth.guard";

interface CreateTokenBody {
  sessionId?: string;
  accessCode?: string;
}

@Controller("realtime/livekit")
export class LiveKitController {
  constructor(
    @Inject(LiveKitService)
    private readonly liveKitService: LiveKitService,

    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  @Post("token")
  async createToken(
    @Req() request: Request,
    @Body() body: CreateTokenBody,
  ) {
    console.log("[LiveKit] Token request received", {
      sessionId: body.sessionId,
      hasAccessCode: Boolean(body.accessCode),
      hasAuthorization: Boolean(
        request.headers.authorization,
      ),
    });

    if (!body.sessionId) {
      throw new BadRequestException(
        "sessionId is required.",
      );
    }

    /**
     * ---------------------------------------------------------
     * Find interview session
     * ---------------------------------------------------------
     */
    const session =
      await this.prisma.interviewSession.findUnique({
        where: {
          id: body.sessionId,
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
      });

    if (!session) {
      throw new UnauthorizedException(
        "Interview session not found.",
      );
    }

    /**
     * ---------------------------------------------------------
     * Candidate
     * ---------------------------------------------------------
     *
     * Candidate authenticates with assessment access code.
     */
    if (body.accessCode) {
      const normalizedAccessCode =
        body.accessCode
          .trim()
          .toUpperCase();

      const candidateSession =
        await this.prisma.interviewSession.findFirst({
          where: {
            id: body.sessionId,
            accessCode: normalizedAccessCode,
          },
          select: {
            id: true,
            candidateId: true,
            candidate: {
              select: {
                name: true,
              },
            },
          },
        });

      if (!candidateSession) {
        throw new UnauthorizedException(
          "Invalid assessment access code.",
        );
      }

      console.log(
        "[LiveKit] Creating candidate token",
        {
          sessionId:
            candidateSession.id,
          candidateId:
            candidateSession.candidateId,
        },
      );

      const result =
        await this.liveKitService.createToken({
          sessionId:
            candidateSession.id,

          participantId:
            candidateSession.candidateId,

          participantName:
            candidateSession.candidate?.name ??
            "Candidate",

          role: "candidate",
        });

      console.log(
        "[LiveKit] Candidate token created",
      );

      return result;
    }

    /**
     * ---------------------------------------------------------
     * Interviewer
     * ---------------------------------------------------------
     *
     * Interviewer uses the normal Evalora
     * authentication token.
     */
    const authorization =
      request.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      throw new UnauthorizedException(
        "Authentication is required.",
      );
    }

    const token =
      authorization
        .slice("Bearer ".length)
        .trim();

    const user =
      tryExtractAuthUserFromToken(
        token,
        TOKEN_PURPOSES.session,
      );

    if (!user) {
      throw new UnauthorizedException(
        "Invalid or expired authentication token.",
      );
    }

    console.log(
      "[LiveKit] Authenticated interviewer",
      {
        userId: user.id,
      },
    );

    const dbUser =
      await this.prisma.user.findUnique({
        where: {
          id: user.id,
        },
        select: {
          id: true,
          email: true,
          role: true,
          organizationId: true,
        },
      });

    if (!dbUser) {
      throw new UnauthorizedException(
        "User not found.",
      );
    }

    /**
     * ---------------------------------------------------------
     * Organization authorization
     * ---------------------------------------------------------
     */
    if (
      dbUser.role !== "ADMIN" &&
      dbUser.organizationId !==
        session.organizationId
    ) {
      throw new UnauthorizedException(
        "You are not authorized to view this interview.",
      );
    }

    console.log(
      "[LiveKit] Creating interviewer token",
      {
        sessionId: session.id,
        userId: dbUser.id,
      },
    );

    const result =
      await this.liveKitService.createToken({
        sessionId: session.id,

        participantId: dbUser.id,

        participantName:
          dbUser.email,

        role: "interviewer",
      });

    console.log(
      "[LiveKit] Interviewer token created",
    );

    return result;
  }
}