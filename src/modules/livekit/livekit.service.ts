import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AccessToken, type VideoGrant } from "livekit-server-sdk";

export type LiveKitParticipantRole = "candidate" | "interviewer";

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

@Injectable()
export class LiveKitService {
  getConfig(): LiveKitConfig {
    const url = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    if (!url || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        "LiveKit service is not configured. LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required.",
      );
    }

    return { url, apiKey, apiSecret };
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.LIVEKIT_URL?.trim() &&
        process.env.LIVEKIT_API_KEY?.trim() &&
        process.env.LIVEKIT_API_SECRET?.trim(),
    );
  }

  async createParticipantToken(input: {
    sessionId: string;
    identity: string;
    name: string;
    role: LiveKitParticipantRole;
  }): Promise<{ url: string; token: string }> {
    const { url, apiKey, apiSecret } = this.getConfig();

    const token = new AccessToken(apiKey, apiSecret, {
      identity: input.identity,
      name: input.name,
      ttl: "10m",
      metadata: JSON.stringify({ role: input.role, sessionId: input.sessionId }),
    });
    const grant: VideoGrant = {
      roomJoin: true,
      room: input.sessionId,
      canPublish: true,
      canSubscribe: true,
    };
    token.addGrant(grant);
    return { url, token: await token.toJwt() };
  }
}
