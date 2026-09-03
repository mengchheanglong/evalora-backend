import type { Request } from "express";

/**
 * Resolves the client IP from the incoming request.
 * Uses Express's resolved `req.ip`, which safely honors `trust proxy`
 * configuration set in main.ts without blindly trusting raw client headers.
 */
export function resolveClientIp(request: Request): string {
  if (request.ip) {
    return request.ip;
  }

  const socketAddress = request.socket?.remoteAddress;
  if (socketAddress) {
    return socketAddress;
  }

  return "127.0.0.1";
}
