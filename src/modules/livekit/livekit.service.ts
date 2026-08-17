import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AccessToken, type VideoGrant } from "livekit-server-sdk";

export type LiveKitParticipantRole = "candidate" | "interviewer";

@Injectable()
export class LiveKitService {
  private readonly url = requiredEnv("LIVEKIT_URL");
  private readonly apiKey = requiredEnv("LIVEKIT_API_KEY");
  private readonly apiSecret = requiredEnv("LIVEKIT_API_SECRET");

  async createParticipantToken(input: {
    sessionId: string;
    identity: string;
    name: string;
    role: LiveKitParticipantRole;
  }): Promise<{ url: string; token: string }> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
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
    return { url: this.url, token: await token.toJwt() };
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ServiceUnavailableException(`${name} is required for LiveKit.`);
  }
  return value;
}
