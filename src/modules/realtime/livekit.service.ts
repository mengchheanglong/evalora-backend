import { Injectable } from "@nestjs/common";
import {
  AccessToken,
  TrackSource,
} from "livekit-server-sdk";

export type LiveKitParticipantRole =
  | "candidate"
  | "interviewer";

export interface CreateLiveKitTokenInput {
  sessionId: string;
  participantId: string;
  participantName: string;
  role: LiveKitParticipantRole;
}

@Injectable()
export class LiveKitService {
  private readonly livekitUrl =
    process.env.LIVEKIT_URL;

  private readonly apiKey =
    process.env.LIVEKIT_API_KEY;

  private readonly apiSecret =
    process.env.LIVEKIT_API_SECRET;

  constructor() {
    if (
      !this.livekitUrl ||
      !this.apiKey ||
      !this.apiSecret
    ) {
      throw new Error(
        "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured.",
      );
    }

    console.log("[LiveKit] Configuration:", {
      url: this.livekitUrl,
      apiKey: this.apiKey ? "SET" : "MISSING",
      apiSecret: this.apiSecret
        ? "SET"
        : "MISSING",
    });
  }

  async createToken(
    input: CreateLiveKitTokenInput,
  ): Promise<{
    token: string;
    url: string;
    roomName: string;
    identity: string;
    role: LiveKitParticipantRole;
  }> {
    const roomName =
      `assessment-${input.sessionId}`;

    const identity =
      `${input.role}-${input.participantId}`;

    const token =
      new AccessToken(
        this.apiKey,
        this.apiSecret,
        {
          identity,
          name: input.participantName,
          ttl: "10m",
        },
      );

    if (input.role === "candidate") {
      token.addGrant({
        roomJoin: true,
        room: roomName,

        canPublish: true,

        canPublishSources: [
          TrackSource.CAMERA,
        ],

        canSubscribe: false,

        canPublishData: false,
      });
    } else {
      token.addGrant({
        roomJoin: true,
        room: roomName,

        canPublish: false,

        canSubscribe: true,

        canPublishData: false,
      });
    }

    const jwt =
      await token.toJwt();

    console.log(
      "[LiveKit] Token generated",
      {
        roomName,
        role: input.role,
        identity,
        tokenLength: jwt.length,
        tokenPrefix:
          jwt.slice(0, 20) + "...",
        url: this.livekitUrl,
      },
    );

    return {
      token: jwt,
      url: this.livekitUrl as string,
      roomName,
      identity,
      role: input.role,
    };
  }
}