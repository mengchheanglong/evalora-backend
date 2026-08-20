import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as jwt from "jsonwebtoken";
import { ServiceUnavailableException } from "@nestjs/common";
import { LiveKitService } from "../src/modules/livekit/livekit.service";

test("isConfigured returns false when LiveKit env vars are not set", () => {
  const originalUrl = process.env.LIVEKIT_URL;
  const originalKey = process.env.LIVEKIT_API_KEY;
  const originalSecret = process.env.LIVEKIT_API_SECRET;

  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;

  try {
    const service = new LiveKitService();
    assert.equal(service.isConfigured(), false);
    assert.throws(
      () => service.getConfig(),
      ServiceUnavailableException,
    );
  } finally {
    if (originalUrl) process.env.LIVEKIT_URL = originalUrl;
    if (originalKey) process.env.LIVEKIT_API_KEY = originalKey;
    if (originalSecret) process.env.LIVEKIT_API_SECRET = originalSecret;
  }
});

test("createParticipantToken issues signed LiveKit token with video grants and metadata", async () => {
  const originalUrl = process.env.LIVEKIT_URL;
  const originalKey = process.env.LIVEKIT_API_KEY;
  const originalSecret = process.env.LIVEKIT_API_SECRET;

  process.env.LIVEKIT_URL = "wss://livekit.example.com";
  process.env.LIVEKIT_API_KEY = "test-api-key";
  process.env.LIVEKIT_API_SECRET = "test-api-secret-12345678901234567890";

  try {
    const service = new LiveKitService();
    assert.equal(service.isConfigured(), true);

    const result = await service.createParticipantToken({
      sessionId: "session-123",
      identity: "candidate:user-456",
      name: "Alice Candidate",
      role: "candidate",
    });

    assert.equal(result.url, "wss://livekit.example.com");
    assert.ok(typeof result.token === "string" && result.token.length > 0);

    // Verify token can be decoded with secret and contains correct video grants
    const decoded = jwt.verify(
      result.token,
      process.env.LIVEKIT_API_SECRET,
    ) as jwt.JwtPayload & {
      video?: {
        room?: string;
        roomJoin?: boolean;
        canPublish?: boolean;
        canSubscribe?: boolean;
      };
      metadata?: string;
    };

    assert.equal(decoded.sub, "candidate:user-456");
    assert.equal(decoded.name, "Alice Candidate");
    assert.equal(decoded.iss, "test-api-key");
    assert.equal(decoded.video?.room, "session-123");
    assert.equal(decoded.video?.roomJoin, true);
    assert.equal(decoded.video?.canPublish, true);
    assert.equal(decoded.video?.canSubscribe, true);

    const parsedMetadata = JSON.parse(decoded.metadata ?? "{}");
    assert.equal(parsedMetadata.role, "candidate");
    assert.equal(parsedMetadata.sessionId, "session-123");
  } finally {
    if (originalUrl) process.env.LIVEKIT_URL = originalUrl;
    else delete process.env.LIVEKIT_URL;
    if (originalKey) process.env.LIVEKIT_API_KEY = originalKey;
    else delete process.env.LIVEKIT_API_KEY;
    if (originalSecret) process.env.LIVEKIT_API_SECRET = originalSecret;
    else delete process.env.LIVEKIT_API_SECRET;
  }
});

test("createParticipantToken handles interviewer role correctly", async () => {
  const originalUrl = process.env.LIVEKIT_URL;
  const originalKey = process.env.LIVEKIT_API_KEY;
  const originalSecret = process.env.LIVEKIT_API_SECRET;

  process.env.LIVEKIT_URL = "wss://livekit.example.com";
  process.env.LIVEKIT_API_KEY = "test-api-key";
  process.env.LIVEKIT_API_SECRET = "test-api-secret-12345678901234567890";

  try {
    const service = new LiveKitService();
    const result = await service.createParticipantToken({
      sessionId: "session-789",
      identity: "interviewer:staff-001",
      name: "Interviewer Bob",
      role: "interviewer",
    });

    const decoded = jwt.verify(
      result.token,
      process.env.LIVEKIT_API_SECRET,
    ) as jwt.JwtPayload & { metadata?: string };

    assert.equal(decoded.sub, "interviewer:staff-001");
    assert.equal(decoded.name, "Interviewer Bob");
    const parsedMetadata = JSON.parse(decoded.metadata ?? "{}");
    assert.equal(parsedMetadata.role, "interviewer");
    assert.equal(parsedMetadata.sessionId, "session-789");
  } finally {
    if (originalUrl) process.env.LIVEKIT_URL = originalUrl;
    else delete process.env.LIVEKIT_URL;
    if (originalKey) process.env.LIVEKIT_API_KEY = originalKey;
    else delete process.env.LIVEKIT_API_KEY;
    if (originalSecret) process.env.LIVEKIT_API_SECRET = originalSecret;
    else delete process.env.LIVEKIT_API_SECRET;
  }
});
